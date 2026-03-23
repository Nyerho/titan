// User KYC: Government ID Front/Back only
// Imports must be at top-level (ES module)
import { auth, storage, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, updateDoc, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";


class KYCPortal {
    constructor() {
        this.currentUser = null;
        onAuthStateChanged(auth, (user) => {
            this.currentUser = user || null;
            // Check button state on auth changes
            this.checkSubmitButton();
        });
    }

    bindUploadPreviews() {
        const ensureNameEl = (id) => {
            let el = document.getElementById(id);
            if (!el) {
                el = document.createElement('span');
                el.id = id;
                el.className = 'text-muted d-block mt-2';
                el.textContent = 'No file selected';
                // Try to place next to its input
                const inputId = id.includes('Front') ? 'idFrontFileInput' : 'idBackFileInput';
                const input = document.getElementById(inputId);
                if (input && input.parentNode) {
                    input.parentNode.insertBefore(el, input.nextSibling);
                }
            }
            return el;
        };

        const bindNameOnly = (inputId, nameSpanId, imgId) => {
            const input = document.getElementById(inputId);
            const nameEl = ensureNameEl(nameSpanId);
            const img = document.getElementById(imgId);
            if (!input || !nameEl) return;

            const updateName = () => {
                const file = input.files?.[0];
                nameEl.textContent = file ? file.name : 'No file selected';
                // Always hide image preview
                if (img) {
                    img.src = '';
                    img.style.display = 'none';
                }
                this.checkSubmitButton();
            };

            input.addEventListener('change', updateName);
            // Initialize on load
            updateName();
        };

        // Show only filenames for front/back; keep previews hidden
        bindNameOnly('idFrontFileInput', 'idFrontFileName', 'idFrontPreview');
        bindNameOnly('idBackFileInput', 'idBackFileName', 'idBackPreview');
    }

    checkSubmitButton() {
        const frontFile = document.getElementById('idFrontFileInput')?.files?.[0];
        const backFile  = document.getElementById('idBackFileInput')?.files?.[0];
        const submitBtn = document.getElementById('submitVerificationBtn');

        if (frontFile && backFile && submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.add('btn-ready');
        } else if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.remove('btn-ready');
        }
    }

    async submitVerification() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'block';

        try {
            if (!this.currentUser) {
                throw new Error("Please sign in before submitting KYC.");
            }

            // Try preferred IDs first
            const frontInput =
                document.getElementById('idFrontFileInput') ||
                document.getElementById('kycFrontFile');
            const backInput  =
                document.getElementById('idBackFileInput') ||
                document.getElementById('kycBackFile');

            let frontFile = frontInput?.files?.[0] || null;
            let backFile  = backInput?.files?.[0]  || null;

            // Fallback: scan all file inputs and pick first two selected files
            if (!frontFile || !backFile) {
                const selectedFiles = Array
                    .from(document.querySelectorAll('input[type="file"]'))
                    .map(inp => inp.files?.[0])
                    .filter(Boolean);
                if (selectedFiles.length >= 2) {
                    [frontFile, backFile] = selectedFiles.slice(0, 2);
                }
            }

            if (!frontFile || !backFile) {
                console.warn('File detection failed.', {
                    frontInputFound: !!frontInput,
                    backInputFound: !!backInput,
                    frontHasFile: !!frontFile,
                    backHasFile: !!backFile,
                    allFileInputsCount: Array.from(document.querySelectorAll('input[type="file"]')).length
                });
                throw new Error("Both front and back ID images are required. Please select your files again.");
            }

            // Show only filenames (no preview)
            const frontNameEl = document.getElementById('idFrontFileName');
            const backNameEl  = document.getElementById('idBackFileName');
            if (frontNameEl) frontNameEl.textContent = frontFile.name;
            if (backNameEl)  backNameEl.textContent  = backFile.name;

            // Upload to Firebase Storage
            const uid = this.currentUser.uid;
            const ts = Date.now();
            const basePath = `kyc/${uid}/`;

            const uploadAndGetUrl = async (file, path) => {
                const r = ref(storage, path);
                await uploadBytes(r, file, { contentType: file.type || "image/jpeg" });
                return await getDownloadURL(r);
            };

            const idFrontUrl = await uploadAndGetUrl(frontFile, `${basePath}${ts}_id_front_${frontFile.name}`);
            const idBackUrl  = await uploadAndGetUrl(backFile,  `${basePath}${ts}_id_back_${backFile.name}`);

            // Write Firestore request for admin review
            await setDoc(doc(db, 'kycRequests', uid), {
                uid,
                email: this.currentUser.email || null,
                displayName: this.currentUser.displayName || null,
                status: 'pending',
                submittedAt: serverTimestamp(),
                files: {
                    idFrontUrl,
                    idBackUrl
                }
            }, { merge: true });

            // Reflect status in users collection; ignore if users doc doesn’t exist
            await updateDoc(doc(db, 'users', uid), {
                kycStatus: 'pending',
                kycSubmittedAt: serverTimestamp()
            }).catch(() => {});

            alert('KYC submitted. We will review your verification within 24–48 hours.');
        } catch (err) {
            console.error('KYC submission error:', err);
            alert(err.message || 'Failed to submit KYC.');
        } finally {
            if (overlay) overlay.style.display = 'none';
        }
    }
}

// Expose minimal globals for inline onclick usage (Bootstrap button)
window.submitVerification = () => {
    if (window.kycPortal) {
        window.kycPortal.submitVerification();
    }
};
// If your HTML still calls startKYCVerification inline, define a harmless stub
window.startKYCVerification = () => {};

// Initialize on DOM ready (single block)
document.addEventListener('DOMContentLoaded', () => {
    window.kycPortal = new KYCPortal();
    window.kycPortal.bindUploadPreviews();

    // Force hide previews and show filenames only
    disableKycImagePreview();

    // Keep KYC status synced from users/{uid}
    ensureKycStatusFromUsers();

    // Bind the existing button to the submit function
    const submitBtn = document.getElementById('submitVerificationBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', () => window.submitVerification());
    }
});

export default KYCPortal;


// Example: after you set the preview src for the selected file
// Top-level module scope
function setKycImagePreview(imgEl, fileUrl) {
  if (!imgEl) return;
  imgEl.src = fileUrl;
  imgEl.classList.add('kyc-image-preview'); // ensure sizing rules apply
}


// Force disable image previews and show only filenames
function disableKycImagePreview() {
  const frontInput = document.getElementById('idFrontFileInput');
  const backInput  = document.getElementById('idBackFileInput');
  const frontImg   = document.getElementById('idFrontPreview');
  const backImg    = document.getElementById('idBackPreview');

  const hideImg = (img) => {
    if (!img) return;
    // Remove src attribute only if present to avoid triggering repeated mutations
    if (img.hasAttribute('src')) {
      img.removeAttribute('src');
    }
    img.style.display = 'none';
    img.removeAttribute('srcset');
  };

  hideImg(frontImg);
  hideImg(backImg);

  const frontNameEl = document.getElementById('idFrontFileName');
  const backNameEl  = document.getElementById('idBackFileName');

  const updateName = (input, nameEl) => {
    if (!nameEl || !input) return;
    const f = input.files?.[0];
    nameEl.textContent = f ? f.name : 'No file selected';
  };

  frontInput && frontInput.addEventListener('change', () => {
    updateName(frontInput, frontNameEl);
    hideImg(frontImg);
  });

  backInput && backInput.addEventListener('change', () => {
    updateName(backInput, backNameEl);
    hideImg(backImg);
  });

  // Guard against other code re-enabling previews without causing recursive mutations
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'src') {
        const t = m.target;
        if ((t.id === 'idFrontPreview' || t.id === 'idBackPreview') && t.getAttribute('src')) {
          hideImg(t);
        }
      }
    }
  });
  [frontImg, backImg].forEach(img => {
    if (img) observer.observe(img, { attributes: true, attributeFilter: ['src'] });
  });
}

// Subscribe to the user's profile doc and reflect KYC status from the authoritative source
function ensureKycStatusFromUsers() {
  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    const userDocRef = doc(db, "users", user.uid);
    onSnapshot(userDocRef, (snap) => {
      const data = snap.data() || {};
      const status = data.kycStatus ?? "pending";
      const badgeContainer = document.getElementById("statusBadge");
      if (badgeContainer) {
        const badge = badgeContainer.querySelector(".badge") || badgeContainer;
        badge.textContent = (status === 'approved') ? 'Verified' : (status.charAt(0).toUpperCase() + status.slice(1));
        badge.classList.remove("verified","pending","unverified","bg-success","bg-warning","bg-secondary");
        // Map approved to verified style
        if (status === "approved" || status === "verified") {
          badge.classList.add("verified", "bg-success");
        } else if (status === "pending") {
          badge.classList.add("pending", "bg-warning");
        } else {
          badge.classList.add("unverified", "bg-secondary");
        }
      }
    });
  });
}

// Robustly bind the submit button (prevents duplicates and works if IDs differ)
function bindKycSubmit() {
  const btn = document.getElementById('kycSubmitBtn') || document.getElementById('kyc-submit');
  const form = document.getElementById('kycForm') || document.querySelector('form[data-kyc="true"]');
  if (!btn && !form) return;

  const handleSubmit = async (evt) => {
    evt?.preventDefault?.();
    const frontInput = document.getElementById('kycFrontFile');
    const backInput  = document.getElementById('kycBackFile');

    const frontFile = frontInput?.files?.[0] || null;
    const backFile  = backInput?.files?.[0] || null;
    if (!frontFile || !backFile) {
      alert('Please choose both front and back images.');
      return;
    }

    // Show only filenames (no preview)
    const frontNameEl = document.getElementById('kycFrontFileName');
    const backNameEl  = document.getElementById('kycBackFileName');
    if (frontNameEl) frontNameEl.textContent = frontFile.name;
    if (backNameEl)  backNameEl.textContent  = backFile.name;

    // Disable submit to avoid double submissions
    const prevText = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Submitting...';
    }

    try {
      // If your project has a submit handler, call it; else rely on existing upload code
      if (typeof window.handleKycSubmit === 'function') {
        await window.handleKycSubmit(frontFile, backFile);
      } else if (typeof window.uploadKycFrontBack === 'function') {
        // If you exported from kyc-storage.js
        const user = auth.currentUser;
        if (!user) throw new Error('Not signed in');
        await window.uploadKycFrontBack(user.uid, frontFile, backFile);
      } else {
        console.warn('No KYC submit function found. Please export handleKycSubmit or uploadKycFrontBack.');
        alert('Upload function missing. Contact support.');
      }
    } catch (err) {
      console.error('KYC submit failed', err);
      alert('KYC submission error. Check console.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevText || 'Submit';
      }
    }
  };

  // Bind to button click and/or form submit
  btn?.addEventListener('click', handleSubmit);
  form?.addEventListener('submit', handleSubmit);
}