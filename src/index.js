import { generateCertificate } from './crypto'


// Placeholder "encryption" for now just to see things happening
function encrypt(text) {
    return text.split('').reverse().join('');
}

function decrypt(text) {
    return text.split('').reverse().join('');
}


function handleNewMessage(mutationsList, observer) {
    // console.log(mutationsList, observer)

    mutationsList.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) { // Check if the mutation involves adding a new node
            mutation.addedNodes.forEach(node => {
                if (node.classList && node.classList.contains('messageListItem__6a4fb')) { // Check if new node is a message
                    let messageNode = node.querySelector('.messageContent__21e69');
                    // console.log('New message:', messageNode);

                    let origSpan = messageNode.querySelector('span');
                    origSpan.classList.add('encrypted')

                    let text = origSpan.textContent;

                    let decrypted = document.createElement('p');
                    decrypted.classList.add('decrypted')
                    decrypted.textContent = decrypt(text);

                    messageNode.appendChild(decrypted); // add after original message span
                }
            });
        }
    });
}

// We'll get token by listening to an outgoing request that sets the Authorization header
let token = null;

function sendMessage(message) {
    let segments = window.location.pathname.split("?")[0].split("/");
    let channelId = segments[segments.length-1];

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

            if (inputValue === '!gc') {
                inputValue = await generateCertificate();
            } else {
                inputValue = encrypt(inputValue);
            }

            console.log('sending', inputValue);
            sendMessage(inputValue);
        }
    });
}

// setup message observer only after the relevant element gets loaded in
function handleChatContainerAppearance(mutationsList, observer) {
    for (var mutation of mutationsList) {
        if (mutation.type === 'childList') {
            let chatContainer = document.querySelector('.messagesWrapper_ea2b0b');
            if (chatContainer) {
                // Observe the chat container for mutations
                let messageObserver = new MutationObserver(handleNewMessage);
                messageObserver.observe(chatContainer, { childList: true, subtree: true });

                setupTextbox();

                // Disconnect this observer since we no longer need it
                observer.disconnect();
                return;
            }
        }
    }
}


// main code to run on script init
(function() {

    // Override the global XMLHttpRequest constructor
    const _XMLHttpRequest = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
        // Create a new instance of XMLHttpRequest
        const xhr = new _XMLHttpRequest();

        // Override the setRequestHeader method
        const _setRequestHeader = xhr.setRequestHeader;
        xhr.setRequestHeader = function(header, value) {
            // Intercept the setRequestHeader method
            if (header === "Authorization") {
                // console.log("Got Authorization", value);
                token = value;
                window.XMLHttpRequest = _XMLHttpRequest; // we don't need this any more
            }
            // Call the original setRequestHeader method
            _setRequestHeader.apply(this, arguments);
        };

        // Return the modified instance of XMLHttpRequest
        return xhr;
    };

    let observer = new MutationObserver(handleChatContainerAppearance);
    observer.observe(document.body, { childList: true, subtree: true });


    // Add some css in a style element to the document head
    var styleElement = document.createElement('style');
    styleElement.textContent = `
    .messageContent__21e69 {
        /*position: relative;
        display: inline-block;*/
    }

    .encryptInput {
        border: none;
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 0.5em;
        padding-left: 1em;
    }

    .encrypted {
        color: #cccc;
        font-size: 0.5em;
    }

    .decrypted {
        margin: 0;
    }
    `;
    document.head.appendChild(styleElement);

})();