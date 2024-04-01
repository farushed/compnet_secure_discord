const forge = require('node-forge');

export function generateKeyPair() {
    return new Promise((resolve, reject) => {
        forge.pki.rsa.generateKeyPair({ bits: 2048, workers: 2 }, (err, keyPair) => {
            if (err) { reject(err); }
            else { resolve(keyPair); }
        });
    });
}


export function generateCertificate(keyPair, username='N/A') {
    let cert = forge.pki.createCertificate();
    cert.publicKey = keyPair.publicKey;

    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

    var attrs = [{
        name: 'commonName',
        value: username
    }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // self-sign certificate
    cert.sign(keyPair.privateKey);

    return forge.pki.certificateToPem(cert);
}


// takes the serializable object to be encrypted and a cert of the user we're sending it to
// TODO sign with our own privateKey so others can make sure we are the owner
export function encryptGroupDataForCertificateIssuer(cert, groupData) {
    let encrypted = cert.publicKey.encrypt(JSON.stringify(groupData))

    return forge.util.encode64(encrypted)
}

// parse and return the object that was encrypted with our public key
export function decryptGroupDataWithPrivateKey(privateKey, message) {
    let encrypted = forge.util.decode64(message);

    try {
        let decrypted = privateKey.decrypt(encrypted); // will throw if it's invalid
        return JSON.parse(decrypted)
    } catch {
        return null;
    }
}

// Creates a new groupData object with a new symmetric key
export function generateGroupData(owner, name, groupMembers, prev=null) {
    let key = generateSymmetricKey();
    // generate a version number from the hash
    let md = forge.md.sha256.create();
    md.update(key);
    let ver = md.digest().bytes().slice(0, 16); // take 128 bits, equal to the length of the key

    return {
        key,
        ver,
        owner,
        name,
        mem: [...new Set(groupMembers)], // only keep unique members
        ts: new Date().getTime(),
        prev: prev?.ver,
    }
}


function generateSymmetricKey() {
    return forge.random.getBytesSync(16);
}

const ivLength = 16;

function generateIV() {
    return forge.random.getBytesSync(ivLength);
}


function _encrypt(key, iv, message) {
    let cipher = forge.cipher.createCipher('AES-GCM', key);

    cipher.start({iv: iv});
    cipher.update(forge.util.createBuffer(message, 'raw'));
    cipher.finish();

    return {
        ciphertext: cipher.output.bytes(),
        tag: cipher.mode.tag.bytes()
    };
}

function _decrypt(key, iv, encrypted, tag) {
    let decipher = forge.cipher.createDecipher('AES-GCM', key);

    decipher.start({iv: iv, tag: tag});
    decipher.update(forge.util.createBuffer(encrypted));

    let result = decipher.finish();
    if (result) {
        return decipher.output.bytes();
    }

    throw Error('Decryption failed');
}


export function encrypt(groupData, message) {
    let encoded = forge.util.encodeUtf8(message);

    let iv = generateIV();
    let { ciphertext: encrypted, tag } = _encrypt(groupData.key, iv, encoded);

    return forge.util.encode64(groupData.ver.slice(0,4))
        + ':' + forge.util.encode64(iv)
        + ':' + forge.util.encode64(encrypted)
        + ':' + forge.util.encode64(tag);
}

export function decrypt(groupDataByVer, message) {
    console.log('decrypting', message, groupDataByVer);
    let parts = message.split(':');
    let ver       = forge.util.decode64(parts[0]);
    let iv        = forge.util.decode64(parts[1]);
    let encrypted = forge.util.decode64(parts[2]);
    let tag       = forge.util.decode64(parts[3]);

    for (const gd of groupDataByVer.values()) {
        if (gd.ver.slice(0,4) === ver) { // TODO what if there are multiple
            let decrypted = _decrypt(gd.key, iv, encrypted, tag);
            return [forge.util.decodeUtf8(decrypted), gd];
        }
    }

    throw Error('Could not decrypt');
}