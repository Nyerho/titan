// Firebase Authentication Service
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  deleteUser,
  sendEmailVerification
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, setDoc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { auth, db } from './firebase-config.js';

class FirebaseAuthService {
  constructor() {
    this.currentUser = null;
    this.authStateListeners = [];
    this.emailService = null;
    this.initializeAuthListener();
    this.initializeEmailService();
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
                await this.syncUserProfile(user);
            }
            this.notifyAuthStateListeners(user);
        });
    } catch (error) {
        console.error('Auth state listener initialization error:', error);
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
      await this.createUserDocument(user, {
        ...userData,
        emailVerified: false
      });

      // Try to send verification email, but don't fail registration if it fails
      try {
        const verificationToken = this.generateVerificationToken();
        await this.sendCustomVerificationEmail(user.email, userData.firstName || 'User', verificationToken);
        console.log('Verification email sent successfully');
      } catch (emailError) {
        console.warn('Failed to send verification email:', emailError.message);
        // Continue with registration even if email fails
      }

      return {
        success: true,
        user: user,
        message: 'Registration successful. You can now log in with your credentials.'
      };
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: error.code,
        message: this.getErrorMessage(error.code)
      };
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
      await sendPasswordResetEmail(auth, email, {
        url: 'https://www.centraltradekeplr.com/forgot-password.html',
        handleCodeInApp: false
      });
      return {
        success: true,
        message: 'Password reset email sent successfully'
      };
    } catch (error) {
      console.error('Firebase reset password error:', error);
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
    const userDoc = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
      balance: 0, // Start with 0 balance for synchronicity
      totalDeposits: 0,
      createdAt: new Date(),
      lastLogin: new Date(),
      profile: {
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        phone: userData.phone || '',
        country: userData.country || '',
        dateOfBirth: userData.dateOfBirth || null,
        address: userData.address || ''
      },
      trading: {
        accountType: 'demo',
        balance: 0, // Start with 0 balance for synchronicity
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
      }
    } catch (error) {
      console.error('Error syncing user profile:', error);
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
      'auth/requires-recent-login': 'Please sign in again to complete this action.',
      'auth/invalid-action-code': 'The reset link is invalid or has expired.',
      'auth/expired-action-code': 'The reset link has expired. Please request a new one.',
      'auth/missing-email': 'Please enter your email address.',
      'auth/operation-not-allowed': 'Password reset is not enabled. Please contact support.'
    };

    return errorMessages[errorCode] || 'An unexpected error occurred. Please try again later.';
  }
}

// Export singleton instance
export default new FirebaseAuthService();
