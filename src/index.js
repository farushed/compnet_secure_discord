import * as crypto from './crypto'
import { setupCSS } from './styling';


let token = null;
let keyPair = null;
let symmetricKey = null;
let latestCertByIssuer = null;


function processMessage(messageNode) {
    // check for the specific format of our messages
    let formatCorrect = messageNode.children.length === 2
                    && messageNode.children[0].tagName.toLowerCase() === 'span'
                    && messageNode.children[0].innerText.trim() === '~'
                    && messageNode.children[1].tagName.toLowerCase() === 'code';

    let text = formatCorrect ? messageNode.children[1].innerText : undefined;
    if (formatCorrect && text.startsWith('-----BEGIN')) {
        if (crypto.addCertificate(text, latestCertByIssuer)) {
            crypto.storeCertificates(latestCertByIssuer); // only store if something changed
        }
        messageNode.innerHTML = `<div><p class="encrypted">${text}</p></div>`;
        messageNode.classList.add('control');
    }
    else if (formatCorrect && text.startsWith('_')) {
        let result = '';
        let gd = crypto.decryptGroupDataWithPrivateKey(keyPair.privateKey, text.substring(1));
        console.log(gd);
        if (gd) {
            symmetricKey = gd.key;
            result = 'Added to group'
        }
        messageNode.innerHTML = `<div><p class="encrypted">${text}</p><p class="decrypted">${result}</p></div>`;
        messageNode.classList.add('control');
    }
    else if (formatCorrect && symmetricKey) {
        let decrypted = crypto.decrypt(symmetricKey, text);
        messageNode.innerHTML = `<div><p class="encrypted">${text}</p><p class="decrypted">${decrypted}</p></div>`;
        messageNode.classList.add('encrypted');
    }
    else {
        // wrap for styling purposes
        messageNode.innerHTML = `<div>${messageNode.innerHTML}</div>`;
        messageNode.classList.add('plaintext');
    }
}

// Listen to new messages being added, and process them
function handleNewMessage(mutationsList, observer) {
    // console.log(mutationsList, observer)

    mutationsList.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) { // Check if the mutation involves adding a new node
            mutation.addedNodes.forEach(node => {
                if (node.classList && node.classList.contains('messageListItem__6a4fb')) { // Check if new node is a message
                    let messageNode = node.querySelector('.messageContent__21e69');
                    // console.log('New message:', messageNode);
                    processMessage(messageNode);
                }
            });
        }
    });
}

function getUsername() {
    return document.querySelector(".nameTag__0e320").querySelector(".hovered__243e5").textContent;
}

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

function setupTextbox() {
    let textbox = document.createElement('input');
    textbox.classList.add('encryptInput', 'markup_a7e664', 'editor__66464', 'fontSize16Padding__48818', 'themedBackground__6b1b6', 'scrollableContainer__33e06')
    textbox.setAttribute('type', 'text');
    textbox.setAttribute('placeholder', 'Enter message to encrypt...');
    // Insert the textbox just before the form div
    let formDiv = document.querySelector('form > div');
    formDiv.prepend(textbox);

    // Add event listener to the textbox for keydown event
    textbox.addEventListener('keydown', async function(event) {
        if (event.key === "Enter") {
            event.preventDefault();

            // Get the value of the textbox
            let inputValue = textbox.value;
            // Clear the textbox
            textbox.value = '';

            if (inputValue === '!keypair') {
                keyPair = await crypto.generateKeyPair();
                console.log("generated key pair", keyPair);
                crypto.storeKeyPair(keyPair);
            }
            else if (inputValue === '!cert') {
                let c = crypto.generateCertificate(keyPair, getUsername());
                console.log('generated cert', c);
                sendMessage(c);
            }
            else if (inputValue === '!symkey') {
                symmetricKey = crypto.generateSymmetricKey();
                console.log('generated symmetric key', symmetricKey);
            }
            else if (inputValue.startsWith('!add')) {
                let users = inputValue.substring('!add'.length).trim().split(/\s+/);
                for (const u of users) {
                    let userCert = latestCertByIssuer.get(u);
                    if (userCert) {
                        let m = crypto.encryptGroupDataForCertificateIssuer(userCert, {
                            key: symmetricKey
                        })
                        sendMessage('_' + m); // _ to separate from other message types
                    }
                }
            }
            else {
                if (!symmetricKey) {
                    alert('No group/symmetric key in place yet');
                    return;
                }
                inputValue = crypto.encrypt(symmetricKey, inputValue);
                console.log('sending', inputValue);
                sendMessage(inputValue);
            }
        }
    });
}


let curChatContainer = null;
let curMessageObserver = null;

// setup message observer only after the relevant element gets loaded in
function handleChatContainerAppearance(mutationsList, observer) {
    for (var mutation of mutationsList) {
        if (mutation.type === 'childList') {
            // the chat container gets removed and readded when switching channels, so just check for it changing
            let chatContainer = document.querySelector('.messagesWrapper_ea2b0b');
            if (chatContainer != curChatContainer) {
                console.log('new container', chatContainer)
                curChatContainer = chatContainer;

                // If we were observing the prervious chat container, stop
                if (curMessageObserver) {
                    curMessageObserver.disconnect();
                }
                // Observe the chat container for mutations
                curMessageObserver = new MutationObserver(handleNewMessage);
                curMessageObserver.observe(chatContainer, { childList: true, subtree: true });

                // process each message that already exists, in case the container starts with messages
                // eg on switch to a channel that was already loaded previously
                let messageNodes = chatContainer.querySelectorAll('.messageContent__21e69');
                console.log(messageNodes);
                for (const messageNode of messageNodes) {
                    processMessage(messageNode);
                }

                setupTextbox();
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

    let observer = new MutationObserver(handleChatContainerAppearance);
    observer.observe(document.body, { childList: true, subtree: true });


    setupCSS();
})();