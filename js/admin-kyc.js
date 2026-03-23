// top-level imports in admin-kyc.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  where,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

async function renderKycRequests() {
    const container = document.getElementById('kyc-admin-list');
    if (!container) return;
    container.innerHTML = '<p class="text-muted">Loading KYC requests...</p>';

    try {
        const q = query(collection(db, 'kycRequests'), where('status', '==', 'pending'));
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = '<p class="text-muted">No pending KYC requests.</p>';
            return;
        }

        const cards = [];
        snap.forEach(docSnap => {
            const data = docSnap.data();
            cards.push(`
                <div class="card bg-dark text-white border-secondary mt-3">
                  <div class="card-body">
                    <div class="row">
                      <div class="col-md-8">
                        <div><strong>UID:</strong> ${data.uid || docSnap.id}</div>
                        <div><strong>Email:</strong> ${data.email || ''}</div>
                        <div class="mt-2"><strong>Status:</strong> ${data.status}</div>
                      </div>
                      <div class="col-md-4 text-center">
                        <div>Front</div>
                        <img src="${data.files?.idFrontUrl || ''}" alt="Front" class="img-fluid mb-2 border" />
                        <div>Back</div>
                        <img src="${data.files?.idBackUrl || ''}" alt="Back" class="img-fluid border" />
                      </div>
                    </div>
                    <div class="mt-3 d-flex justify-content-end">
                      <button class="btn btn-success me-2" onclick="approveKyc('${docSnap.id}')">Approve</button>
                      <button class="btn btn-danger" onclick="rejectKyc('${docSnap.id}')">Reject</button>
                    </div>
                  </div>
                </div>
            `);
        });

        container.innerHTML = cards.join('');
    } catch (e) {
        console.error('Failed to load KYC requests', e);
        container.innerHTML = '<p class="text-danger">Error loading KYC requests.</p>';
    }
}

async function setKycStatus(uid, status) {
    try {
        await updateDoc(doc(db, 'kycRequests', uid), {
            status,
            reviewedAt: serverTimestamp(),
            reviewerUid: auth.currentUser?.uid || null
        });
        // Authoritative: users/{uid}.kycStatus (create/merge to ensure it exists)
        await setDoc(
          doc(db, 'users', uid),
          { kycStatus: status, kycLastReviewedAt: serverTimestamp() },
          { merge: true }
        );

        await renderKycRequests();
    } catch (e) {
        console.error('Failed to update KYC status', e);
        alert('Failed to update status. Check your Firestore rules/admin privileges.');
    }
}

window.approveKyc = (uid) => setKycStatus(uid, 'approved');
window.rejectKyc  = (uid) => setKycStatus(uid, 'rejected');

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, () => renderKycRequests());
});


// Export the function your admin.html expects
export async function renderAdminKyc(containerId = "kycAdminContainer") {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`Admin KYC container #${containerId} not found`);
    return;
  }
  container.innerHTML = `<div class="text-muted">Loading KYC requests...</div>`;

  try {
    const snap = await getDocs(collection(db, "kycRequests"));
    if (snap.empty) {
      container.innerHTML = `<div class="alert alert-info">No KYC requests found.</div>`;
      return;
    }

    const fragments = [];
    snap.forEach(d => {
      const data = d.data() || {};
      const uid = data.uid || d.id;
      const status = data.status || "pending";
      const frontUrl = data.idFrontUrl || "";
      const backUrl = data.idBackUrl || "";
      fragments.push(`
        <div class="card mb-3">
          <div class="card-body">
            <h5 class="card-title">User: ${uid}</h5>
            <p class="card-text">Status: <strong>${status}</strong></p>
            <div class="d-flex gap-3 flex-wrap">
              ${frontUrl ? `<img src="${frontUrl}" alt="ID Front" class="img-thumbnail" style="max-width:200px;">` : ""}
              ${backUrl ? `<img src="${backUrl}" alt="ID Back" class="img-thumbnail" style="max-width:200px;">` : ""}
            </div>
            <div class="mt-3 d-flex gap-2">
              <button class="btn btn-success" data-action="approve" data-id="${d.id}">Approve</button>
              <button class="btn btn-danger" data-action="reject" data-id="${d.id}">Reject</button>
            </div>
          </div>
        </div>
      `);
    });

    container.innerHTML = fragments.join("");

    // Bind approve/reject
    container.querySelectorAll("button[data-action]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const action = btn.getAttribute("data-action");
        try {
          // Use the unified path that updates users/{uid}.kycStatus as source of truth
          await setKycStatus(id, action === "approve" ? "approved" : "rejected");
          btn.closest(".card").querySelector(".card-text").innerHTML = `Status: <strong>${action === "approve" ? "approved" : "rejected"}</strong>`;
        } catch (err) {
          console.error("Failed to update KYC status", err);
          alert("Failed to update status. Check console.");
        }
      });
    });

  } catch (err) {
    console.error("Failed to load KYC requests", err);
    container.innerHTML = `<div class="alert alert-danger">Failed to load KYC requests. Check console.</div>`;
  }
}