const styles = `
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

.markup_a7e664.messageContent__21e69 div {
    border-radius: 5px;
    background-clip: content-box;
    overflow: hidden;
}

/*
.markup_a7e664.messageContent__21e69.plaintext div {
    background-color: rgba(255, 100, 100, 0.05);
}
*/

.markup_a7e664.messageContent__21e69.encrypted div {
    background-color: rgba(9, 255, 9, 0.1);
}

.markup_a7e664.messageContent__21e69.control p {
    background-color: rgba(94, 64, 191, 0.05)
}

p.encrypted {
    color: #cccc;
    font-size: 0.3em;
    line-height: normal;
    background-color: rgba(0, 0, 0, 0.15);
    margin: 0;
    padding: 0.5em 0;
}

p.decrypted {
    margin: 0;
}
`

// Add css in a style element to the document head
export function setupCSS() {
    let styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
}