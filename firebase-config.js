import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, updateProfile as modUpdateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyB2wni5mJd7m9QZYRLubeyMB6mcPOL1dtA",
  authDomain: "titantrades-84777.firebaseapp.com",
  projectId: "titantrades-84777",
  storageBucket: "titantrades-84777.firebasestorage.app",
  messagingSenderId: "107204284825",
  appId: "1:107204284825:web:5d09b029feb91477ae8308",
  measurementId: "G-585HB34KK9"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Provide a small compat-like wrapper so non-module scripts can keep using `sdk`
const sdk = app
  ? {
      app,
      apps: [app],
      initializeApp: () => app,
      auth: () => auth,
      firestore: () => ({
        collection: (name) => ({
          doc: (uid) => ({
            set: (data, options) => setDoc(doc(db, name, uid), data, options)
          })
        })
      }),
      storage: () => storage,
      updateProfile: (data) => {
        const user = auth.currentUser;
        if (!user) return Promise.reject(new Error("No authenticated user"));
        return modUpdateProfile(user, data);
      }
    }
  : null;

// Expose globally for classic scripts (e.g., account.js)
if (typeof window !== "undefined") {
  if (sdk) window.sdk = window.sdk || sdk;
  window.firebaseConfig = window.firebaseConfig || firebaseConfig;
}

export default app;

if (typeof window !== 'undefined') {
  window.FB_CONFIG = window.FB_CONFIG || firebaseConfig;
}
