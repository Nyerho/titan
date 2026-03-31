// Firebase Authentication Service
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  linkWithPhoneNumber,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  deleteUser,
  sendEmailVerification,
  applyActionCode
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { auth, db } from './firebase-config.js';

class FirebaseAuthService {
  constructor() {
    this.currentUser = null;
    this.authStateListeners = [];
    this.emailService = null;
    this.recaptchaVerifier = null;
    this.phoneConfirmationResult = null;
    this.phoneLinkConfirmationResult = null;
    this.initializeAuthListener();
    this.handleRedirectResult();
    this.initializeEmailService();
  }

  computeContinueBaseUrl() {
    const origin = typeof window !== 'undefined' ? String(window.location?.origin || '') : '';
    const baseUrl = origin && origin !== 'null' ? origin : '';
    const isHttpOrigin = baseUrl.startsWith('http://') || baseUrl.startsWith('https://');
    const isLocal =
      baseUrl.startsWith('http://localhost') ||
      baseUrl.startsWith('http://127.0.0.1') ||
      baseUrl.startsWith('https://localhost') ||
      baseUrl.startsWith('https://127.0.0.1') ||
      baseUrl.startsWith('file:');

    if (baseUrl.startsWith('https://www.titantrades.org') || baseUrl.startsWith('https://titantrades.org')) {
      return baseUrl;
    }
    if (baseUrl.startsWith('https://www.titantrades.com') || baseUrl.startsWith('https://titantrades.com')) {
      return baseUrl;
    }
    if (baseUrl.startsWith('https://www.centraltradekeplr.com') || baseUrl.startsWith('https://centraltradekeplr.com')) {
      return baseUrl;
    }
    if (isHttpOrigin && !isLocal) return baseUrl;
    return 'https://titantrades.org';
  }

  async sendVerificationEmailWithFallbacks(user) {
    if (!user) throw new Error('Missing user');
    if (!user.email) {
      const err = new Error('This account has no email address.');
      err.code = 'auth/missing-email';
      throw err;
    }

    try { await user.reload(); } catch (_) {}
    try { await user.getIdToken(true); } catch (_) {}

    const continueBase = this.computeContinueBaseUrl();
    const url = `${continueBase}/dashboard.html`;
    const attempts = [
      { url, handleCodeInApp: false },
      { url, handleCodeInApp: true }
    ];

    let lastError = null;
    for (const actionCodeSettings of attempts) {
      try {
        await sendEmailVerification(user, actionCodeSettings);
        return { url, usedSettings: actionCodeSettings };
      } catch (e) {
        lastError = e;
      }
    }

    if (lastError?.code === 'auth/unauthorized-continue-uri') {
      await sendEmailVerification(user);
      return { url: '', usedSettings: null };
    }

    throw lastError || new Error('Failed to send verification email');
  }

  // Add email service initialization
  async initializeEmailService() {
    try {
      const { default: EmailService } = await import('./email-service.js');
      this.emailService = new EmailService();
      console.log('Email service initialized successfully');
    } catch (error) {
      console.warn('Email service not available:', error.message);
      this.emailService = null;
    }
  }

  // Add the missing sendEmail method
  async sendEmail(emailData) {
    if (!this.emailService) {
      console.warn('Email service not available, skipping email send');
      return { success: false, error: 'Email service not initialized' };
    }
    
    try {
      return await this.emailService.sendVerificationEmail(emailData);
    } catch (error) {
      console.error('Error sending email:', error);
      return { success: false, error: error.message };
    }
  }
  // Initialize authentication state listener
  initializeAuthListener() {
    try {
        onAuthStateChanged(auth, async (user) => {
            this.currentUser = user;
            if (user) {
                try {
                  await this.syncUserProfile(user);
                } catch (e) {
                  console.error('Error syncing user profile:', e);
                }
            }
            this.notifyAuthStateListeners(user);
        });
    } catch (error) {
        console.error('Auth state listener initialization error:', error);
    }
}

  async handleRedirectResult() {
    try {
      const result = await getRedirectResult(auth);
      if (result?.user) {
        try {
          await this.updateLastLogin(result.user.uid);
        } catch (e) {}
      }
    } catch (error) {
      const code = String(error?.code || '');
      if (code && code !== 'auth/no-auth-event') {
        console.warn('Redirect auth result error:', error);
      }
    }
  }

  // Register new user
  async register(email, password, userData = {}) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update user profile
      await updateProfile(user, {
        displayName: userData.displayName || userData.firstName + ' ' + userData.lastName
      });

      // Create user document in Firestore
      try {
        await this.createUserDocument(user, {
          ...userData,
          emailVerified: false
        });
      } catch (firestoreError) {
        try {
          await deleteUser(user);
        } catch (rollbackError) {
          console.warn('Failed to rollback auth user after Firestore write failure:', rollbackError);
        }
        throw firestoreError;
      }

      try {
        await this.sendVerificationEmailWithFallbacks(user);
        console.log('Email verification sent successfully');
      } catch (emailError) {
        console.warn('Failed to send email verification:', emailError.message);
      }

      return {
        success: true,
        user: user,
        message: 'Registration successful. Please verify your email or phone number to unlock deposits, withdrawals, and trading.'
      };
    } catch (error) {
      console.error('Registration error:', error);
      try {
        await signOut(auth);
      } catch (e) {}
      return {
        success: false,
        error: error.code,
        message: error?.code === 'permission-denied'
          ? 'Registration failed due to database permissions. Please contact support.'
          : this.getErrorMessage(error.code)
      };
    }
  }

  async resendEmailVerification() {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, message: 'No authenticated user' };
    }

    try {
      if (user.emailVerified) {
        return { success: true, message: 'Your email is already verified.' };
      }
      await this.sendVerificationEmailWithFallbacks(user);
      return { success: true, message: 'Verification email sent. Open it and click the link to verify.' };
    } catch (error) {
      const code = error?.code || '';
      const msg = this.getErrorMessage(code) || error?.message || 'Failed to send verification email';
      return { success: false, error: code, message: msg };
    }
  }

  async applyEmailVerificationCode(oobCode) {
    const code = String(oobCode || '').trim();
    if (!code) return { success: false, message: 'Missing verification code' };
    try {
      await applyActionCode(auth, code);
      return { success: true, message: 'Email verified successfully' };
    } catch (error) {
      return { success: false, error: error.code, message: this.getErrorMessage(error.code) || 'Failed to verify email' };
    }
  }

  // Generate secure verification token
  generateVerificationToken() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15) + 
           Date.now().toString(36);
  }

  // Send custom verification email
  async sendCustomVerificationEmail(email, userName, token) {
    try {
      if (!this.emailService) {
        console.warn('Email service not available, skipping verification email');
        return;
      }

      const verificationUrl = `${window.location.origin}/auth.html?verify=${token}&email=${encodeURIComponent(email)}`;
      
      const emailData = {
        to_email: email,
        to_name: userName,
        from_name: 'TitanTrades Support',
        from_email: 'support@titantrades.com',
        subject: 'Verify Your TitanTrades Account',
        verification_url: verificationUrl,
        user_name: userName
      };

      const result = await this.sendEmail(emailData);
      if (!result.success) {
        throw new Error(result.error);
      }
      
    } catch (error) {
      console.error('Error sending verification email:', error);
      // Don't throw error - let registration continue
    }
  }

  // Sign in user
  async signIn(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update last login
      await this.updateLastLogin(user.uid);

      return {
        success: true,
        user: user,
        message: 'Sign in successful'
      };
    } catch (error) {
      return {
        success: false,
        error: error.code,
        message: this.getErrorMessage(error.code)
      };
    }
  }

  async signInWithGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      let userCredential;
      try {
        userCredential = await signInWithPopup(auth, provider);
      } catch (error) {
        const code = String(error?.code || '');
        if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user') {
          await signInWithRedirect(auth, provider);
          return {
            success: true,
            pendingRedirect: true,
            message: 'Redirecting to Google sign-in...'
          };
        }
        throw error;
      }

      const user = userCredential.user;
      await this.updateLastLogin(user.uid);

      return {
        success: true,
        user,
        message: 'Sign in successful'
      };
    } catch (error) {
      return {
        success: false,
        error: error.code,
        message: this.getErrorMessage(error.code) || 'Google sign-in failed'
      };
    }
  }

  async initPhoneRecaptcha(containerOrId, options = {}) {
    const container =
      typeof containerOrId === 'string'
        ? document.getElementById(containerOrId)
        : containerOrId;

    if (!container) {
      throw new Error('reCAPTCHA container not found');
    }

    const size = String(options.size || 'invisible');

    if (
      this.recaptchaVerifier &&
      this._recaptchaContainer === container &&
      this._recaptchaSize === size
    ) {
      return this.recaptchaVerifier;
    }

    this.clearPhoneRecaptcha();

    try {
      container.innerHTML = '';
    } catch (_) {}

    this.recaptchaVerifier = new RecaptchaVerifier(auth, container, {
      size,
      theme: 'light',
      callback: () => {},
      'expired-callback': () => {}
    });
    this._recaptchaContainer = container;
    this._recaptchaSize = size;

    await this.recaptchaVerifier.render();
    return this.recaptchaVerifier;
  }

  clearPhoneRecaptcha() {
    try {
      if (this.recaptchaVerifier) {
        try {
          this.recaptchaVerifier.clear();
        } catch (_) {}
      }
    } catch (_) {}
    this.recaptchaVerifier = null;
    this._recaptchaContainer = null;
    this._recaptchaSize = null;
  }

  async sendPhoneVerificationCode(phoneNumber, containerOrId) {
    const verifier = await this.initPhoneRecaptcha(containerOrId, { size: 'invisible' });
    try {
      const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      this.phoneConfirmationResult = confirmationResult;
      return {
        success: true,
        message: 'Verification code sent'
      };
    } catch (error) {
      const code = String(error?.code || '');
      if (
        code === 'auth/captcha-check-failed' ||
        code === 'auth/missing-recaptcha-token' ||
        code === 'auth/too-many-requests'
      ) {
        this.clearPhoneRecaptcha();
      }
      const fallbackMessage =
        String(error?.message || '') ||
        'Failed to send verification code. Please try again later.';
      return {
        success: false,
        error: error.code,
        message: this.getErrorMessage(error.code) || fallbackMessage
      };
    }
  }

  async confirmPhoneVerificationCode(code) {
    try {
      if (!this.phoneConfirmationResult) {
        return {
          success: false,
          message: 'Please request a code first'
        };
      }

      const userCredential = await this.phoneConfirmationResult.confirm(code);
      const user = userCredential.user;
      await this.updateLastLogin(user.uid);

      return {
        success: true,
        user,
        message: 'Phone sign-in successful'
      };
    } catch (error) {
      return {
        success: false,
        error: error.code,
        message: this.getErrorMessage(error.code) || 'Invalid verification code'
      };
    }
  }

  async sendPhoneLinkVerificationCode(phoneNumber, containerOrId) {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, message: 'No authenticated user' };
    }

    try {
      const verifier = await this.initPhoneRecaptcha(containerOrId, { size: 'invisible' });
      const confirmationResult = await linkWithPhoneNumber(user, phoneNumber, verifier);
      this.phoneLinkConfirmationResult = confirmationResult;
      return { success: true, message: 'Verification code sent' };
    } catch (error) {
      const code = String(error?.code || '');
      const message = String(error?.message || '');

      if (code === 'auth/provider-already-linked') {
        return { success: true, user, message: 'Phone number already verified' };
      }

      const shouldFallbackToVisible =
        code === 'auth/missing-recaptcha-token' ||
        code === 'auth/captcha-check-failed' ||
        message.toLowerCase().includes('recaptcha') ||
        message.toLowerCase().includes('captcha');

      if (shouldFallbackToVisible) {
        try {
          const verifier = await this.initPhoneRecaptcha(containerOrId, { size: 'normal' });
          const confirmationResult = await linkWithPhoneNumber(user, phoneNumber, verifier);
          this.phoneLinkConfirmationResult = confirmationResult;
          return { success: true, message: 'Verification code sent' };
        } catch (retryError) {
          const retryCode = String(retryError?.code || '');
          if (
            retryCode === 'auth/captcha-check-failed' ||
            retryCode === 'auth/missing-recaptcha-token' ||
            retryCode === 'auth/too-many-requests'
          ) {
            this.clearPhoneRecaptcha();
          }
          const retryFallbackMessage =
            String(retryError?.message || '') ||
            'Failed to send verification code. Please try again later.';
          return { success: false, error: retryError.code, message: this.getErrorMessage(retryError.code) || 'Failed to send verification code' };
        }
      }

      if (
        code === 'auth/captcha-check-failed' ||
        code === 'auth/missing-recaptcha-token' ||
        code === 'auth/too-many-requests'
      ) {
        this.clearPhoneRecaptcha();
      }
      const fallbackMessage =
        String(error?.message || '') ||
        'Failed to send verification code. Please try again later.';
      return { success: false, error: error.code, message: this.getErrorMessage(error.code) || fallbackMessage };
    }
  }

  async confirmPhoneLinkVerificationCode(code) {
    try {
      if (!this.phoneLinkConfirmationResult) {
        return { success: false, message: 'Please request a code first' };
      }

      const userCredential = await this.phoneLinkConfirmationResult.confirm(code);
      const user = userCredential.user;

      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          phoneVerified: !!user.phoneNumber,
          emailVerified: !!user.emailVerified
        });
      } catch (e) {}

      return { success: true, user, message: 'Phone verified successfully' };
    } catch (error) {
      return { success: false, error: error.code, message: this.getErrorMessage(error.code) || 'Invalid verification code' };
    }
  }

  // Sign out user
  async signOut() {
    try {
      await signOut(auth);
      return {
        success: true,
        message: 'Sign out successful'
      };
    } catch (error) {
      return {
        success: false,
        error: error.code,
        message: this.getErrorMessage(error.code)
      };
    }
  }

  // Reset password
  async resetPassword(email) {
    try {
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

      const continueUrl = `${continueBase}/reset-password.html`;
      const isLocal = window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.port === '5500' ||
        window.location.port === '3000' ||
        window.location.protocol === 'file:' ||
        window.location.href.includes('localhost');
      const storedBaseUrl = localStorage.getItem('admin_api_baseUrl') || localStorage.getItem('tt_api_baseUrl');
      const apiBaseUrl = storedBaseUrl || (isLocal ? 'http://localhost:3001' : (baseUrl.includes('onrender.com') ? baseUrl : 'https://titantrades.onrender.com'));

      const response = await fetch(`${apiBaseUrl}/api/auth/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, continueUrl })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to send password reset email');
      }
      return {
        success: true,
        message: 'Password reset email sent successfully'
      };
    } catch (error) {
      console.error('Password reset error:', error);
      return {
        success: false,
        error: error.code,
        message: this.getErrorMessage(error.code)
      };
    }
  }

  // Update user password
  async updateUserPassword(currentPassword, newPassword) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('No authenticated user');

      // Re-authenticate user
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);

      return {
        success: true,
        message: 'Password updated successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.code,
        message: this.getErrorMessage(error.code)
      };
    }
  }

  // Create user document in Firestore
  async createUserDocument(user, userData) {
    const userRef = doc(db, 'users', user.uid);
    const isVerified = !!user.emailVerified || !!user.phoneNumber;
    const userDoc = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
      phoneVerified: !!user.phoneNumber,
      verificationStatus: isVerified ? 'verified' : 'pending',
      role: userData.role || 'user',
      balance: 0,
      walletBalance: 0,
      accountBalance: 0,
      totalDeposits: 0,
      totalProfits: 0,
      totalWithdrawals: 0,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
      balanceUpdatedAt: serverTimestamp(),
      tradingBalanceUpdatedAt: serverTimestamp(),
      profile: {
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        phone: user.phoneNumber || userData.phone || '',
        country: userData.country || '',
        dateOfBirth: userData.dateOfBirth || null,
        address: userData.address || ''
      },
      trading: {
        accountType: 'demo',
        balance: 0,
        currency: 'USD',
        leverage: '1:100',
        accountStatus: 'active'
      },
      preferences: {
        theme: 'dark',
        language: 'en',
        notifications: {
          email: true,
          push: true,
          trading: true,
          news: true
        }
      }
    };

    await setDoc(userRef, userDoc);
  }

  // Sync user profile
  async syncUserProfile(user) {
    try {
      // Check if user is in deleted users collection
      const deletedUserRef = doc(db, 'deletedUsers', user.uid);
      const deletedUserDoc = await getDoc(deletedUserRef);
      
      if (deletedUserDoc.exists()) {
        // User was deleted by admin, sign them out
        await signOut(auth);
        throw new Error('Account has been deactivated by administrator');
      }
      
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        await this.createUserDocument(user, {});
        return;
      }

      const data = userDoc.data() || {};
      const emailVerified = !!user.emailVerified;
      const phoneVerified = !!user.phoneNumber;
      const nextVerificationStatus = (emailVerified || phoneVerified) ? 'verified' : 'pending';

      const updates = {};
      if (data.emailVerified !== emailVerified) updates.emailVerified = emailVerified;
      if (data.phoneVerified !== phoneVerified) updates.phoneVerified = phoneVerified;
      if (data.verificationStatus !== nextVerificationStatus) updates.verificationStatus = nextVerificationStatus;

      const existingPhone = data?.profile?.phone;
      if (!existingPhone && user.phoneNumber) {
        updates['profile.phone'] = user.phoneNumber;
      }

      if (Object.keys(updates).length) {
        try {
          await updateDoc(userRef, updates);
        } catch (e) {}
      }
    } catch (error) {
      if (error?.code === 'permission-denied' || String(error?.message || '').includes('Missing or insufficient permissions')) {
        return;
      }
      throw error;
    }
  }

  // Update last login
  async updateLastLogin(uid) {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        lastLogin: new Date()
      });
    } catch (error) {
      console.error('Error updating last login:', error);
    }
  }

  // Add authentication state listener
  addAuthStateListener(callback) {
    this.authStateListeners.push(callback);
    // Return unsubscribe function
    return () => {
      this.removeAuthStateListener(callback);
    };
  }

  // Remove authentication state listener
  removeAuthStateListener(callback) {
    this.authStateListeners = this.authStateListeners.filter(listener => listener !== callback);
  }

  // Notify authentication state listeners
  notifyAuthStateListeners(user) {
    this.authStateListeners.forEach(callback => callback(user));
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.currentUser;
  }

  // Get error message
  getErrorMessage(errorCode) {
    const errorMessages = {
      'auth/user-not-found': 'No account found with this email address.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password': 'Password should be at least 6 characters.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/too-many-requests': 'Too many requests. Please wait a few minutes before trying again.',
      'auth/network-request-failed': 'Network error. Please check your internet connection.',
      'auth/invalid-api-key': 'Email sending failed due to an invalid API key configuration. Please contact support.',
      'auth/user-token-expired': 'Your session expired. Please sign in again and resend the verification email.',
      'auth/requires-recent-login': 'Please sign in again to complete this action.',
      'auth/missing-continue-uri': 'Email verification redirect URL is missing. Please contact support.',
      'auth/invalid-continue-uri': 'Email verification redirect URL is invalid. Please contact support.',
      'auth/unauthorized-continue-uri': 'Email verification redirect URL is not authorized. Please contact support.',
      'auth/invalid-phone-number': 'Please enter a valid phone number with country code (e.g. +233...).',
      'auth/missing-phone-number': 'Please enter your phone number.',
      'auth/invalid-verification-code': 'Invalid verification code. Please try again.',
      'auth/code-expired': 'Verification code expired. Please request a new one.',
      'auth/captcha-check-failed': 'reCAPTCHA failed. Please refresh and try again.',
      'auth/missing-recaptcha-token': 'Please complete reCAPTCHA and try again.',
      'auth/quota-exceeded': 'SMS quota exceeded for phone verification. Please try again later.',
      'auth/unauthorized-domain': 'Phone verification is not enabled for this website domain. Please contact support.',
      'auth/app-not-authorized': 'Phone verification is not enabled for this app/domain. Please contact support.',
      'auth/invalid-app-credential': 'Phone verification is not configured correctly. Please contact support.',
      'auth/provider-already-linked': 'Phone number is already verified.',
      'auth/internal-error': 'Phone verification failed due to a temporary error. Please try again later.',
      'auth/session-expired': 'Verification session expired. Please request a new code.',
      'auth/invalid-action-code': 'The reset link is invalid or has expired.',
      'auth/expired-action-code': 'The reset link has expired. Please request a new one.',
      'auth/missing-email': 'Please enter your email address.',
      'auth/operation-not-allowed': 'This action is not enabled. Please contact support.'
    };

    return errorMessages[errorCode] || 'An unexpected error occurred. Please try again later.';
  }
}

// Export singleton instance
export default new FirebaseAuthService();
