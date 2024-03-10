// for pasting into console .. disconnect previous one so we don't get duplicate observers triggering
if (observer) {
    observer.disconnect();
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
                    origSpan.textContent = `Encrypted "${text}" (TODO)`;


                    let decrypted = document.createElement('p');
                    decrypted.classList.add('decrypted')
                    // TODO actually decrypt here
                    decrypted.textContent = `Decrypted "${text}" (TODO)`;

                    messageNode.appendChild(decrypted); // add after original message span
                }
            });
        }
    });
}

// Observe the chat container for mutations
var observer = new MutationObserver(handleNewMessage); // use var here so observer is hoisted to top so we can optionally disconnect it
let chatContainer = document.querySelector('.messagesWrapper_ea2b0b');
observer.observe(chatContainer, { childList: true, subtree: true });




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