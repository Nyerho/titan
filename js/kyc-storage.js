// KYC Storage Helpers
// - Uses shared 'auth' and 'storage' instances from firebase-config.js
// - Uploads to: kyc/{uid}/
// - Lists user files and lists all users' files (admin use)

// Import shared Firebase singletons (do NOT redeclare 'auth' or 'storage')
import { auth, storage } from "./firebase-config.js";
// Storage functions we need: ref, upload, URLs, and listing
import {
  ref,
  uploadBytes,
  getDownloadURL,
  list
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
// Optional: refresh the user's token before uploads
import { getIdTokenResult } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Upload both front and back government ID files to kyc/{uid}/
// Returns { front: { path, url }, back: { path, url } }
export async function uploadKycFrontBack(frontFile, backFile) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  // Ensure fresh token to prevent stale auth issues
  await getIdTokenResult(user, true);

  if (!frontFile || !backFile) {
    throw new Error("Both front and back files are required");
  }

  const ts = Date.now();
  const frontName = `${ts}_id_front${guessExt(frontFile)}`;
  const backName = `${ts}_id_back${guessExt(backFile)}`;

  const frontPath = `kyc/${user.uid}/${frontName}`;
  const backPath = `kyc/${user.uid}/${backName}`;

  const frontRef = ref(storage, frontPath);
  const backRef = ref(storage, backPath);

  const metaFront = {
    contentType: frontFile?.type || "image/png",
    cacheControl: "private, max-age=0"
  };
  const metaBack = {
    contentType: backFile?.type || "image/png",
    cacheControl: "private, max-age=0"
  };

  const frontSnap = await uploadBytes(frontRef, frontFile, metaFront);
  const backSnap = await uploadBytes(backRef, backFile, metaBack);

  const frontUrl = await getDownloadURL(frontSnap.ref);
  const backUrl = await getDownloadURL(backSnap.ref);

  return {
    front: { path: frontPath, url: frontUrl },
    back: { path: backPath, url: backUrl }
  };
}

// Helper: derive file extension from MIME type
function guessExt(file) {
  if (!file?.type) return ".png";
  const t = file.type.toLowerCase();
  if (t.includes("jpeg") || t.includes("jpg")) return ".jpg";
  if (t.includes("png")) return ".png";
  return ".png";
}

// Upload a single file to kyc/{uid}/{filename} and return { path, url }
export async function uploadKyc(file, filename) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  if (!file || !filename) throw new Error("File and filename are required");

  const kycPath = `kyc/${user.uid}/${filename}`;
  const fileRef = ref(storage, kycPath);

  const metadata = {
    contentType: file.type || "application/octet-stream",
    cacheControl: "private, max-age=0"
  };

  const snap = await uploadBytes(fileRef, file, metadata);
  const url = await getDownloadURL(snap.ref);
  return { path: kycPath, url };
}

// List current user's KYC files in kyc/{uid}/
// Returns array of { path, url }
export async function getUserKycList() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const userFolder = ref(storage, `kyc/${user.uid}`);
  const out = [];

  const page = await list(userFolder, { maxResults: 1000 });
  for (const itemRef of page.items) {
    const url = await getDownloadURL(itemRef);
    out.push({ path: itemRef.fullPath, url });
  }
  return out;
}

// Admin-only: list all users' KYC files under kyc/
// Returns array of { path, url }
// NOTE: Requires Storage rules and Auth to allow admin listing across users.
export async function listAllKyc() {
  const rootRef = ref(storage, "kyc");
  const out = [];

  // List first level: user prefixes (folders)
  const page = await list(rootRef, { maxResults: 1000 });
  for (const userPrefixRef of page.prefixes) {
    const userPage = await list(userPrefixRef, { maxResults: 1000 });
    for (const itemRef of userPage.items) {
      const url = await getDownloadURL(itemRef);
      out.push({ path: itemRef.fullPath, url });
    }
  }

  return out;
}