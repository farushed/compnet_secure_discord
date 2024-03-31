import * as crypto from './crypto'
import { setupCSS } from './styling';


// Global variables, to be initialised in main setup function
let token;
let keyPair;
let latestCertByIssuer;
let groupDataByVer;
let currentGroupData;
let oldGroupVersions;


// Process user input and execute commands if applicable
async function processUserInput(input) {
    if (input === '!keypair') {
        keyPair = await crypto.generateKeyPair();
        console.log("generated key pair", keyPair);
        crypto.storeKeyPair(keyPair);
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
        let usersToAdd = input.substring('!add'.length).trim().split(/\s+/);
        modifyGroupAndShare(m => [...m, ...usersToAdd]);
    }
    else if (input.startsWith('!rm')) {
        let usersToRemove = input.substring('!rm'.length).trim().split(/\s+/);
        modifyGroupAndShare(m => m.filter(user => !usersToRemove.includes(user)));
    }
    else {
        if (!currentGroupData) {
            alert('No group/symmetric key in place yet');
            return;
        }
        input = crypto.encrypt(currentGroupData, input);
        console.log('sending', input);
        sendMessage(input);
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

    let text = messageNode.children[1].innerText;

    if (text.startsWith('-----BEGIN')) {
        // Process certificate message
        let success = crypto.addCertificate(text, latestCertByIssuer);
        if (success) {
            crypto.storeCertificates(latestCertByIssuer); // only store if something changed
        }
        messageNode.innerHTML = `<div><p class="encrypted">${text}</p></div>`;
        messageNode.classList.add('control');
    }
    else if (text.startsWith('_')) {
        // Process group data exchange message
        let result = '';
        let gd = crypto.decryptGroupDataWithPrivateKey(keyPair.privateKey, text.substring(1));
        console.log(gd);
        if (gd) {
            if (!groupDataByVer.has(gd.ver)) { // this key is new to us, process it
                if (gd.prev && oldGroupVersions.has(gd.prev)) { // the previous group key is outdated! don't trust!
                    result = `Tried to add to group ${gd.name} (${gd.mem.join(', ')}) but previous referenced key outdated!`;
                } else {
                    groupDataByVer.set(gd.ver, gd);
                    crypto.storeGroupData(groupDataByVer);
                    // for now just assume that the latest group data is the one we should keep active
                    if (!currentGroupData || gd.ts > currentGroupData.ts) {
                        crypto.storeCurrentGroupData(gd);
                        currentGroupData = gd;
                    }
                    oldGroupVersions.add(gd.prev);
                    crypto.storeOldGroupVersions(oldGroupVersions);

                    result = `Added to group ${gd.name} (${gd.mem.join(', ')})`
                }
            }
        }
        messageNode.innerHTML = `<div><p class="encrypted">${text}</p><p class="decrypted">${result}</p></div>`;
        messageNode.classList.add('control');
    }
    else {
        try {
            let [decrypted, gdUsed] = crypto.decrypt(groupDataByVer, text);
            let warn = oldGroupVersions.has(gdUsed.ver);
            let groupInfo = `<span style="font-size:2.5em">${warn?"OLD KEY&emsp;":""}${gdUsed.name}</span>`;
            messageNode.innerHTML = `<div>`
                                    +`<p class="encrypted">${groupInfo}&emsp;${text}</p>`
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
}

function getUsername() {
    return document.querySelector("[class*=nameTag] [class*=hovered]").textContent;
}

// Send a message in our custom format (~`message`) using the Discord API
function sendMessage(message) {
    let segments = window.location.pathname.split("?")[0].split("/");
    let channelId = segments[segments.length-1];

    // start with ~ (just as a flag), then surround in code block
    message = '~`' + message.replaceAll('`', '\\`') + '`'

    // Send the API request
    fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
        "method": "POST",
        "headers": {
            "content-type": "application/json",
            "authorization": token
        },
        "body": JSON.stringify({
            content: message
        }),
        "credentials": "include"
    })
    // .then(response => response.json())
    // .then(data => console.log('API Response:', data))
    // .catch(error => console.error('API Error:', error));
}

function modifyGroupAndShare(modifyFunc) {
    let gd = crypto.generateGroupData(currentGroupData.name, modifyFunc(currentGroupData.mem), currentGroupData);
    console.log('created new group', gd);

    oldGroupVersions.add(currentGroupData.ver);
    crypto.storeOldGroupVersions(oldGroupVersions);
    groupDataByVer.set(gd.ver, gd);
    crypto.storeGroupData(groupDataByVer);
    crypto.storeCurrentGroupData(gd);
    currentGroupData = gd;

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
    let gd = crypto.generateGroupData(getUsername() + '/' + groupName, [getUsername()]);
    console.log('created new group', gd);

    groupDataByVer.set(gd.ver, gd);
    crypto.storeGroupData(groupDataByVer);
    crypto.storeCurrentGroupData(gd);
    currentGroupData = gd;
}


// Add an input textbox to the DOM for interacting with this script
function setupTextbox() {
    let textbox = document.createElement('input');
    textbox.classList.add('encryptInput',
        ...document.querySelector('form [class*=scrollable]').classList, // background etc of the default textbox div
        ...document.querySelector('form [role*=textbox]').classList.values()
            .filter(c => !c.match(/slateTextArea/)), // font and text area properties (but not the positioning class)
    )

    textbox.setAttribute('type', 'text');
    textbox.setAttribute('placeholder', 'Enter message to encrypt...');

    // Insert the textbox just before the form div
    let formDiv = document.querySelector('form > div');
    formDiv.prepend(textbox);

    // Add event listener to the textbox for keydown event
    textbox.addEventListener('keydown', async function(event) {
        if (event.key === "Enter") {
            event.preventDefault();

            let inputValue = textbox.value;
            textbox.value = '';

            processUserInput(inputValue);
        }
    });
}


// Add buttons to user profile to allow adding or removing them from the current group
function setUpProfileButtons(userPopoutInner) {
    let name = userPopoutInner.querySelector('span[class*=userTagUsernameBase]').textContent;
    if (name === getUsername()) {
        return; // don't want to do anything for ourselves
    }

    let container = document.createElement('div');
    container.classList.add('profileButtonContainer');

    let button = document.createElement('div');
    button.classList.add('profileButton');
    if (currentGroupData.mem.includes(name)) {
        button.innerText = 'Remove from group';
        button.onclick = () => {
            modifyGroupAndShare(m => m.filter(user => user !== name));
            userPopoutInner.remove(); // 'close' the popout
        }
    } else {
        button.innerText = 'Add to group';
        button.onclick = () => {
            modifyGroupAndShare(m => [...m, name]);
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

                // Textbox location is within the chat container, so create/recreate it
                setupTextbox();

                // process each message that already exists, in case the container starts with messages
                // eg on switch to a channel that was already loaded previously
                let messageNodes = chatContainer.querySelectorAll('[class*=messageContent]');

                for (const messageNode of messageNodes) {
                    processMessage(messageNode);
                }
            }

            // Handle newly added messages
            if (mutation.target.tagName.toLowerCase() === 'ol') { // Check if it's being added to the list of messages
                mutation.addedNodes.forEach(node => {
                    if (node.getAttribute('class')?.indexOf('messageListItem') >= 0) { // Check if new node is a message
                        let messageNode = node.querySelector('[class*=messageContent]');

                        processMessage(messageNode);
                    }
                });
            }

            // Handle the user profile popout appearing. If it has to load, the div we're interested in appears later
            if (mutation.target.getAttribute('class')?.startsWith('layerContainer')) {
                mutation.addedNodes.forEach(node => {
                    if (node.id?.indexOf('popout') >= 0) {
                        let userPopoutInner = node.querySelector('[class*=userPopoutInner]');
                        if (userPopoutInner) {
                            setUpProfileButtons(userPopoutInner)
                        }
                    }
                })
            } else if (mutation.target.getAttribute('id')?.startsWith('popout')) {
                mutation.addedNodes.forEach(node => {
                    if (node.tagName.toLowerCase() === 'div') {
                        let userPopoutInner = node.querySelector('[class*=userPopoutInner]');
                        if (userPopoutInner) {
                            setUpProfileButtons(userPopoutInner)
                        }
                    }
                })
            }
        }
    }
}


// main code to run on script init
(async function() {

    // Restore localStorage that discord deletes
    // taken from https://stackoverflow.com/a/53773662
    function getLocalStoragePropertyDescriptor() {
        const iframe = document.createElement('iframe');
        document.head.append(iframe);
        const pd = Object.getOwnPropertyDescriptor(iframe.contentWindow, 'localStorage');
        iframe.remove();
        return pd;
    }
    Object.defineProperty(window, 'localStorage', getLocalStoragePropertyDescriptor());

    // Now we can retrieve the token from localstorage
    token = localStorage.getItem("token").replace(/^"|"$/g, ''); // trim " from start and end

    try {
        keyPair = crypto.loadKeyPair();
        if (keyPair) {
            console.log("loaded keypair", keyPair);
        }
        else { // must not exist, so generate one!
            keyPair = await crypto.generateKeyPair();
            console.log("no key pair found, generated one", keyPair);
            crypto.storeKeyPair(keyPair);
        }
    } catch (e) {
        console.error("failed to load keypair", e);
    }

    latestCertByIssuer = crypto.loadCertificates();
    groupDataByVer = crypto.loadGroupData();
    currentGroupData = crypto.loadCurrentGroupData();
    oldGroupVersions = crypto.loadOldGroupVersions();

    let observer = new MutationObserver(handleMutations);
    observer.observe(document.body, { childList: true, subtree: true });


    setupCSS();
})();