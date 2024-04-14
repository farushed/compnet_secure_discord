const styles = `
[class*=messageContent] {
    /*position: relative;
    display: inline-block;*/
}

#encryptInput {
    display: flex;
    margin-bottom: 0.5em;
}

#encryptInput label {
    display: flex;
    padding: 10px 16px;
    cursor: pointer;
}

#encryptInput label:hover {
    color: var(--interactive-hover);
}

#encryptInput input[type=file]{
    display: none;
}

#encryptInput input[type=text] {
    background-color: transparent;
    flex: 1;
    border: none;
    box-sizing: border-box;
}

#groupSelect {
    border: none;
    color: white;
    display: flex;
    align-items: center;
    cursor: pointer;
}

#groupSelected::after {
    content: "∧";
    padding: 0 1em 0 0.5em;
}

#groupSelect .options {
    position: absolute;
    bottom: calc(100% + 10px);
    right: 10px;
    border-radius: 5px;
}

#groupSelect .options.hidden {
    display: none;
}

#groupSelect .options div {
    padding: 8px 12px;
}

#groupSelect .options div:hover {
    background-color: var(--background-modifier-hover);
}

#displayedFiles {
    display: flex;
}

#displayedFiles img {
    max-width: 200px;
    max-height: 200px;
}

[class*=markup][class*=messageContent] div {
    border-radius: 5px;
    background-clip: content-box;
    overflow: hidden;
}

/*
[class*=markup][class*=messageContent].plaintext div {
    background-color: rgba(255, 100, 100, 0.05);
}
*/

[class*=markup][class*=messageContent].encrypted div {
    background-color: rgba(9, 255, 9, 0.1);
}

[class*=markup][class*=messageContent].encrypted.old div {
    background-color: rgba(255, 255, 9, 0.1);
}

[class*=markup][class*=messageContent].control p {
    background-color: rgba(94, 64, 191, 0.05)
}

[class*=buttonsInner] div.encrypted {
    color: rgba(9, 255, 9, 0.5);
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


.membersPopup {
    position: fixed;
    z-index: 1;
    background-color: var(--background-floating);
    box-shadow: var(--elevation-high);
    border-radius: 5px;
    font-weight: 500;
    color: var(--text-normal);
    padding: 8px 12px;
    max-width: 25%;
}

.profileButtonContainer {
    padding: 6px 8px;
}

.profileButton {
    color: var(--interactive-normal);
    cursor: pointer;

    border-radius: 2px;
    box-sizing: border-box;
    padding: 6px 8px;
    margin-top: 8px;
}

.profileButton:hover {
    color: var(--interactive-hover);
    background: var(--profile-body-background-hover);
}
`

// Add css in a style element to the document head
export function setupCSS() {
    let styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
}