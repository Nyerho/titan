// Auth Page JavaScript
import authManager from './auth-integration.js';

document.addEventListener('DOMContentLoaded', function() {
    initializeAuthPage();
});

function initializeAuthPage() {
    // Tab switching
    const authTabs = document.querySelectorAll('.auth-tab');
    const formContainers = document.querySelectorAll('.auth-form-container');
    
    authTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            // Update active tab
            authTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active form
            formContainers.forEach(container => {
                container.classList.remove('active');
                if (container.id === targetTab + '-form') {
                    container.classList.add('active');
                }
            });
        });
    });
    
    // Form validation
    setupFormValidation();
    
    // Password strength checker
    setupPasswordStrength();
    
    // Form submissions
    setupFormSubmissions();

    setupDemoLogin();
}

function setupDemoLogin() {
    const btn = document.getElementById('demoLoginBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
        const profile = {
            uid: 'demo_user',
            displayName: 'Demo Trader',
            fullName: 'Demo Trader',
            email: 'demo@titantrades.com',
            phoneNumber: ''
        };

        localStorage.setItem('tt_demo_mode', '1');
        localStorage.setItem('tt_demo_profile', JSON.stringify(profile));
        localStorage.setItem('tt_demo_balance', '10000');
        localStorage.setItem('tt_demo_botsOwned', JSON.stringify({}));
        window.location.href = 'dashboard.html';
    });
}

function setupFormValidation() {
    const forms = document.querySelectorAll('.auth-form');
    
    forms.forEach(form => {
        const inputs = form.querySelectorAll('input, select');
        
        inputs.forEach(input => {
            input.addEventListener('blur', () => validateField(input));
            input.addEventListener('input', () => clearError(input));
        });
    });
}

function validateField(field) {
    const value = field.value.trim();
    const fieldName = field.name;
    const errorElement = document.getElementById(fieldName + 'Error') || 
                        document.getElementById(field.id + 'Error');
    
    let isValid = true;
    let errorMessage = '';
    
    // Required field validation
    if (field.hasAttribute('required') && !value) {
        isValid = false;
        errorMessage = 'This field is required';
    }
    
    // Email validation
    else if (field.type === 'email' && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            isValid = false;
            errorMessage = 'Please enter a valid email address';
        }
    }
    
    // Phone validation
    else if (field.type === 'tel' && value) {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        if (!phoneRegex.test(value.replace(/[\s\-\(\)]/g, ''))) {
            isValid = false;
            errorMessage = 'Please enter a valid phone number';
        }
    }
    
    // Mirror Trade Code validation (optional field)
    else if (fieldName === 'mirrorTradeCode' && value) {
        const codeRegex = /^[A-Z0-9]{4,12}$/;
        if (!codeRegex.test(value.toUpperCase())) {
            isValid = false;
            errorMessage = 'Mirror Trade code must be 4-12 characters (letters and numbers only)';
        }
    }
    
    // Password validation
    else if (field.type === 'password' && fieldName === 'password' && value) {
        if (value.length < 8) {
            isValid = false;
            errorMessage = 'Password must be at least 8 characters long';
        } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value)) {
            isValid = false;
            errorMessage = 'Password must contain uppercase, lowercase, and number';
        }
    }
    
    // Confirm password validation
    else if (fieldName === 'confirmPassword' && value) {
        const passwordField = document.getElementById('registerPassword');
        if (value !== passwordField.value) {
            isValid = false;
            errorMessage = 'Passwords do not match';
        }
    }
    
    // Terms validation
    else if (fieldName === 'terms' && field.type === 'checkbox') {
        if (!field.checked) {
            isValid = false;
            errorMessage = 'You must agree to the terms and conditions';
        }
    }
    
    // Update field appearance and error message
    if (errorElement) {
        errorElement.textContent = errorMessage;
    }
    
    field.style.borderColor = isValid ? '#e1e5e9' : '#e74c3c';
    
    return isValid;
}

function clearError(field) {
    const fieldName = field.name;
    const errorElement = document.getElementById(fieldName + 'Error') || 
                        document.getElementById(field.id + 'Error');
    
    if (errorElement) {
        errorElement.textContent = '';
    }
    
    field.style.borderColor = '#e1e5e9';
}

function setupPasswordStrength() {
    const passwordField = document.getElementById('registerPassword');
    const strengthBar = document.querySelector('.strength-fill');
    const strengthText = document.querySelector('.strength-text');
    
    if (passwordField && strengthBar && strengthText) {
        passwordField.addEventListener('input', function() {
            const password = this.value;
            const strength = calculatePasswordStrength(password);
            
            // Remove all strength classes
            strengthBar.className = 'strength-fill';
            
            if (password.length > 0) {
                strengthBar.classList.add(strength.class);
                strengthText.textContent = strength.text;
            } else {
                strengthText.textContent = 'Password strength';
            }
        });
    }
}

function calculatePasswordStrength(password) {
    let score = 0;
    
    // Length check
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    
    // Character variety checks
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    
    // Return strength object
    if (score < 3) {
        return { class: 'weak', text: 'Weak password' };
    } else if (score < 4) {
        return { class: 'fair', text: 'Fair password' };
    } else if (score < 5) {
        return { class: 'good', text: 'Good password' };
    } else {
        return { class: 'strong', text: 'Strong password' };
    }
}

function setupFormSubmissions() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Register form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
    
    // Forgot password form
    const forgotForm = document.getElementById('forgotPasswordForm');
    if (forgotForm) {
        forgotForm.addEventListener('submit', handleForgotPassword);
    }
}

function handleLogin(e) {
    e.preventDefault(); // Prevent default form submission
    e.stopPropagation(); // Stop event bubbling
    
    console.log('Login form submitted'); // Debug log
    
    // Get form elements
    const email = document.getElementById('loginEmail')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value;
    
    // Validate inputs
    if (!email || !password) {
        showNotification('Please enter both email and password', 'error');
        return false;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showNotification('Please enter a valid email address', 'error');
        return false;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]') || e.target.querySelector('.auth-btn');
    const originalText = submitBtn ? submitBtn.innerHTML : '';
    
    // Show loading state
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';
        submitBtn.disabled = true;
    }
    
    console.log('Attempting login with:', { email }); // Debug log
    
    // Use the imported authManager directly
    authManager.login(email, password)
        .then(success => {
            console.log('Login result:', success);
            
            // Reset button state
            if (submitBtn) {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
            
            if (success) {
                console.log('Login successful, redirecting...');
                // Don't redirect here - let authManager handle it
            }
        })
        .catch(error => {
            console.error('Login error:', error);
            
            // Reset button state
            if (submitBtn) {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
            
            showNotification('Login failed: ' + (error.message || 'Please try again'), 'error');
        });
    
    return false; // Prevent any form submission
}

function handleRegister(e) {
    e.preventDefault();
    
    console.log('Registration form submitted');
    console.log('AuthManager available:', !!window.authManager);
    
    const form = e.target;
    const inputs = form.querySelectorAll('input, select');
    
    // Validate all fields
    let isFormValid = true;
    inputs.forEach(input => {
        if (!validateField(input)) {
            isFormValid = false;
        }
    });
    
    if (!isFormValid) {
        console.log('Form validation failed');
        showNotification('Please fix the errors above', 'error');
        return;
    }
    
    // Get form data
    const formData = new FormData(form);
    const userData = {
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        fullName: `${formData.get('firstName')} ${formData.get('lastName')}`,
        email: formData.get('email'),
        password: formData.get('password'),
        phone: formData.get('phone'),
        country: formData.get('country'),
        mirrorTradeCode: formData.get('mirrorTradeCode') || ''
    };
    
    // Validate MTC code if provided (optional but must be correct if entered)
    const validMTCCode = '8247';
    if (userData.mirrorTradeCode && userData.mirrorTradeCode !== validMTCCode) {
        showNotification('Invalid Mirror Trade Code. Please check the code or leave it blank.', 'error');
        return;
    }
    
    // Add MTC status to user data for admin reference
    userData.mtcStatus = userData.mirrorTradeCode === validMTCCode ? 'valid' : 'none';
    userData.mtcCode = userData.mirrorTradeCode; // Store the actual code entered
    
    // Validate required fields
    if (!userData.firstName || !userData.lastName || !userData.email || !userData.password) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    console.log('User data:', userData);
    
    // Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
    submitBtn.disabled = true;
    
    console.log('Waiting for AuthManager...');
    
    const startTime = Date.now();
    
    // Wait for AuthManager to be available
    const waitForAuthManager = () => {
        console.log('Checking AuthManager:', !!window.authManager);
        if (window.authManager) {
            console.log('AuthManager found, attempting registration...');
            // Use Firebase authentication through AuthManager
            window.authManager.register(userData)
                .then(success => {
                    console.log('Registration result:', success);
                    // Reset button
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    
                    if (success) {
                        // Registration successful
                        console.log('Registration successful');
                        showNotification('Account created successfully! Please login with your credentials.', 'success');
                        // Redirect to login form instead of index
                        setTimeout(() => {
                            // Switch to login tab on the same page
                            const loginTab = document.querySelector('[data-tab="login"]');
                            const registerTab = document.querySelector('[data-tab="register"]');
                            const loginForm = document.getElementById('loginForm');
                            const registerForm = document.getElementById('registerForm');
                            
                            if (loginTab && registerTab && loginForm && registerForm) {
                                // Switch tabs
                                registerTab.classList.remove('active');
                                loginTab.classList.add('active');
                                registerForm.classList.remove('active');
                                loginForm.classList.add('active');
                                
                                // Clear the registration form
                                registerForm.reset();
                                
                                // Pre-fill email in login form
                                const loginEmailField = loginForm.querySelector('[name="email"]');
                                if (loginEmailField) {
                                    loginEmailField.value = userData.email;
                                }
                            }
                        }, 2000);
                    } else {
                        showNotification('Registration failed. Please try again.', 'error');
                    }
                })
                .catch(error => {
                    console.error('Registration error:', error);
                    // Reset button on error
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    showNotification('Registration failed: ' + (error.message || 'Please try again.'), 'error');
                });
        } else {
            console.log('AuthManager not ready, waiting...');
            // Add timeout to prevent infinite waiting
            if (Date.now() - startTime > 10000) { // 10 second timeout
                console.error('AuthManager timeout');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                showNotification('System not ready. Please refresh the page and try again.', 'error');
                return;
            }
            // Wait a bit more for AuthManager to load
            setTimeout(waitForAuthManager, 100);
        }
    };
    
    waitForAuthManager();
}

// Update the forgot password functions
function showForgotPassword() {
    // Redirect to dedicated forgot password page
    window.location.href = 'forgot-password.html';
}

function closeForgotPassword() {
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Update the handleForgotPassword function
async function handleForgotPassword(e) {
    e.preventDefault();
    
    const email = document.getElementById('resetEmail').value.trim();
    const resetEmailError = document.getElementById('resetEmailError');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    // Clear previous errors
    resetEmailError.textContent = '';
    
    if (!email) {
        resetEmailError.textContent = 'Please enter your email address';
        return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        resetEmailError.textContent = 'Please enter a valid email address';
        return;
    }
    
    // Show loading state
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    
    try {
        // Use the FirebaseAuthService instead of direct Firebase calls
        const { default: authService } = await import('./firebase-auth.js');
        const result = await authService.resetPassword(email);
        
        if (result.success) {
            // Show success message
            resetEmailError.style.color = 'green';
            resetEmailError.textContent = 'Password reset email sent! Check your inbox.';
            
            // Close modal after 2 seconds
            setTimeout(() => {
                closeForgotPassword();
                resetEmailError.textContent = '';
                resetEmailError.style.color = '';
            }, 2000);
        } else {
            resetEmailError.textContent = result.message || 'Failed to send reset email. Please try again.';
        }
        
    } catch (error) {
        console.error('Password reset error:', error);
        resetEmailError.textContent = 'Network error. Please check your connection and try again.';
    } finally {
        // Reset button state
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Add notification styles if not already added
    if (!document.querySelector('#notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            .notification {
                position: fixed;
                top: 2rem;
                right: 2rem;
                background: white;
                border-radius: 10px;
                padding: 1rem 1.5rem;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
                z-index: 3000;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
                max-width: 400px;
                animation: slideIn 0.3s ease;
                border-left: 4px solid #667eea;
            }
            .notification.success {
                border-left-color: #27ae60;
            }
            .notification.error {
                border-left-color: #e74c3c;
            }
            .notification-content {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            .notification-content i {
                color: #667eea;
            }
            .notification.success .notification-content i {
                color: #27ae60;
            }
            .notification.error .notification-content i {
                color: #e74c3c;
            }
            .notification-close {
                background: none;
                border: none;
                color: #666;
                cursor: pointer;
                padding: 0.25rem;
                border-radius: 4px;
            }
            .notification-close:hover {
                background: #f8f9fa;
            }
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(styles);
    }
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('show');
    }
});

// Google Sign-In Configuration
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID'; // Replace with your actual Google Client ID

// Google Sign-In Handlers
function handleGoogleSignIn(response) {
    try {
        // Decode the JWT token
        const responsePayload = decodeJwtResponse(response.credential);
        
        // Extract user information
        const userData = {
            email: responsePayload.email,
            name: responsePayload.name,
            firstName: responsePayload.given_name,
            lastName: responsePayload.family_name,
            picture: responsePayload.picture,
            googleId: responsePayload.sub
        };
        
        // Process Google Sign-In
        processGoogleAuth(userData, 'signin');
        
    } catch (error) {
        console.error('Google Sign-In Error:', error);
        showNotification('Google Sign-In failed. Please try again.', 'error');
    }
}

function handleGoogleSignUp(response) {
    try {
        // Decode the JWT token
        const responsePayload = decodeJwtResponse(response.credential);
        
        // Extract user information
        const userData = {
            email: responsePayload.email,
            name: responsePayload.name,
            firstName: responsePayload.given_name,
            lastName: responsePayload.family_name,
            picture: responsePayload.picture,
            googleId: responsePayload.sub
        };
        
        // Process Google Sign-Up
        processGoogleAuth(userData, 'signup');
        
    } catch (error) {
        console.error('Google Sign-Up Error:', error);
        showNotification('Google Sign-Up failed. Please try again.', 'error');
    }
}

function decodeJwtResponse(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    
    return JSON.parse(jsonPayload);
}

function processGoogleAuth(userData, type) {
    // Show loading state
    const loadingMessage = type === 'signin' ? 'Signing you in...' : 'Creating your account...';
    showNotification(loadingMessage, 'info');
    
    // Simulate API call to your backend
    setTimeout(() => {
        if (type === 'signin') {
            // Handle successful Google Sign-In
            localStorage.setItem('user', JSON.stringify({
                id: userData.googleId,
                email: userData.email,
                name: userData.name,
                picture: userData.picture,
                authMethod: 'google'
            }));
            
            showNotification(`Welcome back, ${userData.firstName}!`, 'success');
            
            // Redirect to platform or dashboard
            setTimeout(() => {
                window.location.href = 'platform.html';
            }, 1500);
            
        } else {
            // Handle successful Google Sign-Up
            // Pre-fill registration form with Google data
            document.getElementById('firstName').value = userData.firstName || '';
            document.getElementById('lastName').value = userData.lastName || '';
            document.getElementById('registerEmail').value = userData.email || '';
            
            // Show success message
            showNotification(`Account created successfully! Welcome, ${userData.firstName}!`, 'success');
            
            // Store user data
            localStorage.setItem('user', JSON.stringify({
                id: userData.googleId,
                email: userData.email,
                name: userData.name,
                picture: userData.picture,
                authMethod: 'google'
            }));
            
            // Redirect to platform
            setTimeout(() => {
                window.location.href = 'platform.html';
            }, 1500);
        }
    }, 1000);
}

// Initialize Google Sign-In when page loads
function initializeGoogleSignIn() {
    // This function will be called after Google API loads
    if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleSignIn
        });
        
        // Render sign-in buttons
        google.accounts.id.renderButton(
            document.querySelector('.g_id_signin'),
            {
                theme: 'outline',
                size: 'large',
                type: 'standard',
                shape: 'rectangular',
                text: 'signin_with',
                logo_alignment: 'left'
            }
        );
    }
}

// ... Country code mapping
const countryCodeMap = {
    'AF': '+93', 'AL': '+355', 'DZ': '+213', 'AR': '+54', 'AU': '+61',
    'AT': '+43', 'BD': '+880', 'BE': '+32', 'BR': '+55', 'BG': '+359',
    'CA': '+1', 'CL': '+56', 'CN': '+86', 'CO': '+57', 'CR': '+506',
    'HR': '+385', 'CZ': '+420', 'DK': '+45', 'EG': '+20', 'EE': '+372',
    'FI': '+358', 'FR': '+33', 'DE': '+49', 'GH': '+233', 'GR': '+30',
    'HK': '+852', 'HU': '+36', 'IS': '+354', 'IN': '+91', 'ID': '+62',
    'IE': '+353', 'IL': '+972', 'IT': '+39', 'JP': '+81', 'KE': '+254',
    'KR': '+82', 'LV': '+371', 'LT': '+370', 'MY': '+60', 'MX': '+52',
    'NL': '+31', 'NZ': '+64', 'NG': '+234', 'NO': '+47', 'PK': '+92',
    'PE': '+51', 'PH': '+63', 'PL': '+48', 'PT': '+351', 'RO': '+40',
    'RU': '+7', 'SA': '+966', 'SG': '+65', 'SK': '+421', 'SI': '+386',
    'ZA': '+27', 'ES': '+34', 'LK': '+94', 'SE': '+46', 'CH': '+41',
    'TW': '+886', 'TH': '+66', 'TR': '+90', 'UA': '+380', 'AE': '+971',
    'GB': '+44', 'US': '+1', 'VE': '+58', 'VN': '+84'
};

// Update country code when country is selected
function updateCountryCode() {
    const countrySelect = document.getElementById('country');
    const countryCodeInput = document.getElementById('countryCode');
    const countryCodeGroup = document.getElementById('countryCodeGroup');
    
    if (countrySelect.value) {
        const countryCode = countryCodeMap[countrySelect.value];
        countryCodeInput.value = countryCode;
        countryCodeGroup.style.display = 'block';
    } else {
        countryCodeInput.value = '';
        countryCodeGroup.style.display = 'none';
    }
}

// Make functions globally accessible
window.showForgotPassword = showForgotPassword;
window.closeForgotPassword = closeForgotPassword;
window.updateCountryCode = updateCountryCode;
window.handleForgotPassword = handleForgotPassword;

// Add verification handler
async function handleEmailVerification() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('verify');
    const email = urlParams.get('email');
    
    if (token && email) {
        try {
            // Verify token in Firestore
            const userDoc = await db.collection('users').where('email', '==', email).where('verificationToken', '==', token).get();
            
            if (!userDoc.empty) {
                const userData = userDoc.docs[0].data();
                
                // Check if token is still valid
                if (userData.verificationTokenExpiry > Date.now()) {
                    // Mark email as verified
                    await userDoc.docs[0].ref.update({
                        emailVerified: true,
                        verificationToken: null,
                        verificationTokenExpiry: null
                    });
                    
                    showMessage('Email verified successfully! You can now log in.', 'success');
                } else {
                    showMessage('Verification link has expired. Please request a new one.', 'error');
                }
            } else {
                showMessage('Invalid verification link.', 'error');
            }
        } catch (error) {
            console.error('Verification error:', error);
            showMessage('Verification failed. Please try again.', 'error');
        }
    }
}

// Call on page load
document.addEventListener('DOMContentLoaded', handleEmailVerification);

// Password visibility toggle function
function togglePassword(inputId) {
    const passwordInput = document.getElementById(inputId);
    const toggleButton = passwordInput.parentElement.querySelector('.password-toggle');
    const toggleIcon = toggleButton.querySelector('i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash');
        toggleButton.setAttribute('aria-label', 'Hide password');
    } else {
        passwordInput.type = 'password';
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye');
        toggleButton.setAttribute('aria-label', 'Show password');
    }
}

// Make function globally accessible
window.togglePassword = togglePassword;
