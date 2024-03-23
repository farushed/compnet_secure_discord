const forge = require('node-forge');

export function generateKeyPair() {
    return new Promise((resolve, reject) => {
        forge.pki.rsa.generateKeyPair({ bits: 2048, workers: 2 }, (err, keyPair) => {
            if (err) {
                reject(err);
            } else {
                resolve(keyPair);
            }
        });
    });
}

export function storeKeyPair(keyPair) {
    let priv = forge.pki.privateKeyToPem(keyPair.privateKey);
    let pub = forge.pki.publicKeyToPem(keyPair.publicKey);

    localStorage.setItem('k_priv', priv);
    localStorage.setItem('k_pub', pub);
}

export function loadKeyPair() {
    let priv = localStorage.getItem('k_priv');
    let pub = localStorage.getItem('k_pub');

    return {
        privateKey: forge.pki.privateKeyFromPem(priv),
        publicKey: forge.pki.publicKeyFromPem(pub)
    }
}

export function generateCertificate(keyPair) {
    let cert = forge.pki.createCertificate();
    cert.publicKey = keyPair.publicKey;

    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

    var attrs = [{
        name: 'commonName',
        value: 'test issuer'
    }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // self-sign certificate
    cert.sign(keyPair.privateKey);

    console.log(cert);

    let x =  forge.pki.certificateToPem(cert);
    console.log(x)
    return x
}


export function generateSymmetricKey() {
    return forge.random.getBytesSync(16);
}

const ivLength = 16;

function generateIV() {
    return forge.random.getBytesSync(ivLength);
}

function _encrypt(key, iv, message) {
    let cipher = forge.cipher.createCipher('AES-CTR', key);

    cipher.start({iv: iv})
    cipher.update(forge.util.createBuffer(message));
    cipher.finish()

    return cipher.output.bytes();
}

function _decrypt(key, iv, encrypted) {
    let decipher = forge.cipher.createDecipher('AES-CTR', key);

    decipher.start({iv: iv});
    decipher.update(forge.util.createBuffer(encrypted));

    let result = decipher.finish()

    return decipher.output.bytes();
}


export function encrypt(key, message) {
    let iv = generateIV();
    let encrypted = _encrypt(key, iv, message);

    return forge.util.encode64(iv + encrypted);
}

export function decrypt(key, message) {
    let encrypted = forge.util.decode64(message);
    let decrypted = _decrypt(key, encrypted.slice(0, ivLength), encrypted.slice(ivLength));

    return decrypted;
}