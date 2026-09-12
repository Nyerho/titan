// KYC file transport. Documents are stored on the protected Express backend, not Firebase Storage.
import { auth } from "./firebase-config.js";
import { adminApiConfig } from "./api-config.js";

function apiBaseUrl() {
  return String(adminApiConfig?.baseUrl || window.location.origin).replace(/\/+$/, "");
}

function absoluteUrl(value) {
  return String(value || "").startsWith("http") ? value : `${apiBaseUrl()}${value}`;
}

export async function uploadKycFrontBack(frontFile, backFile) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  if (!frontFile || !backFile) throw new Error("Both front and back files are required");

  const token = await user.getIdToken(true);
  const form = new FormData();
  form.append("idFront", frontFile, frontFile.name);
  form.append("idBack", backFile, backFile.name);

  const response = await fetch(`${apiBaseUrl()}/api/kyc/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "KYC upload failed");

  return {
    front: { url: absoluteUrl(data.files?.idFrontUrl), name: data.files?.idFrontName || frontFile.name },
    back: { url: absoluteUrl(data.files?.idBackUrl), name: data.files?.idBackName || backFile.name }
  };
}

// Kept as an explicit error so older admin code cannot silently fall back to Firebase Storage.
export async function listAllKyc() {
  throw new Error("KYC documents are available through the authenticated admin API.");
}
