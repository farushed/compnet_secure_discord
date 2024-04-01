const forge = require('node-forge');


// Restore localStorage that discord deletes
// taken from https://stackoverflow.com/a/53773662
export function initLocalStorage() {
    function getLocalStoragePropertyDescriptor() {
        const iframe = document.createElement('iframe');
        document.head.append(iframe);
        const pd = Object.getOwnPropertyDescriptor(iframe.contentWindow, 'localStorage');
        iframe.remove();
        return pd;
    }
    Object.defineProperty(window, 'localStorage', getLocalStoragePropertyDescriptor());
}


// Retrieve user's token from localStorage
export function loadToken() {
    return localStorage.getItem("token").replace(/^"|"$/g, ''); // trim " from start and end
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


// Store the groupData map to localStorage as just the array of groupData objects
export function storeGroupData(groupDataByVer) {
    localStorage.setItem('my_groups', JSON.stringify(
        Array.from(groupDataByVer.values())
    ));
}

// Get the list of groupData from localStorage, and represent it as a map. If not found, create an empty one.
// Returns a map of version to group data
export function loadGroupData() {
    let groupDataByVer = new Map();

    let stored = localStorage.getItem('my_groups');
    if (stored) {
        let groupDataObjects = JSON.parse(stored);
        groupDataObjects.forEach(gd => groupDataByVer.set(gd.ver, gd));
    }

    return groupDataByVer;
}

export function storeCurrentGroupData(currentGroupData) {
    localStorage.setItem('my_cur_group', JSON.stringify(currentGroupData));
}

export function loadCurrentGroupData() {
    return JSON.parse(localStorage.getItem('my_cur_group'));
}


export function storeOldGroupVersions(oldGroupVersions) {
    localStorage.setItem('my_old_groups', JSON.stringify([...oldGroupVersions]));
}

export function loadOldGroupVersions() {
    return new Set(JSON.parse(localStorage.getItem('my_old_groups') ?? "[]"));
}