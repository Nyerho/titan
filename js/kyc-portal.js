import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, updateDoc, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { uploadKycFrontBack } from "./kyc-storage.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

class KYCPortal {
  constructor() {
    this.currentUser = null;
    this.isSubmitting = false;
    this.unsubscribeStatus = null;

    onAuthStateChanged(auth, (user) => {
      this.currentUser = user || null;
      this.checkSubmitButton();
      if (user) this.subscribeToStatus(user.uid);
      else this.setStatus("unverified");
    });
  }

  bindUploadPreviews() {
    [
      ["idFrontFileInput", "idFrontFileName", "idFrontPreview"],
      ["idBackFileInput", "idBackFileName", "idBackPreview"]
    ].forEach(([inputId, nameId, previewId]) => {
      const input = document.getElementById(inputId);
      const name = document.getElementById(nameId);
      const preview = document.getElementById(previewId);
      if (!input) return;

      const update = () => {
        const file = input.files?.[0];
        if (name) name.textContent = file ? `${file.name} · ${this.formatBytes(file.size)}` : "No file selected";
        if (preview) {
          preview.removeAttribute("src");
          preview.style.display = "none";
        }
        this.checkSubmitButton();
      };
      input.addEventListener("change", update);
      update();
    });
  }

  formatBytes(bytes) {
    if (!bytes) return "0 KB";
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  validateFile(file, label) {
    if (!file) throw new Error(`Please select the ${label} of your ID.`);
    if (!ACCEPTED_TYPES.has(file.type)) throw new Error(`${label} must be a JPG, PNG, or WEBP image.`);
    if (file.size > MAX_FILE_SIZE) throw new Error(`${label} must be smaller than 10 MB.`);
    return file;
  }

  checkSubmitButton() {
    const button = document.getElementById("submitVerificationBtn");
    if (!button) return;
    const front = document.getElementById("idFrontFileInput")?.files?.[0];
    const back = document.getElementById("idBackFileInput")?.files?.[0];
    const ready = Boolean(front && back && front.size <= MAX_FILE_SIZE && back.size <= MAX_FILE_SIZE);
    button.disabled = !ready || this.isSubmitting;
    button.classList.toggle("btn-ready", ready && !this.isSubmitting);
  }

  setStatus(status, message) {
    const badge = document.querySelector("#statusBadge .badge");
    const title = document.getElementById("statusTitle");
    const description = document.getElementById("statusDescription");
    const icon = document.querySelector("#statusIcon i");
    const normalized = status === "approved" || status === "verified" ? "verified" : status;
    const labels = { verified: "Verified", pending: "Under review", rejected: "Action required", unverified: "Not started" };
    const copy = {
      verified: "Your identity is confirmed. All eligible account features are unlocked.",
      pending: "Your documents are securely submitted and waiting for review.",
      rejected: "Please review the feedback and upload clearer documents.",
      unverified: "Upload both sides of a valid government ID to begin."
    };
    if (badge) {
      badge.textContent = labels[normalized] || "Not started";
      badge.className = `badge ${normalized}`;
    }
    if (title) title.textContent = labels[normalized] || "Verification status";
    if (description) description.textContent = message || copy[normalized] || copy.unverified;
    if (icon) icon.className = normalized === "verified" ? "fas fa-shield-check" : normalized === "pending" ? "fas fa-hourglass-half" : normalized === "rejected" ? "fas fa-triangle-exclamation" : "fas fa-shield-halved";
  }

  subscribeToStatus(uid) {
    this.unsubscribeStatus?.();
    this.unsubscribeStatus = onSnapshot(doc(db, "users", uid), (snapshot) => {
      const data = snapshot.data() || {};
      this.setStatus(data.kycStatus || "unverified", data.kycMessage);
    }, () => this.setStatus("unverified"));
  }

  async submitVerification() {
    if (this.isSubmitting) return;
    const overlay = document.getElementById("loadingOverlay");
    const button = document.getElementById("submitVerificationBtn");
    try {
      if (!this.currentUser) throw new Error("Please sign in before submitting KYC.");
      const front = this.validateFile(document.getElementById("idFrontFileInput")?.files?.[0], "front image");
      const back = this.validateFile(document.getElementById("idBackFileInput")?.files?.[0], "back image");
      this.isSubmitting = true;
      this.checkSubmitButton();
      if (button) button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading securely…';
      if (overlay) overlay.style.display = "block";

      const uploaded = await uploadKycFrontBack(front, back);
      const uid = this.currentUser.uid;
      await setDoc(doc(db, "kycRequests", uid), {
        uid,
        email: this.currentUser.email || null,
        displayName: this.currentUser.displayName || null,
        status: "pending",
        submittedAt: serverTimestamp(),
        files: { idFrontUrl: uploaded.front.url, idBackUrl: uploaded.back.url }
      }, { merge: true });
      await setDoc(doc(db, "users", uid), {
        kycStatus: "pending",
        kycSubmittedAt: serverTimestamp()
      }, { merge: true });

      this.setStatus("pending");
      alert("KYC submitted successfully. We’ll review your verification within 24–48 hours.");
    } catch (error) {
      console.error("KYC submission error:", error);
      alert(error.message || "KYC submission failed. Please try again.");
    } finally {
      this.isSubmitting = false;
      if (overlay) overlay.style.display = "none";
      if (button) button.innerHTML = '<i class="fas fa-lock"></i> Submit for verification';
      this.checkSubmitButton();
    }
  }
}

window.submitVerification = () => window.kycPortal?.submitVerification();
window.startKYCVerification = () => document.getElementById("idFrontFileInput")?.focus();

document.addEventListener("DOMContentLoaded", () => {
  window.kycPortal = new KYCPortal();
  window.kycPortal.bindUploadPreviews();
  document.getElementById("submitVerificationBtn")?.addEventListener("click", () => window.submitVerification());
  document.getElementById("start-kyc-btn")?.addEventListener("click", () => {
    document.getElementById("idFrontFileInput")?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("idFrontFileInput")?.focus({ preventScroll: true });
  });
});

export default KYCPortal;
