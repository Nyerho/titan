import FirebaseAuthService from './firebase-auth.js';
import FirebaseDatabaseService from './firebase-database.js';
import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getIdTokenResult } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.isLoggedIn = false;
    this.isInitialized = false;
    this._isAdmin = false;
    this._verificationPollInterval = null;
    this._verificationPollStartedAt = 0;
    this.initializeEmailService();
    this.initializeFirebaseAuth();
  }

  clearDemoMode() {
    try { localStorage.removeItem('tt_demo_mode'); } catch (_) {}
    try { localStorage.removeItem('tt_demo_profile'); } catch (_) {}
    try { localStorage.removeItem('tt_demo_balance'); } catch (_) {}
    try { localStorage.removeItem('tt_demo_botsOwned'); } catch (_) {}
  }

  // Add the missing initialize method
  async initialize() {
    try {
      console.log('Initializing AuthManager...');
      
      // If already initialized, return current user
      if (this.isInitialized) {
        console.log('AuthManager already initialized');
        return this.currentUser;
      }
      
      // Wait for Firebase auth to be ready
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error('Authentication initialization timeout');
          reject(new Error('Authentication initialization timeout'));
        }, 15000); // Increased to 15 second timeout
        
        const unsubscribe = FirebaseAuthService.addAuthStateListener((user) => {
          clearTimeout(timeout);
          this.currentUser = user;
          this.isLoggedIn = !!user;
          this.isInitialized = true;
          this.updateUI();
          console.log('AuthManager initialized with user:', user ? user.email : 'No user');
          if (typeof unsubscribe === 'function') {
            unsubscribe(); // Remove listener after first call
          }
          resolve(user);
        });
      });
    } catch (error) {
      console.error('Error initializing AuthManager:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  // Add onAuthStateChanged method that main.js expects
  onAuthStateChanged(callback) {
    FirebaseAuthService.addAuthStateListener(callback);
  }

  async initializeEmailService() {
    try {
      const { default: EmailService } = await import('./email-service.js');
      this.emailService = new EmailService();
      console.log('Email service initialized successfully');
    } catch (error) {
      console.warn('Email service failed to initialize:', error.message);
      this.emailService = null; // Continue without email service
    }
  }

  showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 5px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      max-width: 300px;
      word-wrap: break-word;
    `;
    
    if (type === 'success') {
      messageDiv.style.backgroundColor = '#22c55e';
    } else if (type === 'error') {
      messageDiv.style.backgroundColor = '#ef4444';
    } else {
      messageDiv.style.backgroundColor = '#3b82f6';
    }
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.parentNode.removeChild(messageDiv);
      }
    }, 5000);
  }

  async isUserVerified() {
    const user = this.currentUser;
    if (!user) return false;
    try { await user.reload(); } catch (e) {}
    return !!user.emailVerified || !!user.phoneNumber;
  }

  ensureVerificationBanner() {
    try {
      const removeUi = () => {
        const existing = document.getElementById('ttVerificationBanner');
        if (existing) existing.remove();
        const modal = document.getElementById('ttPhoneVerifyModal');
        if (modal) modal.remove();
        try { document.body.style.paddingTop = ''; } catch (_) {}
        try { document.body.style.overflow = ''; } catch (_) {}
        if (this._verificationPollInterval) {
          clearInterval(this._verificationPollInterval);
          this._verificationPollInterval = null;
        }
        this._verificationPollStartedAt = 0;
      };

      const path = String(window.location?.pathname || '').toLowerCase();
      const file = (path.split('/').pop() || '').toLowerCase();
      const isBlockedPage =
        file === 'auth.html' ||
        file === 'admin.html' ||
        file === 'user-management.html' ||
        file === 'cot-admin.html' ||
        file === 'index.html' ||
        file === '' ||
        path.includes('/admin');

      if (isBlockedPage) {
        removeUi();
        return;
      }

      const existing = document.getElementById('ttVerificationBanner');
      if (!this.currentUser || this._isAdmin) {
        removeUi();
        return;
      }

      const verified = !!this.currentUser.emailVerified || !!this.currentUser.phoneNumber;
      if (verified) {
        removeUi();
        return;
      }

      if (existing) return;

      const startAutoClearPoll = () => {
        if (this._verificationPollInterval) return;
        this._verificationPollStartedAt = Date.now();
        this._verificationPollInterval = setInterval(async () => {
          const user = this.currentUser;
          if (!user) {
            removeUi();
            return;
          }

          if (Date.now() - this._verificationPollStartedAt > 2 * 60 * 1000) {
            clearInterval(this._verificationPollInterval);
            this._verificationPollInterval = null;
            return;
          }

          try { await user.reload(); } catch (_) {}
          const verifiedNow = !!user.emailVerified || !!user.phoneNumber;
          if (verifiedNow) removeUi();
        }, 5000);
      };

      const openPhoneModal = () => {
        const existingModal = document.getElementById('ttPhoneVerifyModal');
        if (existingModal) existingModal.remove();

        const overlay = document.createElement('div');
        overlay.id = 'ttPhoneVerifyModal';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:10002;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';

        const card = document.createElement('div');
        card.style.cssText = 'width:100%;max-width:420px;background:#0b1220;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:14px;box-shadow:0 10px 40px rgba(0,0,0,.35);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px';

        const title = document.createElement('div');
        title.textContent = 'Verify phone number';
        title.style.cssText = 'font-weight:700;font-size:16px';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = 'border:0;background:transparent;color:#93c5fd;cursor:pointer;padding:6px 8px';

        const phoneLabel = document.createElement('div');
        phoneLabel.textContent = 'Phone number (include country code)';
        phoneLabel.style.cssText = 'font-size:13px;opacity:.9;margin:10px 0 6px';

        const phoneInput = document.createElement('input');
        phoneInput.type = 'tel';
        phoneInput.placeholder = '+1 555 123 4567';
        phoneInput.autocomplete = 'tel';
        phoneInput.style.cssText = 'width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:#111827;color:#fff;outline:none';

        const recaptcha = document.createElement('div');
        recaptcha.id = 'ttPhoneRecaptcha';
        recaptcha.style.cssText = 'margin:12px 0';

        const sendBtn = document.createElement('button');
        sendBtn.type = 'button';
        sendBtn.textContent = 'Send code';
        sendBtn.style.cssText = 'border:0;background:#2563eb;color:#fff;padding:10px 12px;border-radius:10px;cursor:pointer;width:100%;font-weight:600';

        const codeLabel = document.createElement('div');
        codeLabel.textContent = 'Verification code';
        codeLabel.style.cssText = 'font-size:13px;opacity:.9;margin:12px 0 6px';

        const codeInput = document.createElement('input');
        codeInput.type = 'text';
        codeInput.inputMode = 'numeric';
        codeInput.placeholder = '123456';
        codeInput.autocomplete = 'one-time-code';
        codeInput.disabled = true;
        codeInput.style.cssText = 'width:100%;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:#111827;color:#fff;outline:none;opacity:.7';

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.textContent = 'Confirm';
        confirmBtn.disabled = true;
        confirmBtn.style.cssText = 'border:0;background:#22c55e;color:#0b1220;padding:10px 12px;border-radius:10px;cursor:pointer;width:100%;font-weight:800;margin-top:10px;opacity:.7';

        let resendCooldownInterval = null;

        const cleanup = () => {
          try { document.body.style.overflow = ''; } catch (_) {}
          try { FirebaseAuthService.clearPhoneRecaptcha?.(); } catch (_) {}
          if (resendCooldownInterval) {
            clearInterval(resendCooldownInterval);
            resendCooldownInterval = null;
          }
          overlay.remove();
        };

        closeBtn.onclick = cleanup;
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) cleanup();
        });

        sendBtn.onclick = async () => {
          const rawPhone = String(phoneInput.value || '').trim();
          const phone = rawPhone.replace(/[^\d+]/g, '');
          if (!phone) {
            this.showMessage('Enter your phone number first', 'error');
            return;
          }
          if (!phone.startsWith('+') || phone.length < 8) {
            this.showMessage('Use full country code format like +233XXXXXXXXX', 'error');
            return;
          }

          sendBtn.disabled = true;
          sendBtn.style.opacity = '.7';
          try {
            const result = await FirebaseAuthService.sendPhoneLinkVerificationCode(phone, recaptcha);
            if (!result.success) {
              this.showMessage(result.message || 'Failed to send verification code', 'error');
              sendBtn.disabled = false;
              sendBtn.style.opacity = '1';
              return;
            }
            this.showMessage('Verification code sent. If you don’t receive it in 2 minutes, try Resend or a different number.', 'success');
            codeInput.disabled = false;
            codeInput.style.opacity = '1';
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';

            if (resendCooldownInterval) clearInterval(resendCooldownInterval);
            let remaining = 30;
            sendBtn.disabled = true;
            sendBtn.style.opacity = '.7';
            sendBtn.textContent = `Resend (${remaining})`;
            resendCooldownInterval = setInterval(() => {
              remaining -= 1;
              if (remaining <= 0) {
                clearInterval(resendCooldownInterval);
                resendCooldownInterval = null;
                sendBtn.disabled = false;
                sendBtn.style.opacity = '1';
                sendBtn.textContent = 'Resend code';
                return;
              }
              sendBtn.textContent = `Resend (${remaining})`;
            }, 1000);
          } catch (err) {
            this.showMessage('Failed to send verification code', 'error');
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
          }
        };

        confirmBtn.onclick = async () => {
          const code = String(codeInput.value || '').trim();
          if (!code) {
            this.showMessage('Enter the verification code', 'error');
            return;
          }

          confirmBtn.disabled = true;
          confirmBtn.style.opacity = '.7';
          try {
            const result = await FirebaseAuthService.confirmPhoneLinkVerificationCode(code);
            if (!result.success) {
              this.showMessage(result.message || 'Invalid code', 'error');
              confirmBtn.disabled = false;
              confirmBtn.style.opacity = '1';
              return;
            }

            this.currentUser = result.user;
            try { await this.currentUser?.reload?.(); } catch (_) {}
            cleanup();
            this.ensureVerificationBanner();
            this.showMessage('Phone verified successfully', 'success');
          } catch (err) {
            this.showMessage('Phone verification failed', 'error');
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
          }
        };

        header.appendChild(title);
        header.appendChild(closeBtn);
        card.appendChild(header);
        card.appendChild(phoneLabel);
        card.appendChild(phoneInput);
        card.appendChild(recaptcha);
        card.appendChild(sendBtn);
        card.appendChild(codeLabel);
        card.appendChild(codeInput);
        card.appendChild(confirmBtn);
        overlay.appendChild(card);

        try { document.body.style.overflow = 'hidden'; } catch (_) {}
        document.body.appendChild(overlay);
      };

      const banner = document.createElement('div');
      banner.id = 'ttVerificationBanner';
      banner.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:10001;background:#111827;color:#fff;padding:12px 14px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;font-size:14px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;box-shadow:0 2px 10px rgba(0,0,0,.25)';

      const text = document.createElement('div');
      text.textContent = 'Verify your email or phone number to unlock deposits, withdrawals, and trading.';

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';

      const resend = document.createElement('button');
      resend.type = 'button';
      resend.textContent = 'Resend Email';
      resend.style.cssText = 'border:0;background:#2563eb;color:#fff;padding:8px 10px;border-radius:6px;cursor:pointer';
      resend.onclick = async () => {
        try {
          resend.disabled = true;
          resend.style.opacity = '.75';
          resend.textContent = 'Sending...';
          const result = await FirebaseAuthService.resendEmailVerification();
          const errorDetails = !result.success && result?.error ? ` (${result.error})` : '';
          this.showMessage(
            result.success
              ? 'Verification email sent. Open it and click the link to verify, then you will be redirected to the dashboard.'
              : `${result.message || 'Failed to send verification email'}${errorDetails}`,
            result.success ? 'success' : 'error'
          );
        } finally {
          resend.disabled = false;
          resend.style.opacity = '1';
          resend.textContent = 'Resend Email';
        }
      };

      const refresh = document.createElement('button');
      refresh.type = 'button';
      refresh.textContent = "I've Verified";
      refresh.style.cssText = 'border:0;background:#22c55e;color:#111827;padding:8px 10px;border-radius:6px;cursor:pointer;font-weight:600';
      refresh.onclick = async () => {
        try { await this.currentUser.reload(); } catch (e) {}
        this.ensureVerificationBanner();
        if (!!this.currentUser?.emailVerified || !!this.currentUser?.phoneNumber) {
          this.showMessage('Account verified', 'success');
        }
      };

      const verifyPhone = document.createElement('a');
      verifyPhone.textContent = 'Verify Phone';
      verifyPhone.href = '#';
      verifyPhone.style.cssText = 'color:#93c5fd;text-decoration:underline';
      verifyPhone.onclick = (e) => {
        try { e.preventDefault(); } catch (_) {}
        openPhoneModal();
      };

      actions.appendChild(resend);
      actions.appendChild(refresh);
      actions.appendChild(verifyPhone);

      banner.appendChild(text);
      banner.appendChild(actions);

      document.body.style.paddingTop = '56px';
      document.body.appendChild(banner);
      startAutoClearPoll();
    } catch (e) {}
  }

  async handleEmailVerificationActionLink() {
    try {
      const href = typeof window !== 'undefined' ? String(window.location?.href || '') : '';
      const url = href ? new URL(href) : null;
      if (!url) return;

      const mode = url.searchParams.get('mode');
      const oobCode = url.searchParams.get('oobCode');
      if (mode !== 'verifyEmail' || !oobCode) return;

      const result = await FirebaseAuthService.applyEmailVerificationCode(oobCode);
      if (!result.success) {
        this.showMessage(result.message || 'Email verification failed', 'error');
      } else {
        this.showMessage('Email verified successfully', 'success');
      }

      try {
        url.searchParams.delete('mode');
        url.searchParams.delete('oobCode');
        url.searchParams.delete('apiKey');
        url.searchParams.delete('lang');
        url.searchParams.delete('continueUrl');
        url.searchParams.delete('state');
        window.history.replaceState({}, document.title, url.pathname + (url.search ? `?${url.searchParams.toString()}` : '') + url.hash);
      } catch (_) {}

      try { await this.currentUser?.reload?.(); } catch (_) {}
      this.ensureVerificationBanner();
    } catch (_) {}
  }

  initializeFirebaseAuth() {
    // Fix: Use addAuthStateListener and set isInitialized flag
    FirebaseAuthService.addAuthStateListener((user) => {
        this.currentUser = user;
        this.isLoggedIn = !!user; // Properly sync isLoggedIn with auth state
        this.isInitialized = true; // Set initialization flag
        this.updateUI();
        this.handleEmailVerificationActionLink().catch(() => {});
        this.ensureVerificationBanner();
        console.log('AuthManager: Firebase auth state updated, user:', user ? user.email : 'No user');
        if (user) {
          this.clearDemoMode();
          this.checkAdminStatus().catch(() => {});
        } else {
          this._isAdmin = false;
        }
    });
  }

  async login(email, password) {
    try {
        console.log('AuthManager: Starting login process for:', email);
        
        // Clear any existing session data first
        sessionStorage.clear();
        
        const result = await FirebaseAuthService.signIn(email, password);
        console.log('AuthManager: Firebase result:', result);
        
        if (result.success) {
            this.showMessage('Login successful! Redirecting...', 'success');
            
            // Update internal state
            this.currentUser = result.user;
            this.isLoggedIn = true;
            this.clearDemoMode();
            
            // Store session info to prevent interference
            sessionStorage.setItem('currentSession', JSON.stringify({
                userId: result.user.uid,
                email: result.user.email,
                loginTime: Date.now()
            }));
            
            // Check if user is admin (retry once to allow custom claims to propagate)
            let isAdmin = await this.checkAdminStatus();
            if (!isAdmin) {
                await new Promise(resolve => setTimeout(resolve, 1200));
                isAdmin = await this.checkAdminStatus();
            }
            console.log('AuthManager: Admin status:', isAdmin);
            
            if (isAdmin) {
                console.log('Redirecting to admin panel');
                window.location.href = 'admin.html';
            } else {
                console.log('Redirecting to dashboard');
                window.location.href = 'dashboard.html';
            }
            
            return true;
        } else {
            console.error('AuthManager: Login failed:', result.message);
            this.showMessage(result.message || 'Login failed. Please check your credentials.', 'error');
            return false;
        }
    } catch (error) {
        console.error('AuthManager: Login error:', error);
        this.showMessage(this.getErrorMessage(error.code) || 'Login failed. Please try again.', 'error');
        return false;
    }
}

  async loginWithGoogle() {
    try {
      sessionStorage.clear();

      const result = await FirebaseAuthService.signInWithGoogle();
      if (!result.success) {
        this.showMessage(result.message || 'Google sign-in failed', 'error');
        return false;
      }

      if (result.pendingRedirect) {
        this.showMessage(result.message || 'Redirecting...', 'info');
        return true;
      }

      const user = result.user;
      this.currentUser = user;
      this.isLoggedIn = true;
      this.clearDemoMode();

      sessionStorage.setItem('currentSession', JSON.stringify({
        userId: user.uid,
        email: user.email,
        loginTime: Date.now()
      }));

      this.showMessage('Login successful! Redirecting...', 'success');

      let isAdmin = await this.checkAdminStatus();
      if (!isAdmin) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        isAdmin = await this.checkAdminStatus();
      }

      window.location.href = isAdmin ? 'admin.html' : 'dashboard.html';
      return true;
    } catch (error) {
      console.error('AuthManager: Google login error:', error);
      this.showMessage(this.getErrorMessage(error.code) || 'Google sign-in failed. Please try again.', 'error');
      return false;
    }
  }

  async startPhoneSignIn(phoneNumber, recaptchaContainerId) {
    try {
      const result = await FirebaseAuthService.sendPhoneVerificationCode(phoneNumber, recaptchaContainerId);
      if (!result.success) {
        this.showMessage(result.message || 'Failed to send code', 'error');
        return false;
      }
      this.showMessage('Verification code sent. Check your phone.', 'success');
      return true;
    } catch (error) {
      console.error('AuthManager: Phone code send error:', error);
      this.showMessage(this.getErrorMessage(error.code) || 'Failed to send verification code.', 'error');
      return false;
    }
  }

  async confirmPhoneCode(code) {
    try {
      sessionStorage.clear();

      const result = await FirebaseAuthService.confirmPhoneVerificationCode(code);
      if (!result.success) {
        this.showMessage(result.message || 'Invalid code', 'error');
        return false;
      }

      const user = result.user;
      this.currentUser = user;
      this.isLoggedIn = true;
      this.clearDemoMode();

      sessionStorage.setItem('currentSession', JSON.stringify({
        userId: user.uid,
        email: user.email,
        loginTime: Date.now()
      }));

      this.showMessage('Login successful! Redirecting...', 'success');

      let isAdmin = await this.checkAdminStatus();
      if (!isAdmin) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        isAdmin = await this.checkAdminStatus();
      }

      window.location.href = isAdmin ? 'admin.html' : 'dashboard.html';
      return true;
    } catch (error) {
      console.error('AuthManager: Phone verify error:', error);
      this.showMessage(this.getErrorMessage(error.code) || 'Phone verification failed.', 'error');
      return false;
    }
  }

async logout() {
    try {
        await FirebaseAuthService.signOut();
        this.currentUser = null;
        this.isLoggedIn = false;
        
        // Clear session storage
        sessionStorage.clear();
        
        this.showMessage('Logged out successfully', 'success');
        
        // Only redirect if not already on index.html to prevent loops
        if (!window.location.pathname.includes('index.html') && 
            !window.location.pathname.endsWith('/')) {
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        } else {
            // Just update UI if already on index page
            this.updateUI();
        }
    } catch (error) {
        console.error('Logout error:', error);
        this.showMessage('Error logging out', 'error');
    }
}
  async register(formData) {
    try {
      console.log('Starting registration process...');
      console.log('Form data received:', formData);
      
      // Create proper data structure for Firebase
      const firebaseUserData = {
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        country: formData.country,
        displayName: `${formData.firstName} ${formData.lastName}`.trim()
      };
      
      console.log('Sending to Firebase:', firebaseUserData);
      
      // Register with Firebase
      const result = await FirebaseAuthService.register(
        firebaseUserData.email,
        firebaseUserData.password,
        firebaseUserData
      );
      
      if (result.success) {
        console.log('Registration successful');
        this.showMessage('Registration successful! Please verify your email or phone number to unlock deposits, withdrawals, and trading.', 'success');
        
        // Send welcome email only if email service is available
        if (this.emailService) {
          try {
            await this.emailService.sendWelcomeEmail(
              firebaseUserData.email, 
              firebaseUserData.displayName
            );
            console.log('Welcome email sent successfully');
          } catch (emailError) {
            console.warn('Failed to send welcome email:', emailError.message);
            // Don't fail registration if email fails
          }
        }
        
        return true;
      } else {
        console.error('Registration failed:', result);
        this.showMessage(result.message || 'Registration failed. Please try again.', 'error');
        return false;
      }
    } catch (error) {
      console.error('Registration error:', error);
      
      // Show more specific error message
      let errorMessage = 'Registration failed. Please try again.';
      
      if (error.code) {
        switch (error.code) {
          case 'auth/email-already-in-use':
            errorMessage = 'This email is already registered. Please use a different email or try logging in.';
            break;
          case 'auth/invalid-email':
            errorMessage = 'Please enter a valid email address.';
            break;
          case 'auth/weak-password':
            errorMessage = 'Password is too weak. Please use at least 6 characters.';
            break;
          case 'auth/network-request-failed':
            errorMessage = 'Network error. Please check your internet connection.';
            break;
          case 'auth/operation-not-allowed':
            errorMessage = 'Email/password accounts are not enabled. Please contact support.';
            break;
          default:
            errorMessage = `Registration failed: ${error.message}`;
        }
      }
      
      this.showMessage(errorMessage, 'error');
      return false;
    }
  }

  async logout() {
    try {
      await FirebaseAuthService.signOut();
      this.currentUser = null;
      this.isLoggedIn = false;
      this.showMessage('Logged out successfully', 'success');
      
      // Only redirect if not already on index.html to prevent loops
      if (!window.location.pathname.includes('index.html') && 
          !window.location.pathname.endsWith('/')) {
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1000);
      } else {
        // Just update UI if already on index page
        this.updateUI();
      }
    } catch (error) {
      console.error('Logout error:', error);
      this.showMessage('Error logging out', 'error');
    }
  }

  getErrorMessage(errorCode) {
    const errorMessages = {
      'auth/user-not-found': 'No account found with this email address.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Please check your connection.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password': 'Password should be at least 6 characters long.',
      'auth/invalid-credential': 'Invalid login credentials. Please check your email and password.'
    };
    
    return errorMessages[errorCode] || 'An error occurred. Please try again.';
  }

  updateUI() {
    const userElements = document.querySelectorAll('.user-element');
    const guestElements = document.querySelectorAll('.guest-element');
    
    if (this.currentUser) {
      userElements.forEach(el => el.style.display = 'block');
      guestElements.forEach(el => el.style.display = 'none');
      
      // Only update user info on non-dashboard pages to prevent conflicts
      if (!window.location.pathname.includes('dashboard.html')) {
        // Update user info displays
        const userNameElements = document.querySelectorAll('.user-name:not(#dashboard-user-name):not(#trading-user-name)');
        const userEmailElements = document.querySelectorAll('.user-email:not(#userEmail)');
        
        userNameElements.forEach(el => {
          el.textContent = this.currentUser.displayName || this.currentUser.email;
        });
        
        userEmailElements.forEach(el => {
          el.textContent = this.currentUser.email;
        });
        
        // Update avatar initials
        const avatarElements = document.querySelectorAll('.avatar-initial');
        avatarElements.forEach(el => {
          const name = this.currentUser.displayName || this.currentUser.email;
          el.textContent = name.charAt(0).toUpperCase();
        });
      }

      this.ensureVerificationBanner();
    } else {
      userElements.forEach(el => el.style.display = 'none');
      guestElements.forEach(el => el.style.display = 'block');
      this.ensureVerificationBanner();
    }
  }

  async startPhoneLink(phoneNumber, recaptchaContainerId) {
    try {
      const result = await FirebaseAuthService.sendPhoneLinkVerificationCode(phoneNumber, recaptchaContainerId);
      if (!result.success) {
        this.showMessage(result.message || 'Failed to send code', 'error');
        return false;
      }
      this.showMessage('Verification code sent. Check your phone.', 'success');
      return true;
    } catch (error) {
      this.showMessage(this.getErrorMessage(error.code) || 'Failed to send verification code.', 'error');
      return false;
    }
  }

  async confirmPhoneLinkCode(code) {
    try {
      const result = await FirebaseAuthService.confirmPhoneLinkVerificationCode(code);
      if (!result.success) {
        this.showMessage(result.message || 'Invalid code', 'error');
        return false;
      }
      this.currentUser = result.user;
      this.isLoggedIn = true;
      this.ensureVerificationBanner();
      this.showMessage('Phone verified successfully', 'success');
      return true;
    } catch (error) {
      this.showMessage(this.getErrorMessage(error.code) || 'Phone verification failed.', 'error');
      return false;
    }
  }

  getCurrentUser() {
    if (!this.isInitialized) {
      console.warn('AuthManager not fully initialized yet');
      return undefined; // Return undefined instead of null when not ready
    }
    return this.currentUser;
  }

  isAdmin() {
    return !!this._isAdmin;
  }

  async checkAdminStatus() {
    if (!this.currentUser) {
      // Wait for auth state to be ready
      await new Promise(resolve => {
        const unsubscribe = FirebaseAuthService.addAuthStateListener((user) => {
          this.currentUser = user;
          unsubscribe();
          resolve();
        });
      });
    }
    
    if (!this.currentUser) {
      this._isAdmin = false;
      return false;
    }

    try {
      try {
        if (typeof this.currentUser.getIdToken === 'function') {
          const token = await this.currentUser.getIdToken(true);
          try {
            const base64Url = String(token || '').split('.')[1] || '';
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
            const payload = JSON.parse(atob(padded));
            if (payload?.admin === true) {
              this._isAdmin = true;
              return true;
            }
          } catch (e) {}
        }
      } catch (e) {}

      const tokenResult = await getIdTokenResult(this.currentUser);
      if (tokenResult?.claims?.admin === true) {
        this._isAdmin = true;
        return true;
      }

      const userRef = doc(db, 'users', this.currentUser.uid);
      const userDoc = await getDoc(userRef);
      const isAdmin = userDoc.exists() && userDoc.data()?.role === 'admin';
      this._isAdmin = !!isAdmin;
      return !!isAdmin;
    } catch (error) {
      console.error('AuthManager: Error checking admin role:', error);
      const message = String(error?.message || '');
      if (
        error?.code === 'permission-denied' ||
        message.includes('Missing or insufficient permissions')
      ) {
        this.showMessage('Unable to verify admin access (Firestore permissions). Publish your Firestore rules and re-login.', 'error');
      }
      this._isAdmin = false;
      return false;
    }
  }
}

// Create and export auth manager instance
const authManager = new AuthManager();
window.authManager = authManager;
window.FirebaseDatabaseService = FirebaseDatabaseService;

export default authManager;
