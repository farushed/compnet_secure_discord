// ==UserScript==
// @name         Discord Message Encryption
// @description  Encrypts messages before sending, decrypts received messages
// @version      0.1
// @author       Daniel Farushev
// @match        https://discord.com/*
// ==/UserScript==


function decrypt(text) {
    return text.toUpperCase();
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
                    // TODO handle encryption before actually sending anything! messages should be encrypted in reality
                    // origSpan.textContent = `Encrypted "${text}" (TODO)`;
                    origSpan.textContent = text;


                    let decrypted = document.createElement('p');
                    decrypted.classList.add('decrypted')
                    // TODO actually decrypt here
                    // decrypted.textContent = `Decrypted "${text}" (TODO)`;
                    decrypted.textContent = decrypt(text);

                    messageNode.appendChild(decrypted); // add after original message span
                }
            });
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

                // Disconnect this observer since we no longer need it
                observer.disconnect();
                return;
            }
        }
    }
}


// main code to run on script init
(function() {

    let observer = new MutationObserver(handleChatContainerAppearance);
    observer.observe(document.body, { childList: true, subtree: true });


    // Add some css in a style element to the document head
    var styleElement = document.createElement('style');
    styleElement.textContent = `
    .messageContent__21e69 {
        /*position: relative;
        display: inline-block;*/
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