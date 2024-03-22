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