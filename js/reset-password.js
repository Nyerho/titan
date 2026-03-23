// Reset Password Functionality
import { auth } from './firebase-config.js';
import { confirmPasswordReset, verifyPasswordResetCode } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

class ResetPasswordManager {
    constructor() {
        this.oobCode = null;
        this.mode = null;
        this.init();
    }

    init() {
        this.getResetCode();
        this.bindEvents();
    }

    getResetCode() {
        const urlParams = new URLSearchParams(window.location.search);
        this.oobCode = urlParams.get('oobCode');
        this.mode = urlParams.get('mode');

        // Guard against wrong mode or missing code
        if (this.mode && this.mode !== 'resetPassword') {
            this.showError('This link is not a valid password reset link.');
            return;
        }
        if (!this.oobCode) {
            this.showError('Invalid or expired reset link. Please request a new password reset.');
            return;
        }
        
        // Verify the reset code
        this.verifyResetCode();
    }

    async verifyResetCode() {
        try {
            const email = await verifyPasswordResetCode(auth, this.oobCode);
            console.log('Reset code verified successfully for:', email);
            // Surface the email to the user in the header subtitle if available
            const headerSubtitle = document.querySelector('.auth-header p');
            if (headerSubtitle) {
                headerSubtitle.textContent = `Resetting password for: ${email}`;
            }
        } catch (error) {
            console.error('Reset code verification failed:', error);
            this.showError('Invalid or expired reset link. Please request a new password reset.');
        }
    }

    bindEvents() {
        const resetForm = document.getElementById('resetPasswordForm');
        if (resetForm) {
            resetForm.addEventListener('submit', (e) => this.handlePasswordReset(e));
        }
    }

    async handlePasswordReset(e) {
        e.preventDefault();
        
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const resetBtn = document.getElementById('resetPasswordBtn');
        
        // Clear previous errors
        this.clearErrors();
        
        // Validate passwords
        if (!this.validatePasswords(newPassword, confirmPassword)) {
            return;
        }
        
        // Show loading state
        resetBtn.disabled = true;
        resetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...';
        
        try {
            await confirmPasswordReset(auth, this.oobCode, newPassword);
            this.showSuccessMessage();
            
        } catch (error) {
            console.error('Password reset error:', error);
            
            let errorMessage = 'An error occurred. Please try again.';
            
            switch (error.code) {
                case 'auth/expired-action-code':
                    errorMessage = 'Reset link has expired. Please request a new one.';
                    break;
                case 'auth/invalid-action-code':
                    errorMessage = 'Invalid reset link. Please request a new one.';
                    break;
                case 'auth/weak-password':
                    errorMessage = 'Password is too weak. Please choose a stronger password.';
                    break;
            }
            
            this.showError(errorMessage);
            
        } finally {
            resetBtn.disabled = false;
            resetBtn.innerHTML = '<i class="fas fa-check"></i> Reset Password';
        }
    }

    validatePasswords(password, confirmPassword) {
        const passwordError = document.getElementById('passwordError');
        const confirmPasswordError = document.getElementById('confirmPasswordError');
        
        let isValid = true;
        
        // Check password length
        if (password.length < 6) {
            passwordError.textContent = 'Password must be at least 6 characters long';
            isValid = false;
        }
        
        // Check if passwords match
        if (password !== confirmPassword) {
            confirmPasswordError.textContent = 'Passwords do not match';
            isValid = false;
        }
        
        return isValid;
    }

    clearErrors() {
        document.getElementById('passwordError').textContent = '';
        document.getElementById('confirmPasswordError').textContent = '';
    }

    showError(message) {
        const passwordError = document.getElementById('passwordError');
        if (passwordError) {
            passwordError.textContent = message;
        } else {
            alert(message);
        }
    }

    showSuccessMessage() {
        const resetForm = document.getElementById('reset-password-form');
        const successMessage = document.getElementById('success-message');
        
        resetForm.style.display = 'none';
        successMessage.style.display = 'block';
        
        // Auto redirect to login after 3 seconds
        setTimeout(() => {
            window.location.href = 'auth.html';
        }, 3000);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ResetPasswordManager();
});