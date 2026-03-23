// Admin Password Reset Sender (modular Firebase v10)
import { auth } from './firebase-config.js';
import {
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

function computeResetUrl() {
  return `${window.location.origin}/forgot-password.html`;
}

function showStatus(message, type = 'info') {
  const el = document.getElementById('resetStatus');
  if (el) {
    el.textContent = message;
    el.style.color = type === 'error' ? '#d32f2f' : type === 'success' ? '#2e7d32' : '#1976d2';
  } else {
    alert(message);
  }
}

async function handleSendReset() {
  const emailInput = document.getElementById('resetEmail');
  const btn = document.getElementById('sendResetBtn');
  if (!emailInput) {
    showStatus('Email input (#resetEmail) not found on this page.', 'error');
    return;
  }
  const email = emailInput.value.trim();
  if (!email) {
    showStatus('Please enter an email address.', 'error');
    return;
  }

  btn && (btn.disabled = true);

  try {
    // Check sign-in methods to avoid sending to non-password accounts
    const methods = await fetchSignInMethodsForEmail(auth, email);
    if (!methods.includes('password')) {
      showStatus('This account is not using Email/Password sign-in. A password reset email cannot be sent.', 'error');
      return;
    }

    const actionCodeSettings = {
      url: computeResetUrl(),   // Must be on an Authorized domain
      handleCodeInApp: false,
    };

    await sendPasswordResetEmail(auth, email, actionCodeSettings);
    // Note: Firebase does not reveal user existence. A successful call means “request accepted”, email delivery depends on a valid account+provider.
    showStatus('If the account exists with Email/Password, a reset email has been sent.', 'success');
  } catch (error) {
    console.error('sendPasswordResetEmail error:', error);
    let msg = 'Failed to send reset email.';

    switch (error.code) {
      case 'auth/invalid-email':
        msg = 'Invalid email format.';
        break;
      case 'auth/missing-android-pkg-name':
      case 'auth/missing-continue-uri':
      case 'auth/unauthorized-continue-uri':
        msg = 'Reset URL is invalid or not authorized. Make sure your domain is in Firebase Auth “Authorized domains”.';
        break;
      case 'auth/user-not-found':
        // Depending on Firebase settings, you may or may not get this error code for non-existing users.
        msg = 'No user found for this email (or privacy settings prevent disclosure).';
        break;
      default:
        msg = `Error: ${error.message || error.code || 'unknown'}`;
    }
    showStatus(msg, 'error');
  } finally {
    btn && (btn.disabled = false);
  }
}

function initAdminReset() {
  const btn = document.getElementById('sendResetBtn');
  if (!btn) {
    // You can still attach from elsewhere
    console.warn('Reset button (#sendResetBtn) not found.');
    return;
  }
  btn.addEventListener('click', handleSendReset);
}

document.addEventListener('DOMContentLoaded', initAdminReset);