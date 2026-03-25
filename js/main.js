// Mobile Navigation Toggle
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenu.classList.toggle('active');
});

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-link').forEach(n => n.addEventListener('click', () => {
    hamburger.classList.remove('active');
    navMenu.classList.remove('active');
}));

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Active navigation highlighting
window.addEventListener('scroll', () => {
    let current = '';
    const sections = document.querySelectorAll('section');
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (scrollY >= (sectionTop - 200)) {
            current = section.getAttribute('id');
        }
    });

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
});

// Loading animation
window.addEventListener('load', () => {
    document.body.classList.add('loaded');
});

// Enhanced Form validation
function validateForm(form) {
    const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
    let isValid = true;
    const errors = [];

    inputs.forEach(input => {
        const value = input.value.trim();
        input.classList.remove('error');
        
        if (!value) {
            input.classList.add('error');
            errors.push(`${input.name || input.type} is required`);
            isValid = false;
        } else {
            // Email validation
            if (input.type === 'email' && !isValidEmail(value)) {
                input.classList.add('error');
                errors.push('Please enter a valid email address');
                isValid = false;
            }
            
            // Password validation
            if (input.type === 'password' && value.length < 6) {
                input.classList.add('error');
                errors.push('Password must be at least 6 characters long');
                isValid = false;
            }
            
            // Phone validation
            if (input.type === 'tel' && !isValidPhone(value)) {
                input.classList.add('error');
                errors.push('Please enter a valid phone number');
                isValid = false;
            }
        }
    });

    if (!isValid) {
        showNotification(errors[0], 'error');
    }

    return isValid;
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidPhone(phone) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
}

// Enhanced Modal functionality (updated to allow all modals)
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('modal-open');
        document.body.style.overflow = 'hidden';
        
        // Focus first input
        const firstInput = modal.querySelector('input, select, textarea');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('modal-closing');
        setTimeout(() => {
            modal.style.display = 'none';
            modal.classList.remove('modal-open', 'modal-closing');
            document.body.style.overflow = 'auto';
        }, 300);
    }
}

// Close modal when clicking outside or pressing Escape
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        const modalId = e.target.id;
        closeModal(modalId);
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal[style*="flex"]');
        if (openModal) {
            closeModal(openModal.id);
        }
    }
});

// Dynamic content updates
class ContentManager {
    constructor() {
        this.init();
    }
    
    init() {
        this.setupPlatformTabs();
        this.setupContactForm();
        this.setupNewsletterForm();
        this.setupLiveChat();
        this.startMarketUpdates();
    }
    
    setupPlatformTabs() {
        const platformTabs = document.querySelectorAll('.platform-tab');
        const platformContent = document.querySelector('.platform-info');
        
        if (platformTabs.length && platformContent) {
            platformTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    platformTabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    
                    const platform = tab.dataset.platform || tab.textContent.trim();
                    this.updatePlatformContent(platform, platformContent);
                });
            });
        }
    }
    
    updatePlatformContent(platform, container) {
        const content = {
            'mt4mt5': {
                title: 'MetaTrader 4 & 5 <span class="highlight">Mobile Trading</span>',
                description: 'Access over 20,000 instruments including forex, metals, shares, indices, commodities & cryptocurrencies on award-winning MT4 and MT5 Mobile Platforms with instant nano-second execution.',
                image: 'assets/images/mt4.webp'
            },
            'titantrades-advanced': {
                title: 'TitanTrades <span class="highlight">Advanced Platform</span>',
                description: 'Our proprietary trading platform with advanced charting tools, algorithmic trading capabilities, and institutional-grade execution. Perfect for professional traders.',
                image: 'assets/images/tradeen.png'
            },
            'titantrades-plus': {
                title: 'TitanTrades Plus <span class="highlight">Available Now</span>',
                description: 'Next-generation trading platform with AI-powered analytics, social trading features, and advanced risk management tools. Stay tuned for the future of trading.',
                image: 'assets/images/mt5.webp'
            }
        };
        
        const platformData = content[platform] || content['mt4mt5'];
        
        container.querySelector('h3').innerHTML = platformData.title;
        container.querySelector('p').textContent = platformData.description;
        
        const image = document.querySelector('.platform-image');
        if (image) {
            image.src = platformData.image;
            image.alt = `${platform} Trading Platform`;
        }
    }
    
    setupContactForm() {
        const contactForms = document.querySelectorAll('.contact-form');
        contactForms.forEach(form => {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                
                if (validateForm(form)) {
                    this.submitContactForm(new FormData(form));
                }
            });
        });
    }
    
    setupNewsletterForm() {
        const newsletterForms = document.querySelectorAll('.newsletter-form');
        newsletterForms.forEach(form => {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                
                const email = form.querySelector('input[type="email"]').value;
                if (isValidEmail(email)) {
                    this.subscribeNewsletter(email);
                    form.reset();
                } else {
                    showNotification('Please enter a valid email address', 'error');
                }
            });
        });
    }
    
    setupLiveChat() {
        const chatButton = document.querySelector('.live-chat-btn');
        if (chatButton) {
            chatButton.addEventListener('click', () => {
                this.openLiveChat();
            });
        }
    }
    
    // Remove the import statements from here - they should be at the top
    async submitContactForm(formData) {
        try {
            // Store message in Firebase
            await addDoc(collection(db, 'contact_messages'), {
                name: formData.get('name'),
                email: formData.get('email'),
                subject: formData.get('subject'),
                message: formData.get('message'),
                timestamp: serverTimestamp(),
                status: 'unread'
            });
            
            showNotification('Thank you for your message! We will get back to you within 24 hours.', 'success');
        } catch (error) {
            console.error('Error submitting contact form:', error);
            showNotification('Failed to send message. Please try again.', 'error');
        }
    }
    
    subscribeNewsletter(email) {
        // Simulate newsletter subscription
        showNotification('Successfully subscribed to our newsletter!', 'success');
        
        // In a real application, you would send this to your backend
        console.log('Newsletter subscription:', email);
    }
    
    openLiveChat() {
        // Simulate live chat opening
        showNotification('Live chat is now available! Click here to start chatting.', 'success');
    }
    
    startMarketUpdates() {
        // Update market data every 5 seconds
        setInterval(() => {
            this.updateMarketTicker();
        }, 5000);
    }
    
    updateMarketTicker() {
        const tickerItems = document.querySelectorAll('.ticker-item');
        
        tickerItems.forEach(item => {
            const priceElement = item.querySelector('.price');
            const changeElement = item.querySelector('.change');
            
            if (priceElement && changeElement) {
                // Simulate price changes
                const currentPrice = parseFloat(priceElement.textContent);
                const change = (Math.random() - 0.5) * 0.01; // Random change between -0.005 and +0.005
                const newPrice = (currentPrice + change).toFixed(4);
                const changePercent = ((change / currentPrice) * 100).toFixed(2);
                
                priceElement.textContent = newPrice;
                changeElement.textContent = `${change >= 0 ? '+' : ''}${changePercent}%`;
                changeElement.className = `change ${change >= 0 ? 'positive' : 'negative'}`;
                
                // Add flash effect
                item.classList.add('updated');
                setTimeout(() => item.classList.remove('updated'), 1000);
            }
        });
    }
}

// Notification system
function showNotification(message, type = 'info', duration = 5000) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${getNotificationIcon(type)}</span>
            <span class="notification-message">${message}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after duration
    setTimeout(() => {
        if (notification.parentElement) {
            notification.classList.add('notification-exit');
            setTimeout(() => notification.remove(), 300);
        }
    }, duration);
}

function getNotificationIcon(type) {
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };
    return icons[type] || icons.info;
}

// Initialize content manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ContentManager();
    initLandingRotator();
    
    // Setup login/register button handlers
    // Remove these lines that open login/register modals:
    // const loginBtn = document.querySelector('.btn-login');
    // const registerBtn = document.querySelector('.btn-register');
    // 
    // if (loginBtn) {
    //     loginBtn.addEventListener('click', (e) => {
    //         e.preventDefault();
    //         openModal('loginModal');
    //     });
    // }
    // 
    // if (registerBtn) {
    //     registerBtn.addEventListener('click', (e) => {
    //         e.preventDefault();
    //         openModal('registerModal');
    //     });
    // }
    const adminBtn = document.querySelector('.btn-admin');
    
    if (adminBtn) {
        adminBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Check if user is authenticated and has admin privileges
            checkAdminAccess();
        });
    }
});

function initLandingRotator() {
    const messageEl = document.getElementById('landingRotatorMessage');
    const sourceEl = document.getElementById('landingRotatorSource');
    if (!messageEl) return;

    const messages = [];
    if (sourceEl) {
        Array.from(sourceEl.children).forEach((node) => {
            const text = (node.textContent || '').trim();
            if (text) messages.push(text);
        });
    }

    if (!messages.length) {
        messages.push(
            'Buy a trading bot, activate it instantly, and stay in control.',
            'Prop account evaluations with clear drawdown rules and live status.',
            'Trade forex, indices, commodities and crypto with fast execution.',
            'One dashboard for funding, withdrawals, history, and support.'
        );
    }

    const transitions = ['tt-rotator-slide-up', 'tt-rotator-slide-left', 'tt-rotator-zoom', 'tt-rotator-slide-down'];
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let index = 0;
    const tick = () => {
        const transition = prefersReducedMotion ? 'tt-rotator-fade' : transitions[index % transitions.length];
        const message = messages[index % messages.length];

        messageEl.classList.remove(...transitions, 'tt-rotator-fade');
        void messageEl.offsetWidth;
        messageEl.textContent = message;
        messageEl.classList.add(transition);

        index += 1;
    };

    tick();
    window.setInterval(tick, 4000);
}

// Admin access control function
function checkAdminAccess() {
    import('./firebase-config.js').then(async ({ auth, db }) => {
        // Use onAuthStateChanged to ensure auth is ready
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            unsubscribe(); // Clean up listener
            
            if (!user) {
                showNotification('Please log in to access admin panel', 'error');
                return;
            }

            try {
                const { getIdTokenResult } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
                try {
                    if (typeof user.getIdToken === 'function') {
                        const token = await user.getIdToken(true);
                        try {
                            const base64Url = String(token || '').split('.')[1] || '';
                            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                            const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
                            const payload = JSON.parse(atob(padded));
                            if (payload?.admin === true) {
                                window.location.href = 'admin.html';
                                return;
                            }
                        } catch (e) {}
                    }
                } catch (e) {}
                const tokenResult = await getIdTokenResult(user);
                if (tokenResult?.claims?.admin === true) {
                    window.location.href = 'admin.html';
                    return;
                }

                const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                const isAdmin = userDoc.exists() && userDoc.data()?.role === 'admin';
                if (isAdmin) {
                    window.location.href = 'admin.html';
                } else {
                    showNotification('Access denied. Admin privileges required.', 'error');
                }
            } catch (error) {
                console.error('Error checking admin role:', error);
                showNotification('Unable to verify admin access. Please try again.', 'error');
            }
        });
    }).catch(error => {
        console.error('Error checking admin access:', error);
        showNotification('Authentication error. Please try again.', 'error');
    });
}

// Scroll animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
        }
    });
}, observerOptions);

// Observe elements for animation
document.addEventListener('DOMContentLoaded', () => {
    const animateElements = document.querySelectorAll('.feature-card, .stat-box, .tool-item');
    animateElements.forEach(el => observer.observe(el));
});

// Enhanced error handling for extension messages and Firebase
window.addEventListener('error', (event) => {
    // Suppress extension-related errors
    if (event.message && (
        event.message.includes('Extension context invalidated') ||
        event.message.includes('chrome-extension') ||
        event.message.includes('moz-extension')
    )) {
        event.preventDefault();
        return;
    }
});

// ENHANCED: Centralized authentication UI management
window.addEventListener('load', async () => {
    // Wait for auth manager
    let attempts = 0;
    while (!window.authManager && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    if (window.authManager) {
        try {
            // Initialize AuthManager and wait for auth state
            const user = await window.authManager.initialize();
            
            // Set up auth state listener for UI updates
            window.authManager.onAuthStateChanged((user) => {
                updateNavigationForAuthState(user);
            });
            
            // Initial UI update
            updateNavigationForAuthState(user);
            
            // Set up logout functionality
            const logoutBtn = document.querySelector('.btn-logout');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async () => {
                    try {
                        await window.authManager.logout();
                    } catch (error) {
                        console.error('Error signing out:', error);
                    }
                });
            }
        } catch (error) {
            console.error('Error initializing auth:', error);
        }
    }
});

// FIXED: Simplified navigation update function
function updateNavigationForAuthState(user) {
    const loginBtn = document.getElementById('loginBtn');
    const getStartedBtn = document.getElementById('getStartedBtn');
    const dashboardBtn = document.getElementById('dashboardBtn');
    const userMenu = document.querySelector('.user-menu');
    const userName = document.querySelector('.user-name');
    const logoutBtn = document.querySelector('.btn-logout');
    
    if (user) {
        // User is logged in - show authenticated UI
        if (loginBtn) loginBtn.style.display = 'none';
        if (getStartedBtn) getStartedBtn.style.display = 'none';
        if (dashboardBtn) dashboardBtn.style.display = 'inline-block';
        if (userMenu) userMenu.style.display = 'flex';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        if (userName) {
            userName.textContent = user.displayName || user.email.split('@')[0];
        }
    } else {
        // User is not logged in - show guest UI
        if (loginBtn) loginBtn.style.display = 'inline-block';
        if (getStartedBtn) getStartedBtn.style.display = 'inline-block';
        if (dashboardBtn) dashboardBtn.style.display = 'none';
        if (userMenu) userMenu.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
    }
}

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function(e) {
    // Suppress extension-related promise rejections
    if (e.reason && e.reason.message && 
        (e.reason.message.includes('message port closed') ||
         e.reason.message.includes('Could not establish connection'))) {
        e.preventDefault();
        return;
    }
    
    console.error('Unhandled promise rejection:', e.reason);
    e.preventDefault();
});

// Initialize API keys on application startup
if (typeof API_CONFIG !== 'undefined') {
    // Try to get keys from localStorage first
    let sendGridKey = localStorage.getItem('sendgrid_api_key');
    let sendGridSecret = localStorage.getItem('sendgrid_secret_token');
    
    // If not in localStorage, prompt user (only in development)
    if (!sendGridKey || !sendGridSecret) {
        if (confirm('SendGrid API keys not configured. Would you like to set them now?')) {
            sendGridKey = prompt('Enter SendGrid API Key:');
            sendGridSecret = prompt('Enter SendGrid Secret Token:');
            
            if (sendGridKey && sendGridSecret) {
                localStorage.setItem('sendgrid_api_key', sendGridKey);
                localStorage.setItem('sendgrid_secret_token', sendGridSecret);
            }
        }
    }
    
    if (sendGridKey && sendGridSecret) {
        API_CONFIG.setApiKey('SENDGRID_API_KEY', sendGridKey);
        API_CONFIG.setApiKey('SENDGRID_SECRET_TOKEN', sendGridSecret);
        console.log('SendGrid API keys initialized from secure storage');
    } else {
        console.warn('SendGrid API keys not configured. Email functionality will be disabled.');
    }
}

// Disable console logs in production
if (window.location.protocol !== 'file:') {
    console.log = function() {};
    console.warn = function() {};
    console.info = function() {};
}
