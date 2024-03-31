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

    localStorage.setItem('my_k_priv', priv);
    localStorage.setItem('my_k_pub', pub);
}

export function loadKeyPair() {
    let priv = localStorage.getItem('my_k_priv');
    let pub = localStorage.getItem('my_k_pub');

    if (!priv || !pub) {
        return null;
    }

    return {
        privateKey: forge.pki.privateKeyFromPem(priv),
        publicKey: forge.pki.publicKeyFromPem(pub)
    }
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

// Only add a cert to the map if its validity extends further
// Returns whether or not the cert was added
export function addCertificate(pem, latestCertByIssuer) {
    let cert = forge.pki.certificateFromPem(pem);
    cert.pem = pem; // might as well store this so we don't regen it later!

    let issuer = cert.issuer.attributes[0].value;

    let latest = latestCertByIssuer.get(issuer);
    if (!latest || cert.validity.notAfter > latest.validity.notAfter) {
        latestCertByIssuer.set(issuer, cert);
        return true;
    }

    return false;
}

// Store just the pem strings in localStorage
export function storeCertificates(latestCertByIssuer) {
    localStorage.setItem('my_certs', JSON.stringify(
        Array.from(latestCertByIssuer.entries().map(
            // we should've stored the pem on the object but if not generate it
            ([i, c]) => c.pem ? c.pem : forge.pki.certificateToPem(c)
        ))
    ));
}

// Parse the pem strings from localStorage into actual cert objects
// Returns a map of issuer to cert object
export function loadCertificates() {
    let certs = new Map();

    let stored = localStorage.getItem('my_certs');
    if (stored) {
        for (const pem of JSON.parse(stored)) {
            let cert = forge.pki.certificateFromPem(pem);
            cert.pem = pem; // again store for later
            certs.set(cert.issuer.attributes[0].value, cert)
        }
    }

    return certs;
}

// takes the serializable object to be encrypted and a cert of the user we're sending it to
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
export function generateGroupData(groupMembers) {
    let key = generateSymmetricKey();
    // generate a version number from the hash
    let md = forge.md.sha256.create();
    md.update(key);
    let ver = md.digest().bytes().slice(0, 4); // take just 32 bits

    return {
        key,
        ver,
        mem: [...new Set(groupMembers)], // only keep unique members
        ts: new Date().getTime(),
    }
}

// Adds groupData object to the map if it's not already there (primary key = the symmetric group key)
export function addGroupData(gd, groupDataByVer) {
    let gdList = groupDataByVer.get(gd.ver);
    if (gdList) {
        if (gdList.some(x => x.key === gd.key)) { // don't add if a groupData with the same key already exists
            return;
        }
        gdList.push(gd);
    } else {
        groupDataByVer.set(gd.ver, [gd]);
    }
}

// Store the groupData map to localStorage as just the array of groupData objects
export function storeGroupData(groupDataByVer) {
    localStorage.setItem('my_groups', JSON.stringify(
        Array.from(groupDataByVer.values()).flat()
    ));
}

// Get the list of groupData from localStorage, and represent it as a map. If not found, create an empty one.
// Returns a map of version to group data
export function loadGroupData() {
    let groupDataByVer = new Map();

    let stored = localStorage.getItem('my_groups');
    if (stored) {
        let groupDataObjects = JSON.parse(stored);
        groupDataObjects.forEach(gd => addGroupData(gd, groupDataByVer));
    }

    return groupDataByVer;
}

export function storeCurrentGroupData(currentGroupData) {
    localStorage.setItem('my_cur_group', JSON.stringify(currentGroupData));
}

export function loadCurrentGroupData() {
    return JSON.parse(localStorage.getItem('my_cur_group'));
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

    return forge.util.encode64(groupData.ver)
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

    let gdList = groupDataByVer.get(ver) ?? [];
    for (const gd of gdList) {
        let decrypted = _decrypt(gd.key, iv, encrypted, tag);
        return forge.util.decodeUtf8(decrypted);
    }

    throw Error('Could not decrypt');
}