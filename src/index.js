import * as crypto from './crypto';
import * as image from './image';
import * as storage from './storage';
import { setupCSS } from './styling';


// Global variables, to be initialised in main setup function
let token;
let keyPair;
let latestCertByIssuer;

let groupDataList = [];
let groupDataByVer = new Map();
let groupDataByOwnerAndName = new Map();
let currentGroupData;

// Process user input and execute commands if applicable
async function processUserInput(input, files) {
    if (input === '!keypair') {
        keyPair = await crypto.generateKeyPair();
        console.log("generated key pair", keyPair);
        storage.storeKeyPair(keyPair);
    }
    else if (input === '!cert') {
        let c = crypto.generateCertificate(keyPair, getUsername());
        console.log('generated cert', c);
        sendMessage(c);
    }
    else if (input.startsWith('!newgroup')) {
        let groupName = input.substring('!newgroup'.length).trim().replaceAll(' ', '-');
        createGroup(groupName);
    }
    else if (input.startsWith('!add')) {
        tryAddUsers(...input.substring('!add'.length).trim().split(/\s+/));
    }
    else if (input.startsWith('!rm')) {
        tryRemoveUsers(input.substring('!rm'.length).trim().split(/\s+/));
    }
    else {
        if (currentGroupData) {
            input = crypto.encrypt(currentGroupData, input);

            let encryptedFiles = [];
            let fileMetadata = [];
            for (const file of files) {
                let imageData = await image.getImageData(file);
                let {encryptedImageData, metadata} = crypto.encryptImageData(currentGroupData, imageData);

                encryptedFiles.push(await image.imageDataToFile(encryptedImageData));
                fileMetadata.push(metadata);
            }

            console.log('sending', input, encryptedFiles, fileMetadata);
            sendMessage(input, encryptedFiles, fileMetadata);
        } else {
            alert('No group/symmetric key in place yet');
        }
    }
}


// Process a newly added message node, decrypting encrypted messages where possible
// Take action when certificates or group data are received
function processMessage(messageNode) {
    // check for the specific format of our messages
    let formatCorrect = messageNode.children.length === 2
                    && messageNode.children[0].tagName.toLowerCase() === 'span'
                    && messageNode.children[0].innerText.trim() === '~'
                    && messageNode.children[1].tagName.toLowerCase() === 'code';

    if (!formatCorrect) {
        // wrap for styling purposes
        messageNode.innerHTML = `<div>${messageNode.innerHTML}</div>`;
        messageNode.classList.add('plaintext');
        return;
    }

    let originalText = messageNode.children[1].innerText;
    let text = originalText.split('|')[0]; // | is the separator for attatchment info

    // extract message timestamp from discord message snowflake id
    // https://discord.com/developers/docs/reference#snowflakes
    let messageId = messageNode.id.match(/-(\d+)/)[1];
    let messageTimestamp = Number((BigInt(messageId) >> 22n) + 1420070400000n);

    if (text.startsWith('-----BEGIN')) {
        // Process certificate message
        let success = storage.addCertificate(text, latestCertByIssuer);
        if (success) {
            storage.storeCertificates(latestCertByIssuer); // only store if something changed
        }
        messageNode.innerHTML = `<div><p class="encrypted">${originalText}</p></div>`;
        messageNode.classList.add('control');
    }
    else if (text.startsWith('_')) {
        // Process group data exchange message
        let result = '';
        let gd = crypto.decryptGroupDataWithPrivateKey(keyPair.privateKey, text.substring(1));
        console.log(gd);
        if (gd) {
            if (!groupDataByVer.has(gd.ver)) { // this key is new to us, process it
                // TODO verify owner of group (as specified in gd) matches message owner (digital signature)
                addGroupData(gd);
                storage.storeGroupData(groupDataList);
                // auto join if no current group, or if we just got a new key for our current group
                if (!currentGroupData
                    || (gd.ts > currentGroupData.ts
                        && gd.owner+'/'+gd.name === currentGroupData.owner+'/'+currentGroupData.name)
                ) {
                    currentGroupData = gd;
                    storage.storeCurrentGroupData(gd);
                }
                setupCurrentGroupSelection(); // since the groups have changed
            }
            // Show the message even if we already have previously processed it
            result = `Added to group "${gd.owner}/${gd.name}" (${gd.mem.join(', ')})`;
        }
        messageNode.innerHTML = `<div><p class="encrypted">${originalText}</p><p class="decrypted">${result}</p></div>`;
        messageNode.classList.add('control');
    }
    else {
        try {
            let [decrypted, gdUsed] = crypto.decrypt(groupDataByVer, text);
            let warn = gdUsed !== groupDataByOwnerAndName.get(gdUsed.owner+'/'+gdUsed.name)[0]
                        && messageTimestamp > gdUsed.revokedAt;
            let groupInfo = `<span style="font-size:2.5em">`
                            +`${warn?"OLD KEY&emsp;":""}${gdUsed.owner}/${gdUsed.name}&emsp;`
                            +`</span>`;
            messageNode.innerHTML = `<div>`
                                    +`<p class="encrypted">${groupInfo}${originalText}</p>`
                                    +`<p class="decrypted">${decrypted}</p>`
                                    +`</div>`;
            messageNode.classList.add('encrypted');
            if (warn) {
                messageNode.classList.add('old');
            }
        } catch { // if there's an error decrypting, just treat as plaintext
            messageNode.innerHTML = `<div>${messageNode.innerHTML}</div>`;
            messageNode.classList.add('plaintext');
        }
    }

    let originalTextNode = document.createElement('div'); // keep a copy of the original text eg for use in processImage
    originalTextNode.textContent = originalText;
    originalTextNode.style.display = 'none';
    originalTextNode.classList.add('original');
    messageNode.appendChild(originalTextNode);
}


let decryptedImageCache = new Map();

// Process a newly added image node by looking at the message it's linked to for metadata
// Decrypt if possible, and swap the decrypted data in
async function processImage(img) {
    // remove the width and height parameters on the src, since we can't decrypt a completely compressed image
    let src = img.src.replace(/&?(?:width|height)=[^&]*/g, '');
    if (decryptedImageCache.has(src)) {
        img.src = decryptedImageCache.get(src);
        return;
    }

    let messageNode = img.closest('li').querySelector('[class*=messageContent]');
    let originalTextNode = messageNode.querySelector('.original');
    if (!originalTextNode) {
        return; // don't need to do anything to the image
    }

    // find which image we are - which message attatchment field applies to us
    let imageIndex = Array.from(img.closest('[class*=mediaAttachmentsContainer]')
                        .querySelectorAll('div[class*=loadingOverlay]')).indexOf(img.parentNode);
    let text = originalTextNode.innerText;
    text = text.split('|')[imageIndex+1] // | is the separator for attatchment info

    // need to do this fetch because just drawing the img data onto a canvas doesn't let you extract the imageData
    // see https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_enabled_image
    const response = await fetch(src); // load full image so we can decrypt it properly!
    const blob = await response.blob();
    let imageData = await image.getImageData(blob);

    let decryptedImageData = crypto.decryptImageData(groupDataByVer, text, imageData);
    let decryptedDataUrl = image.imageDataToDataURL(decryptedImageData);
    decryptedImageCache.set(src, decryptedDataUrl);
    img.src = decryptedDataUrl;
}

function getUsername() {
    return document.querySelector("[class*=nameTag] [class*=hovered]").textContent;
}

// Send a message in our custom format (~`message`) using the Discord API
// Allows including files (images!) to be sent with the message
function sendMessage(message, files=[], fileMetadata=[]) {
    let segments = window.location.pathname.split("?")[0].split("/");
    let channelId = segments[segments.length-1];

    fileMetadata.forEach(fm => {message += '|' + fm});

    // start with ~ (just as a flag), then surround in code block
    message = '~`' + message.replaceAll('`', '\\`') + '`'

    const formData = new FormData();
    formData.append('content', message);
    files.forEach((file, idx) => formData.append(`files[${idx}]`, file));

    // Send the API request
    fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
        "method": "POST",
        "headers": {
            "authorization": token
        },
        "body": formData,
        "credentials": "include"
    })
    // .then(response => response.json())
    // .then(data => console.log('API Response:', data))
    // .catch(error => console.error('API Error:', error));
}

// Paste a file object into the main (original) textbox on discord
// Unlike keydown events, synthesised paste event seem to work fine
// Still requires the user to hit enter to send the file manually
function pasteFile(file) {
    let pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer()
    });
    pasteEvent.clipboardData.items.add(file);

    let targetTextbox = document.querySelector("div[role=textbox]");
    targetTextbox.dispatchEvent(pasteEvent);
}


function tryAddUsers(...usersToAdd) {
    if (currentGroupData.owner !== getUsername()) {
        alert(`You don't own the current group "${currentGroupData.owner}/${currentGroupData.name}"`);
        return;
    }
    modifyGroupAndShare(m => [...m, ...usersToAdd]);
}

function tryRemoveUsers(...usersToRemove) {
    if (currentGroupData.owner !== getUsername()) {
        alert(`You don't own the current group "${currentGroupData.owner}/${currentGroupData.name}"`);
        return;
    }
    modifyGroupAndShare(m => m.filter(user => !usersToRemove.includes(user)));
}

function modifyGroupAndShare(modifyFunc) {
    let gd = crypto.generateGroupData(currentGroupData.owner, currentGroupData.name, modifyFunc(currentGroupData.mem), currentGroupData);
    console.log('created new group', gd);

    addGroupData(gd);
    storage.storeGroupData(groupDataList);
    currentGroupData = gd;
    storage.storeCurrentGroupData(gd);
    setupCurrentGroupSelection(); // since the groups have changed

    let us = getUsername();
    for (const user of gd.mem) {
        if (user !== us) {
            let userCert = latestCertByIssuer.get(user);
            if (userCert) {
                let m = crypto.encryptGroupDataForCertificateIssuer(userCert, currentGroupData)
                sendMessage('_' + m); // _ to separate from other message types
            }
        }
    }
}

function createGroup(groupName) {
    let gd = crypto.generateGroupData(getUsername(), groupName, [getUsername()]);
    console.log('created new group', gd);

    addGroupData(gd);
    storage.storeGroupData(groupDataList);
    currentGroupData = gd;
    storage.storeCurrentGroupData(gd);
    setupCurrentGroupSelection(); // since the groups have changed
}


// Create and insert a container for the textbox etc. above the existing message input
function setupEncryptedContainer() {
    let encryptedInputContainer = document.createElement('div');
    encryptedInputContainer.classList.add('encryptInput');
    let formDiv = document.querySelector('form > div');
    formDiv.prepend(encryptedInputContainer);

    setupTextbox();
    setupCurrentGroupSelection();
}

// Store the list of files to be sent with the rest of user input
let currentFiles = [];

// Add an input textbox to the DOM for interacting with this script
function setupTextbox() {
    // A container to hold 'uploaded' files
    let displayedFiles = document.createElement('div');
    displayedFiles.id = 'displayedFiles';
    document.querySelector('.encryptInput').append(displayedFiles);

    function addToDisplayed(file) {
        const reader = new FileReader();
        reader.onload = function (event) {
            let img = document.createElement('img');
            img.src = event.target.result;
            img.addEventListener('click', () => {
                displayedFiles.removeChild(img);
                let idx = currentFiles.indexOf(file);
                if (idx !== -1) {
                    currentFiles.splice(idx, 1);
                }
            })
            displayedFiles.appendChild(img);
        }
        reader.readAsDataURL(file);
    }

    // Add file input to container
    let fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.multiple = true;
    fileInput.addEventListener('change', function (event) {
        Array.from(event.target.files).forEach(file => {
            currentFiles.push(file);
            addToDisplayed(file);
        });
    })
    document.querySelector('.encryptInput').append(fileInput);


    // Create the actual textbox
    let textbox = document.createElement('input');
    textbox.classList.add(
        ...document.querySelector('form [class*=scrollable]').classList, // background etc of the default textbox div
        ...document.querySelector('form [role*=textbox]').classList.values()
            .filter(c => !c.match(/slateTextArea/)), // font and text area properties (but not the positioning class)
    )

    textbox.setAttribute('type', 'text');
    textbox.setAttribute('placeholder', 'Enter message to encrypt...');

    // Add event listener to the textbox for keydown event
    textbox.addEventListener('keydown', async function(event) {
        if (event.key === "Enter") {
            event.preventDefault();

            processUserInput(textbox.value, currentFiles);

            textbox.value = '';
            currentFiles = [];
            displayedFiles.innerHTML = '';
        }
    });

    // Add event listener for paste event, handle image paste separately
    textbox.addEventListener('paste', async function(event) {
        let items = (event.clipboardData || event.originalEvent.clipboardData).items;

        console.log('items', items);
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                let file = items[i].getAsFile();
                currentFiles.push(file);
                addToDisplayed(file);
            }
        }
    });

    // Add textbox to container
    document.querySelector('.encryptInput').append(textbox);
}

// Add a select element to allow for choosing which group you want active. If it exists, refresh the possible options
function setupCurrentGroupSelection() {
    let select = document.createElement('select'); // create a new one and add it

    // sort by the map value ([1])'s latest key ([0])'s creation timestamp, then return just the map keys
    let sortedKeys = [...groupDataByOwnerAndName.entries()].sort((a, b) => a[1][0].ts - b[1][0].ts).map(x => x[0]);
    for (const ownerName of sortedKeys) {
        let option = document.createElement('option');
        option.textContent = ownerName;
        option.value = ownerName;
        option.selected = currentGroupData && (ownerName === currentGroupData.owner + '/' + currentGroupData.name);
        select.appendChild(option);
    }

    let encryptedInputContainer = document.querySelector('.encryptInput');
    let existingSelect = encryptedInputContainer.querySelector('select');
    if (existingSelect) {
        existingSelect.replaceWith(select);
    } else {
        encryptedInputContainer.append(select);
    }

    select.addEventListener('change', function (event) {
        let selectedOption = event.target.value;
        console.log('selected', selectedOption);
        let gd = groupDataByOwnerAndName.get(selectedOption)[0]; // latest groupData for that group
        currentGroupData = gd;
        storage.storeCurrentGroupData(gd);
    });
}

// Add buttons to user profile to allow adding or removing them from the current group
function setupProfileButtons(userPopoutInner) {
    let name = userPopoutInner.querySelector('span[class*=userTagUsernameBase]').textContent;
    if (name === getUsername() || !currentGroupData) {
        return; // don't want to do anything for ourselves, or if no current group selected
    }

    let container = document.createElement('div');
    container.classList.add('profileButtonContainer');

    let button = document.createElement('div');
    button.classList.add('profileButton');
    if (currentGroupData.mem.includes(name)) {
        button.innerText = `Remove from "${currentGroupData.owner}/${currentGroupData.name}"`;
        button.onclick = () => {
            tryRemoveUsers(name);
            userPopoutInner.remove(); // 'close' the popout
        }
    } else {
        button.innerText = `Add to "${currentGroupData.owner}/${currentGroupData.name}"`;
        button.onclick = () => {
            tryAddUsers(name);
            userPopoutInner.remove(); // 'close' the popout
        }
    }
    container.append(button);

    // insert another divider and our button container before the first divider in the popout
    let divider = userPopoutInner.querySelector('[class*=divider]');
    divider.parentNode.insertBefore(divider.cloneNode(), divider);
    divider.parentNode.insertBefore(container, divider);
}


let curChatContainer = null;

// Handle channel appearance/change and message apppearance
function handleMutations(mutationsList, observer) {
    for (var mutation of mutationsList) {
        if (mutation.type === 'childList') {
            // Check for chat container changing (gets removed and readded when switching channels)
            let chatContainer = document.querySelector('[class*=messagesWrapper]');
            if (chatContainer != curChatContainer) {
                curChatContainer = chatContainer;

                // Encrypted container location is within the chat container, so create/recreate it
                setupEncryptedContainer();

                // process each message that already exists, in case the container starts with messages
                // eg on switch to a channel that was already loaded previously
                chatContainer.querySelectorAll('[class*=messageContent]').forEach(processMessage);
                chatContainer.querySelectorAll('img[class*=lazyImg]').forEach(processImage);
            }

            // Handle newly added messages
            if (mutation.target.tagName.toLowerCase() === 'ol') { // Check if it's being added to the list of messages
                mutation.addedNodes.forEach(node => {
                    if (node.matches('[class*=messageListItem]')) { // Check if new node is a message
                        processMessage(node.querySelector('[class*=messageContent]'));
                    }
                });
            }

            // Handle newly loaded images
            if (mutation.target.matches('[class*=loadingOverlay]')) {
                // chatContainer.querySelectorAll('[class*=ListItem]').forEach(n => processImages(n));
                mutation.addedNodes.forEach(async function (node) {
                    if (node.matches('img:not(.ignoreForDecryption)')) {
                        await processImage(node);
                    }
                });
            }

            // Handle the user profile popout appearing. If it has to load, the div we're interested in appears later
            if (mutation.target.getAttribute('class')?.startsWith('layerContainer')) {
                mutation.addedNodes.forEach(async node => {
                    if (node.matches('[id*=popout]')) {
                        let userPopoutInner = node.querySelector('[class*=userPopoutInner]');
                        if (userPopoutInner) {
                            setupProfileButtons(userPopoutInner)
                        }
                    }
                    // also handle image popouts - just reuse the already cached decrypted image if we can
                    // it would be hard to get a reference to the message itself
                    else if (node.matches('[class*=layer_]')) {
                        let img = node.querySelector('[class*=loadingOverlay] img')
                        if (img) {
                            let dataUrl = decryptedImageCache.get(img.src.replace(/&?(?:width|height)=[^&]*/g, ''));

                            if (dataUrl) {
                                const cloned = img.cloneNode(true);
                                cloned.classList.add('ignoreForDecryption');
                                cloned.src = dataUrl;
                                img.parentNode.insertBefore(cloned, img);
                                img.style.display = 'none';
                            }
                        }
                    }
                })
            } else if (mutation.target.matches('[id*=popout]')) {
                mutation.addedNodes.forEach(node => {
                    if (node.tagName.toLowerCase() === 'div') {
                        let userPopoutInner = node.querySelector('[class*=userPopoutInner]');
                        if (userPopoutInner) {
                            setupProfileButtons(userPopoutInner)
                        }
                    }
                })
            }
        }
    }
}


function addGroupData(gd) {
    // the full list of group data that we must maintain
    groupDataList.push(gd);

    // assume no collisions possible
    groupDataByVer.set(gd.ver, gd);

    // set up group's keys in reverse sorted order by creation timestamp
    // done inductively - maintain sorted list by inserting in the right place, assuming sorted list
    // also set up revokedAt which point to the next latest groupData's creation timestamp
    let key = gd.owner + '/' + gd.name;
    let list = groupDataByOwnerAndName.get(key);
    if (!list) {
        list = [];
        groupDataByOwnerAndName.set(key, list);
    }

    let idx = list.findIndex(otherGd => otherGd.ts <= gd.ts);
    if (idx === -1) {
        // current gd must have been the oldest so far
        if (list.length > 0) {
            gd.revokedAt = list[list.length-1].ts;
        }
        list.push(gd); // found nothing smaller, so insert as tail
    } else {
        // current gd replaced the one at idx, and was replaced by the one at idx-1 if it exists
        list[idx].revokedAt = gd.ts;
        if (idx-1 >= 0) {
            gd.revokedAt = list[idx-1].ts;
        }
        list.splice(idx, 0, gd); // insert just before the smaller element we found
    }
}


// main code to run on script init
(async function() {

    storage.initLocalStorage();

    token = storage.loadToken();

    keyPair = storage.loadKeyPair();
    if (!keyPair) { // must not exist, so generate one!
        keyPair = await crypto.generateKeyPair();
        console.log("no key pair found, generated one", keyPair);
        storage.storeKeyPair(keyPair);
    }

    latestCertByIssuer = storage.loadCertificates();

    for (const gd of storage.loadGroupData()) {
        addGroupData(gd);
    }
    currentGroupData = storage.loadCurrentGroupData();


    let observer = new MutationObserver(handleMutations);
    observer.observe(document.body, { childList: true, subtree: true });


    setupCSS();
})();