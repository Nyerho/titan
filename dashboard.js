document.addEventListener('DOMContentLoaded', function () {
    function applyProfile(profile) {
        if (!profile) return;
        const map = {
            displayName: profile.displayName || '',
            email: profile.email || '',
            phoneNumber: profile.phoneNumber || ''
        };
        document.querySelectorAll('[data-user-field]').forEach(el => {
            const key = el.getAttribute('data-user-field');
            if (key && key in map) {
                el.textContent = map[key];
            }
        });
        const nameEl = document.getElementById('header-user-name');
        if (nameEl) nameEl.textContent = map.displayName || 'User';
    }

    // Apply cached profile immediately
    try {
        const cached = JSON.parse(localStorage.getItem('userProfileCache') || 'null');
        if (cached) applyProfile(cached);
    } catch (_) {}

    // React to live changes emitted by account.js or user-state.js
    window.addEventListener('user-profile-changed', (e) => {
        applyProfile(e.detail);
    });
});