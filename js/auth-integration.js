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

  initializeFirebaseAuth() {
    // Fix: Use addAuthStateListener and set isInitialized flag
    FirebaseAuthService.addAuthStateListener((user) => {
        this.currentUser = user;
        this.isLoggedIn = !!user; // Properly sync isLoggedIn with auth state
        this.isInitialized = true; // Set initialization flag
        this.updateUI();
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
        this.showMessage('Registration successful! Please check your email for verification.', 'success');
        
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
    } else {
      userElements.forEach(el => el.style.display = 'none');
      guestElements.forEach(el => el.style.display = 'block');
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

export default authManager;
