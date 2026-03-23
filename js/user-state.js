(function () {
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load script: ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureFirebaseCompatLoaded() {
    if (window.firebase) return;
    const base = 'https://www.gstatic.com/firebasejs/9.22.2';
    await loadScript(`${base}/firebase-app-compat.js`);
    await loadScript(`${base}/firebase-auth-compat.js`);
    await loadScript(`${base}/firebase-firestore-compat.js`);
    if (!window.firebase) throw new Error('Firebase compat SDK failed to load.');
  }

  async function ensureFirebaseAppInitialized() {
    const cfg = window.firebaseConfig || window.FB_CONFIG;
    if (!cfg) {
      throw new Error('Firebase config not found.');
    }
    if (!window.firebase) {
      await ensureFirebaseCompatLoaded();
    }
    if (window.firebase && window.firebase.apps && window.firebase.apps.length === 0) {
      window.firebase.initializeApp(cfg);
    }
    return window.firebase;
  }

  function updateDomFromProfile(profile) {
    if (!profile) return;
    const name = profile.displayName || profile.fullName || '';
    const email = profile.email || '';
    const phone = profile.phoneNumber || '';
  
    // Update elements annotated with data-user-field
    document.querySelectorAll('[data-user-field]').forEach((el) => {
      const field = el.getAttribute('data-user-field');
      if (field && profile[field] !== undefined) {
        el.textContent = String(profile[field] ?? '');
      }
    });
  
    // Update a common header element if present
    const headerName = document.getElementById('current-user-name');
    if (headerName) headerName.textContent = name;
  }

  // Define a helper to consistently merge Auth and Firestore profile data
  function mergeProfile(user, data) {
    const profile = data || {};
    return {
      uid: user.uid,
      displayName: profile.displayName || profile.fullName || user.displayName || '',
      fullName: profile.fullName || profile.displayName || user.displayName || '',
      email: user.email || profile.email || '',
      phoneNumber: profile.phoneNumber || ''
    };
  }

  async function startSync() {
    try {
      try {
        if (localStorage.getItem('tt_demo_mode') === '1') {
          const raw = localStorage.getItem('tt_demo_profile');
          const profile = raw ? JSON.parse(raw) : { displayName: 'Demo Trader', email: 'demo@titantrades.com' };
          updateDomFromProfile(profile);
          window.dispatchEvent(new CustomEvent('user-profile-changed', { detail: profile }));
          return;
        }
      } catch (_) {}

      const firebaseCompat = await ensureFirebaseAppInitialized();
      const auth = firebaseCompat.auth();
      const db = firebaseCompat.firestore();

      // Apply cached profile immediately
      try {
        const cached = localStorage.getItem('userProfileCache');
        if (cached) updateDomFromProfile(JSON.parse(cached));
      } catch (e) {
        console.warn('user-state: failed to read cached profile', e);
      }

      let unsubscribe = null;

      auth.onAuthStateChanged((user) => {
        if (unsubscribe) {
          try { unsubscribe(); } catch (_) {}
          unsubscribe = null;
        }

        if (!user) {
          try { localStorage.removeItem('userProfileCache'); } catch (_) {}
          updateDomFromProfile({ displayName: '', email: '', phoneNumber: '' });
          window.dispatchEvent(new CustomEvent('user-profile-changed', { detail: null }));
          return;
        }

        const uid = user.uid;
        const profilesRef = db.collection('profiles').doc(uid);
        const usersRef = db.collection('users').doc(uid);

        unsubscribe = profilesRef.onSnapshot(
          (snap) => {
            if (!snap.exists) {
              if (unsubscribe) {
                try { unsubscribe(); } catch (_) {}
                unsubscribe = null;
              }
              unsubscribe = usersRef.onSnapshot(
                (userSnap) => {
                  const usersData = userSnap.exists ? userSnap.data() : {};
                  const profile = mergeProfile(user, usersData || {});
                  try { localStorage.setItem('userProfileCache', JSON.stringify(profile)); } catch (_) {}
                  window.dispatchEvent(new CustomEvent('user-profile-changed', { detail: profile }));
                  updateDomFromProfile(profile);
                },
                (err) => {
                  console.warn('user-state: users snapshot error:', err);
                  const profile = mergeProfile(user, {});
                  updateDomFromProfile(profile);
                }
              );
              return;
            }

            const data = snap.data() || {};
            const profile = mergeProfile(user, data);
            try { localStorage.setItem('userProfileCache', JSON.stringify(profile)); } catch (_) {}
            window.dispatchEvent(new CustomEvent('user-profile-changed', { detail: profile }));
            updateDomFromProfile(profile);
          },
          (err) => {
            console.warn('user-state: profiles snapshot error:', err);
            const profile = mergeProfile(user, {});
            updateDomFromProfile(profile);
          }
        );
      });

      window.addEventListener('beforeunload', () => {
        if (unsubscribe) {
          try { unsubscribe(); } catch (_) {}
        }
      });

      // React to cross-page saves (Account page)
      window.addEventListener('user-profile-changed', (e) => {
        const profile = e.detail || {};
        try { localStorage.setItem('userProfileCache', JSON.stringify(profile)); } catch (_) {}
        updateDomFromProfile(profile);
      });
    } catch (err) {
      console.error('user-state: Firebase init failed:', err);
      return;
    }
  }

  // Expose a global for dashboard.html onload
  window.checkUserState = function() {
    try {
      startSync();
    } catch (e) {
      console.error('checkUserState failed:', e);
    }
  };
  window.logout = async function() {
    try {
      if (localStorage.getItem('tt_demo_mode') === '1') {
        try { localStorage.removeItem('tt_demo_mode'); } catch (_) {}
        try { localStorage.removeItem('tt_demo_profile'); } catch (_) {}
        try { localStorage.removeItem('tt_demo_balance'); } catch (_) {}
        try { localStorage.removeItem('tt_demo_botsOwned'); } catch (_) {}
        window.location.href = 'auth.html';
        return;
      }
    } catch (_) {}

    try {
      const firebaseCompat = await ensureFirebaseAppInitialized();
      await firebaseCompat.auth().signOut();
    } catch (e) {
      console.error('logout failed:', e);
    } finally {
      window.location.href = 'auth.html';
    }
  };
  document.addEventListener('DOMContentLoaded', startSync);
})();
