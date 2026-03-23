// Forgot Password Functionality
import { auth } from './firebase-config.js';
import { sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

class ForgotPasswordManager {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        const forgotForm = document.getElementById('forgotPasswordForm');
        const resendLink = document.getElementById('resendLink');

        if (forgotForm) {
            forgotForm.addEventListener('submit', (e) => this.handleForgotPassword(e));
        }

        if (resendLink) {
            resendLink.addEventListener('click', (e) => this.handleResend(e));
        }
    }

    // Use a production, allowlisted URL to avoid unauthorized-continue-uri in dev
    computeResetUrl() {
        // Replace with your preferred domain if different
        return 'https://www.centraltradekeplr.com/forgot-password.html';
    }

    async handleForgotPassword(e) {
        e.preventDefault();
        
        // FIXED: Use correct element IDs
        const email = document.getElementById('resetEmail').value.trim();
        const emailError = document.getElementById('resetEmailError');
        const resetBtn = document.getElementById('resetBtn');
        
        // Clear previous errors
        emailError.textContent = '';
        
        // Validate email
        if (!email) {
            emailError.textContent = 'Please enter your email address';
            return;
        }
        
        if (!this.isValidEmail(email)) {
            emailError.textContent = 'Please enter a valid email address';
            return;
        }
        
        // Show loading state
        resetBtn.disabled = true;
        resetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        
        try {
            await sendPasswordResetEmail(auth, email, {
                url: this.computeResetUrl(),
                handleCodeInApp: false
            });
            
            // Store email for resend functionality
            sessionStorage.setItem('resetEmail', email);
            
            // Show success message
            this.showSuccessMessage();
            
        } catch (error) {
            console.error('Password reset error:', error);
            
            let errorMessage = 'An error occurred. Please try again.';
            
            switch (error.code) {
                case 'auth/user-not-found':
                    errorMessage = 'No account found with this email address';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address';
                    break;
                case 'auth/too-many-requests':
                    errorMessage = 'Too many requests. Please try again later';
                    break;
                case 'auth/network-request-failed':
                    errorMessage = 'Network error. Please check your connection';
                    break;
                case 'auth/unauthorized-continue-uri':
                    errorMessage = 'Password reset temporarily unavailable. Please contact support.';
                    break;
            }
            
            emailError.textContent = errorMessage;
            
        } finally {
            // Reset button state
            resetBtn.disabled = false;
            resetBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link';
        }
    }

    async handleResend(e) {
        e.preventDefault();
        
        const email = sessionStorage.getItem('resetEmail');
        if (!email) {
            alert('Please go back and enter your email again');
            return;
        }
        
        const resendLink = document.getElementById('resendLink');
        resendLink.textContent = 'Sending...';
        
        try {
            await sendPasswordResetEmail(auth, email, {
                url: this.computeResetUrl(),
                handleCodeInApp: false
            });
            
            resendLink.textContent = 'Sent!';
            setTimeout(() => {
                resendLink.textContent = 'Resend';
            }, 3000);
            
        } catch (error) {
            console.error('Resend error:', error);
            resendLink.textContent = 'Error - Try Again';
            setTimeout(() => {
                resendLink.textContent = 'Resend';
            }, 3000);
        }
    }

    showSuccessMessage() {
        const resetForm = document.getElementById('reset-form');
        const successMessage = document.getElementById('success-message');
        
        if (resetForm) resetForm.style.display = 'none';
        if (successMessage) successMessage.style.display = 'block';
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ForgotPasswordManager();
});