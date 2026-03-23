const admin = require("firebase-admin");

admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "centraltradehub-30f00"
});

(async () => {
    const uid = "REPLACE_WITH_ADMIN_UID"; // your admin’s UID
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    console.log("✅ Admin claim set for", uid);
})();