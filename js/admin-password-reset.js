// Admin Password Reset Sender (backend)

function computeContinueUrl() {
  const origin = typeof window !== 'undefined' ? String(window.location?.origin || '') : '';
  const baseUrl = origin && origin !== 'null' ? origin : '';
  const isProdDomain =
    baseUrl.startsWith('https://www.centraltradekeplr.com') ||
    baseUrl.startsWith('https://centraltradekeplr.com') ||
    baseUrl.startsWith('https://www.titantrades.org') ||
    baseUrl.startsWith('https://titantrades.org') ||
    baseUrl.startsWith('https://www.titantrades.com') ||
    baseUrl.startsWith('https://titantrades.com');
  const continueBase = isProdDomain ? baseUrl : 'https://titantrades.org';
  return `${continueBase}/reset-password.html`;
}

function computeApiBaseUrl() {
  const isLocal = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.port === '5500' ||
    window.location.port === '3000' ||
    window.location.protocol === 'file:' ||
    window.location.href.includes('localhost');
  const storedBaseUrl = localStorage.getItem('admin_api_baseUrl') || localStorage.getItem('tt_api_baseUrl');
  if (storedBaseUrl) return storedBaseUrl;
  if (isLocal) return 'http://localhost:3001';
  const origin = String(window.location.origin || '').trim();
  if (origin.includes('onrender.com')) return origin;
  return 'https://titantrades.onrender.com';
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
    const continueUrl = computeContinueUrl();
    const baseUrl = computeApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/auth/password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, continueUrl })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to send reset email');
    }
    if (data?.throttled) {
      showStatus('Please wait a moment and try again.', 'error');
      return;
    }
    showStatus('If the account exists, a reset email has been sent.', 'success');
  } catch (error) {
    console.error('Password reset error:', error);
    showStatus(`Error: ${error.message || 'Failed to send reset email.'}`, 'error');
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
