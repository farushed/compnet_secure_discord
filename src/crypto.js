import * as pkijs from 'pkijs';
import * as asn1js from 'asn1js';


const crypto = pkijs.getCrypto(true);

export async function generateCertificate() {
    // from https://pkijs.org/docs/examples/certificates-and-revocation/create-and-validate-certificate/
    const certificate = new pkijs.Certificate();
    certificate.version = 2;
    certificate.serialNumber = new asn1js.Integer({ value: 1 });
    certificate.issuer.typesAndValues.push(new pkijs.AttributeTypeAndValue({
        type: "2.5.4.3", // Common name
        value: new asn1js.BmpString({ value: "Test issuer" })
    }));
    certificate.subject.typesAndValues.push(new pkijs.AttributeTypeAndValue({
        type: "2.5.4.3", // Common name
        value: new asn1js.BmpString({ value: "Test subject" })
    }));
    
    certificate.notBefore.value = new Date();
    const notAfter = new Date();
    notAfter.setUTCFullYear(notAfter.getUTCFullYear() + 1);
    certificate.notAfter.value = notAfter;


    const algorithm = pkijs.getAlgorithmParameters("RSASSA-PKCS1-v1_5", "generateKey");
    if ("hash" in algorithm.algorithm) {
        algorithm.algorithm.hash.name = "SHA-256";
    }
    const keys = await crypto.generateKey(algorithm.algorithm, true, algorithm.usages);


    // Exporting public key into "subjectPublicKeyInfo" value of certificate
    await certificate.subjectPublicKeyInfo.importKey(keys.publicKey);

    // Signing final certificate
    await certificate.sign(keys.privateKey, "SHA-256");


    // Convert ASN.1 structure to BER
    const ber = certificate.toSchema().toBER();

    // Base64 encode BER to PEM format
    const base64Ber = arrayBufferToBase64(ber);
    const pemString = `-----BEGIN CERTIFICATE-----\n${base64Ber}\n-----END CERTIFICATE-----`;

    return pemString;
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}