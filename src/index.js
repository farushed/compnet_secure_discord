import * as crypto from './crypto'
import { setupCSS } from './styling';


// Global variables, to be initialised in main setup function
let token;
let keyPair;
let latestCertByIssuer;
let groupDataByVer;
let currentGroupData;


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
    else if (input === '!newgroup') {
        createGroupAndShare([getUsername()]);
    }
    else if (input.startsWith('!add')) {
        let usersToAdd = input.substring('!add'.length).trim().split(/\s+/);
        createGroupAndShare([...currentGroupData.mem, ...usersToAdd]);
    }
    else if (input.startsWith('!rm')) {
        let usersToRemove = input.substring('!rm'.length).trim().split(/\s+/);
        createGroupAndShare(currentGroupData.mem.filter(user => !usersToRemove.includes(user)));
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
            crypto.addGroupData(gd, groupDataByVer);
            crypto.storeGroupData(groupDataByVer);
            // for now just assume that the latest group data is the one we should keep active
            if (!currentGroupData || gd.ts > currentGroupData.ts) {
                crypto.storeCurrentGroupData(gd);
                currentGroupData = gd;
            }
            result = `Added to group (${gd.mem.join(', ')})`
        }
        messageNode.innerHTML = `<div><p class="encrypted">${text}</p><p class="decrypted">${result}</p></div>`;
        messageNode.classList.add('control');
    }
    else {
        try {
            let decrypted = crypto.decrypt(groupDataByVer, text);
            messageNode.innerHTML = `<div><p class="encrypted">${text}</p><p class="decrypted">${decrypted}</p></div>`;
            messageNode.classList.add('encrypted');
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
    message = '~`' + message.replace('`', '\\`') + '`'

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

function createGroupAndShare(groupMembers) {
    let gd = crypto.generateGroupData(groupMembers);
    console.log('created new group', gd);

    crypto.addGroupData(gd, groupDataByVer);
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

    let observer = new MutationObserver(handleMutations);
    observer.observe(document.body, { childList: true, subtree: true });


    setupCSS();
})();