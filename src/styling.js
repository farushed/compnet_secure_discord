// Add css in a style element to the document head
export function setupCSS() {

    let styleElement = document.createElement('style');

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

.markup_a7e664.messageContent__21e69:not(.encrypted) div {
    background-color: rgba(255, 100, 100, 0.05);
    border-radius: 5px;
    background-clip: content-box;
    overflow: hidden;
}

.markup_a7e664.messageContent__21e69.encrypted div {
    background-color: rgba(100, 255, 100, 0.05);
    border-radius: 5px;
    background-clip: content-box;
    overflow: hidden;
}

p.encrypted {
    color: #cccc;
    font-size: 0.3em;
    line-height: normal;
    background: var(--background-secondary);
    margin: 0;
    padding: 0.5em 0;
}

p.decrypted {
    margin: 0;
}
    `;
    document.head.appendChild(styleElement);

}