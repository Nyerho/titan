// Top-level config (near your existing config/constants)
const USE_EXTERNAL_DELETE = false; // force half-delete mode (skip external APIs)
const PROD_API_BASE = 'https://www.centraltradekeplr.com/api';
const LOCAL_API_BASE = 'http://localhost:3001/api';

// Helper: delete Firestore document for this user (half-delete)
async function deleteFirestoreUser(uid) {
    // v9 modular Firestore (preferred)
    if (typeof deleteDoc === 'function' && typeof doc === 'function' && typeof db !== 'undefined') {
        await deleteDoc(doc(db, 'users', uid));
        // Optional audit/tombstone
        try {
            await setDoc(doc(db, 'deleted_users', uid), { uid, deletedAt: serverTimestamp() });
        } catch (auditErr) {
            console.warn('Could not write delete audit record:', auditErr);
        }
        return;
    }

    // v8 namespaced Firestore fallback
    if (window.firebase?.firestore) {
        const fs = window.firebase.firestore();
        await fs.collection('users').doc(uid).delete();
        try {
            await fs.collection('deleted_users').doc(uid).set({
                uid,
                deletedAt: window.firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (auditErr) {
            console.warn('Could not write delete audit record (v8):', auditErr);
        }
        return;
    }

    throw new Error('Firestore not initialized. Ensure db (v9) or firebase.firestore() (v8) is available.');
}

async function tryDeleteFromApi(uid) {
    // Attempt primary (prod) delete
    const primaryUrl = `${PROD_API_BASE}/users/${encodeURIComponent(uid)}`;
    console.log('DELETE URL:', primaryUrl);
    try {
        const res = await fetch(primaryUrl, { method: 'DELETE' });
        console.log('Delete response status:', res.status);

        if (res.ok) {
            return { ok: true, source: 'prod', status: res.status };
        }
        if (res.status === 404) {
            console.warn('Primary delete endpoint not found. Retrying against local admin server...');
        } else {
            console.warn('Primary delete failed with status:', res.status);
        }
    } catch (e) {
        console.error('Primary delete failed:', e);
    }

    // Fallback to local admin server
    const localUrl = `${LOCAL_API_BASE}/users/${encodeURIComponent(uid)}`;
    console.log('DELETE URL:', localUrl);
    try {
        const res2 = await fetch(localUrl, { method: 'DELETE' });
        console.log('Local delete status:', res2.status);
        if (res2.ok) {
            return { ok: true, source: 'local', status: res2.status };
        }
        return { ok: false, source: 'local', status: res2.status };
    } catch (e2) {
        console.error('Local admin server not reachable.', e2);
        return { ok: false, source: 'local', error: e2.message };
    }
}

// Replace external delete attempts with Firestore-only half delete
async function tryDelete(uid) {
    console.log('Half delete: removing Firestore document for uid:', uid);

    // Hard block external endpoints in half-delete mode
    if (USE_EXTERNAL_DELETE) {
        console.warn('USE_EXTERNAL_DELETE is true, but half-delete mode is intended to skip external endpoints.');
    }

    await deleteFirestoreUser(uid);
    return { deletedFirestore: true, deletedAuth: false };
}

// If handleDeleteUser belongs to a class, keep the same method name/signature
async function handleDeleteUser(uid) {
    // Set any UI deleting state (spinner/disabled button)
    setDeletingUIState(uid, true);
    try {
        console.log('Attempting half delete (Firestore only) for user:', uid);
        const result = await tryDelete(uid);

        // Update UI to reflect deletion in app data
        removeUserRow(uid);
        toastSuccess(
            'User deleted from app data',
            `Firestore: ${result.deletedFirestore}, Auth: ${result.deletedAuth} (not deleted)`
        );
    } catch (err) {
        console.error('Delete user error:', err);
        toastError('Delete failed', err?.message || String(err));
        setDeletingUIState(uid, false); // revert UI to non-deleting state
    }
}

function removeUserRow(uid) {
    // Remove the row or card associated with the user from the admin table/list
    // Adjust selectors to match your markup (e.g., data-user-id or row id)
    const row = document.querySelector(`[data-user-id="${uid}"]`);
    if (row) row.remove();
}

function setDeletingUIState(uid, isDeleting) {
    // Optional: disable delete button and show spinner for that specific user row
    const btn = document.querySelector(`[data-user-id="${uid}"] .delete-btn`);
    if (btn) {
        btn.disabled = isDeleting;
        btn.classList.toggle('is-loading', isDeleting);
    }
}

function toastSuccess(title, message) { console.log('[SUCCESS]', title, message); }
function toastError(title, message) { console.error('[ERROR]', title, message); }

function renderUserRow(userDocData) {
    // Example renderer: adjust to your actual table markup
    const { uid, email, displayName, phoneNumber, password_last_changed_at, password_strength_score } = userDocData;
    const table = document.querySelector('#admin-users-table tbody');
    if (!table) return;

    const tr = document.createElement('tr');
    tr.setAttribute('data-user-id', uid);
    tr.innerHTML = `
        <td>${displayName || ''}</td>
        <td>${email || ''}</td>
        <td>${phoneNumber || ''}</td>
        <td>${password_last_changed_at ? new Date(password_last_changed_at.seconds ? password_last_changed_at.seconds * 1000 : password_last_changed_at).toLocaleString() : '—'}</td>
        <td>${typeof password_strength_score === 'number' ? password_strength_score : '—'}</td>
        <td>
            <button class="btn btn-sm btn-danger delete-btn" onclick="handleDeleteUser('${uid}')">Delete</button>
            <button class="btn btn-sm btn-secondary" onclick="sendPasswordReset('${email}')">Send Reset</button>
        </td>
    `;
    table.appendChild(tr);
}

async function sendPasswordReset(email) {
    try {
        // v8
        if (window.firebase?.auth) {
            await window.firebase.auth().sendPasswordResetEmail(email);
            toastSuccess('Reset email sent', email);
            return;
        }
        // v9
        const { getAuth, sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js');
        await sendPasswordResetEmail(getAuth(), email);
        toastSuccess('Reset email sent', email);
    } catch (e) {
        toastError('Reset email failed', e?.message || String(e));
    }
}