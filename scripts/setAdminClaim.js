const path = require("path");
const fs = require("fs");

let admin;
try {
    admin = require("firebase-admin");
} catch (e) {
    try {
        admin = require(path.resolve(__dirname, "../backend-server/node_modules/firebase-admin"));
    } catch (e2) {
        throw new Error(
            "firebase-admin is not installed. Run: cd backend-server; npm install (then re-run this script)."
        );
    }
}

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is required");
}

const uid = process.env.ADMIN_UID || process.argv[2];
if (!uid || uid === "REPLACE_WITH_ADMIN_UID") {
    throw new Error("Provide the admin UID via ADMIN_UID env var or as argv[2]");
}

function getCredential() {
    const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (svc) {
        const serviceAccount = JSON.parse(svc);
        if (typeof serviceAccount.private_key === "string") {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
        }
        return admin.credential.cert(serviceAccount);
    }

    const projectIdEnv = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
    if (!privateKey && privateKeyBase64) {
        privateKey = Buffer.from(privateKeyBase64, "base64").toString("utf8");
    }

    if (projectIdEnv && clientEmail && privateKey) {
        privateKey = privateKey.replace(/\\n/g, "\n");
        return admin.credential.cert({ projectId: projectIdEnv, clientEmail, privateKey });
    }

    const serviceAccountPath = path.resolve(__dirname, "../serviceAccountKey.json");
    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        if (typeof serviceAccount.private_key === "string") {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
        }
        return admin.credential.cert(serviceAccount);
    }

    return admin.credential.applicationDefault();
}

admin.initializeApp({
    credential: getCredential(),
    projectId
});

(async () => {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    await admin.firestore().collection("users").doc(uid).set({ role: "admin" }, { merge: true });
    console.log("✅ Admin enabled for", uid);
})();
