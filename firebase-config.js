import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, updateProfile as modUpdateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAwnWoLfrEc1EtXWCD0by5L0VtCmYf8Unw",
  authDomain: "centraltradehub-30f00.firebaseapp.com",
  projectId: "centraltradehub-30f00",
  storageBucket: "centraltradehub-30f00.firebasestorage.app",
  messagingSenderId: "745751687877",
  appId: "1:745751687877:web:4576449aa2e8360931b6ac",
  measurementId: "G-YHCS5CH450"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Provide a small compat-like wrapper so non-module scripts can keep using `sdk`
const sdk = {
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
};

// Expose globally for classic scripts (e.g., account.js)
if (typeof window !== "undefined") {
  window.sdk = window.sdk || sdk;
  window.firebaseConfig = window.firebaseConfig || firebaseConfig;
}

export default app;

if (typeof window !== 'undefined') {
  // Make the config available to classic scripts (account.js)
  window.FB_CONFIG = window.FB_CONFIG || firebaseConfig;
}