// Forgot Password Functionality
import { auth } from './firebase-config.js';
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

    computeApiBaseUrl() {
        const isLocal = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.port === '5500' ||
            window.location.port === '3000' ||
            window.location.protocol === 'file:' ||
            window.location.href.includes('localhost');
        const storedBaseUrl = localStorage.getItem('admin_api_baseUrl') || localStorage.getItem('tt_api_baseUrl');
        if (storedBaseUrl) return storedBaseUrl;
        return isLocal ? 'http://localhost:3001' : 'https://titantrades.onrender.com';
    }

    async sendResetEmailViaBackend({ email, continueUrl }) {
        const baseUrl = this.computeApiBaseUrl();
        const response = await fetch(`${baseUrl}/api/auth/password-reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, continueUrl })
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch (e) {}

        if (!response.ok) {
            const msg = String(payload?.error || '').trim();
            throw new Error(msg || 'Password reset service is not available. Please try again later.');
        }

        if (payload?.throttled) {
            throw new Error('Please wait a moment and try again.');
        }

        return payload;
    }

    async sendResetEmail({ email, continueUrl }) {
        try {
            return await this.sendResetEmailViaBackend({ email, continueUrl });
        } catch (error) {
            const msg = String(error?.message || '').trim().toLowerCase();
            const shouldFallback =
                msg.includes('key not found') ||
                msg.includes('email transport not configured') ||
                msg.includes('password reset service is not available') ||
                msg.includes('email service is not configured');

            if (!shouldFallback) throw error;

            await sendPasswordResetEmail(auth, email, { url: continueUrl, handleCodeInApp: false });
            return { success: true, emailSent: true, fallback: 'firebase' };
        }
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
            const continueUrl = this.computeResetUrl();
            await this.sendResetEmail({ email, continueUrl });
            
            // Store email for resend functionality
            sessionStorage.setItem('resetEmail', email);
            
            // Show success message
            this.showSuccessMessage();
            
        } catch (error) {
            console.error('Password reset error:', error);
            
            let errorMessage = String(error?.message || '').trim() || 'An error occurred. Please try again.';
            
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
                    errorMessage = 'Password reset failed. Please try again.';
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
            const continueUrl = this.computeResetUrl();
            await this.sendResetEmail({ email, continueUrl });
            
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
