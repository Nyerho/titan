// Profile Management JavaScript
import userProfileService from './user-profile-service.js';
import { auth } from './firebase-config.js';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, updateEmail, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { db } from './firebase-config.js';
import { collection, query, where, orderBy, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

class ProfileManager {
    constructor() {
        this.isEditMode = false;
        this.currentTab = 'profile-info';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadUserProfile();
        this.loadTransactionHistory();
        this.loadTradingHistory();
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.profile-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = item.getAttribute('data-tab');
                this.switchTab(tabId);
            });
        });

        // Profile form submission
        const profileForm = document.getElementById('profileForm');
        if (profileForm) {
            profileForm.addEventListener('submit', (e) => this.handleProfileUpdate(e));
        }

        // Password form submission
        const passwordForm = document.getElementById('passwordForm');
        if (passwordForm) {
            passwordForm.addEventListener('submit', (e) => this.handlePasswordUpdate(e));
        }

        // Filter controls
        const transactionFilter = document.getElementById('transactionFilter');
        if (transactionFilter) {
            transactionFilter.addEventListener('change', () => this.filterTransactions());
        }

        const tradeFilter = document.getElementById('tradeFilter');
        if (tradeFilter) {
            tradeFilter.addEventListener('change', () => this.filterTrades());
        }
    }

    async loadUserProfile() {
        const profile = userProfileService.getCurrentUserProfile();
        if (profile) {
            this.populateProfileForm(profile);
        } else {
            // Wait for profile to load
            setTimeout(() => this.loadUserProfile(), 1000);
        }
    }

    populateProfileForm(profile) {
        const fields = ['firstName', 'lastName', 'email', 'phone', 'country', 'accountType'];
        
        fields.forEach(field => {
            const element = document.getElementById(field);
            if (element && profile[field]) {
                element.value = profile[field];
            }
        });

        // Special handling for email (from auth)
        const emailField = document.getElementById('email');
        if (emailField && auth.currentUser) {
            emailField.value = auth.currentUser.email;
        }
    }

    switchTab(tabId) {
        // Remove active class from all tabs and nav items
        document.querySelectorAll('.profile-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.profile-nav-item').forEach(item => {
            item.classList.remove('active');
        });

        // Add active class to selected tab and nav item
        const selectedTab = document.getElementById(tabId);
        const selectedNavItem = document.querySelector(`[data-tab="${tabId}"]`);
        
        if (selectedTab) selectedTab.classList.add('active');
        if (selectedNavItem) selectedNavItem.classList.add('active');

        this.currentTab = tabId;

        // Load data for specific tabs
        if (tabId === 'transaction-history') {
            this.loadTransactionHistory();
        } else if (tabId === 'trading-history') {
            this.loadTradingHistory();
        }
    }

    setupRealtimeTransactionListener() {
        const transactionList = document.getElementById('transactionList');
        if (!transactionList) return;
    
        // Clean existing listeners
        if (this.transactionUnsubscribers && Array.isArray(this.transactionUnsubscribers)) {
            this.transactionUnsubscribers.forEach(unsub => unsub && unsub());
        }
        this.transactionUnsubscribers = [];

        transactionList.innerHTML = '<div class="loading">Loading transactions...</div>';

        const transactionsRef = collection(db, 'transactions');
        const uid = auth?.currentUser?.uid;
        if (!uid) {
            transactionList.innerHTML = '<div class="error">You must be signed in to see your transactions</div>';
            return;
        }
    
        // Listen on both fields (no orderBy to avoid index requirements)
        const qUserId = query(transactionsRef, where('userId', '==', uid));
        const qUid = query(transactionsRef, where('uid', '==', uid));
    
        // Buffers
        this._txUserId = [];
        this._txUid = [];
    
        const toMillis = (val) => {
            const d = val?.toDate ? val.toDate() : val;
            if (d instanceof Date) return d.getTime();
            if (typeof d === 'number') return d;
            return 0;
        };
    
        const mergeAndDisplay = () => {
            const map = new Map();
            [...this._txUserId, ...this._txUid].forEach(tx => map.set(tx.id, tx));
            const merged = Array.from(map.values()).sort((a, b) => {
                const aTs = toMillis(a.timestamp) || toMillis(a.createdAt);
                const bTs = toMillis(b.timestamp) || toMillis(b.createdAt);
                return bTs - aTs;
            });
            this.displayTransactions(merged);
        };
    
        const unsubUserId = onSnapshot(qUserId, (querySnapshot) => {
            this._txUserId = [];
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                this._txUserId.push({ id: docSnap.id, ...data });
            });
            mergeAndDisplay();
        }, (error) => {
            console.error('Error in transactions listener (userId):', error);
        });
    
        const unsubUid = onSnapshot(qUid, (querySnapshot) => {
            this._txUid = [];
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                this._txUid.push({ id: docSnap.id, ...data });
            });
            mergeAndDisplay();
        }, (error) => {
            console.error('Error in transactions listener (uid):', error);
        });
    
        this.transactionUnsubscribers.push(unsubUserId, unsubUid);
    }

    async loadTransactionHistory() {
        // Replace the old method with real-time listener
        this.setupRealtimeTransactionListener();
    }

    cleanup() {
        if (this.transactionUnsubscribers && Array.isArray(this.transactionUnsubscribers)) {
            this.transactionUnsubscribers.forEach(unsub => unsub && unsub());
            this.transactionUnsubscribers = [];
        }
        this.transactionListener = null;
    }
    displayTransactions(transactions) {
        const transactionList = document.getElementById('transactionList');
        
        if (transactions.length === 0) {
            transactionList.innerHTML = '<div class="empty-state">No transactions found</div>';
            return;
        }

        const transactionHTML = transactions.map(transaction => `
            <div class="transaction-item">
                <div class="transaction-info">
                    <div class="transaction-type ${transaction.type}">
                        <i class="fas fa-${this.getTransactionIcon(transaction.type)}"></i>
                        ${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                    </div>
                    <div class="transaction-details">
                        <div class="transaction-amount ${transaction.type === 'withdrawal' ? 'negative' : 'positive'}">
                            ${transaction.type === 'withdrawal' ? '-' : '+'}$${transaction.amount.toFixed(2)}
                        </div>
                        <div class="transaction-date">
                            ${new Date((transaction.createdAt?.toDate ? transaction.createdAt.toDate() : transaction.createdAt) || (transaction.timestamp?.toDate ? transaction.timestamp.toDate() : transaction.timestamp) || Date.now()).toLocaleDateString()}
                        </div>
                    </div>
                </div>
                <div class="transaction-status ${transaction.status}">
                    ${transaction.status}
                </div>
            </div>
        `).join('');

        transactionList.innerHTML = transactionHTML;
    }

    async loadTradingHistory() {
        const tradeList = document.getElementById('tradeList');
        if (!tradeList) return;

        tradeList.innerHTML = '<div class="loading">Loading trades...</div>';

        try {
            const trades = await userProfileService.getTradingHistory(auth.currentUser.uid);
            this.displayTrades(trades);
        } catch (error) {
            console.error('Error loading trades:', error);
            tradeList.innerHTML = '<div class="error">Error loading trades</div>';
        }
    }

    displayTrades(trades) {
        const tradeList = document.getElementById('tradeList');
        
        if (trades.length === 0) {
            tradeList.innerHTML = '<div class="empty-state">No trades found</div>';
            return;
        }

        const tradeHTML = trades.map(trade => `
            <div class="trade-item">
                <div class="trade-info">
                    <div class="trade-symbol">${trade.symbol}</div>
                    <div class="trade-type ${trade.type}">${trade.type.toUpperCase()}</div>
                    <div class="trade-size">${trade.size} lots</div>
                </div>
                <div class="trade-prices">
                    <div class="entry-price">Entry: ${trade.entryPrice}</div>
                    ${trade.exitPrice ? `<div class="exit-price">Exit: ${trade.exitPrice}</div>` : ''}
                </div>
                <div class="trade-pnl ${trade.pnl >= 0 ? 'positive' : 'negative'}">
                    ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}
                </div>
                <div class="trade-status ${trade.status}">
                    ${trade.status}
                </div>
            </div>
        `).join('');

        tradeList.innerHTML = tradeHTML;
    }

    getTransactionIcon(type) {
        const icons = {
            deposit: 'plus-circle',
            withdrawal: 'minus-circle',
            transfer: 'exchange-alt'
        };
        return icons[type] || 'circle';
    }

    async handleProfileUpdate(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const newEmail = String(formData.get('email') || '').trim();
        const profileData = {
            firstName: formData.get('firstName'),
            lastName: formData.get('lastName'),
            phone: formData.get('phone'),
            country: formData.get('country'),
            displayName: `${formData.get('firstName')} ${formData.get('lastName')}`.trim(),
            email: newEmail
        };

        try {
            const currentUser = auth.currentUser;
            if (!currentUser) {
                this.showNotification('You must be signed in', 'error');
                return;
            }

            const needsEmailChange = !!newEmail && newEmail !== currentUser.email;
            if (needsEmailChange) {
                const currentPassword = window.prompt('Enter your current password to change your email');
                if (!currentPassword) {
                    this.showNotification('Email change cancelled', 'info');
                    return;
                }

                const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
                await reauthenticateWithCredential(currentUser, credential);
                await updateEmail(currentUser, newEmail);

                const origin = typeof window !== 'undefined' ? String(window.location?.origin || '') : '';
                const baseUrl = origin && origin !== 'null' ? origin : '';
                const isProdDomain =
                    baseUrl.startsWith('https://www.centraltradekeplr.com') ||
                    baseUrl.startsWith('https://centraltradekeplr.com') ||
                    baseUrl.startsWith('https://www.titantrades.com') ||
                    baseUrl.startsWith('https://titantrades.com');
                const continueBase = isProdDomain ? baseUrl : 'https://www.centraltradekeplr.com';
                const actionCodeSettings = { url: `${continueBase}/dashboard.html`, handleCodeInApp: false };
                try {
                    await sendEmailVerification(currentUser, actionCodeSettings);
                } catch (innerError) {
                    if (innerError?.code === 'auth/unauthorized-continue-uri') {
                        await sendEmailVerification(currentUser);
                    } else {
                        throw innerError;
                    }
                }
            }

            const result = await userProfileService.updateUserProfile(auth.currentUser.uid, profileData);
            
            if (result.success) {
                this.showNotification(needsEmailChange ? 'Profile updated. Check your email to verify the new address.' : 'Profile updated successfully!', 'success');
                window.toggleEditMode();
            } else {
                this.showNotification('Error updating profile: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error updating profile:', error);
            this.showNotification('Error updating profile: ' + (error?.message || 'Please try again later.'), 'error');
        }
    }

    async handlePasswordUpdate(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const currentPassword = formData.get('currentPassword');
        const newPassword = formData.get('newPassword');
        const confirmPassword = formData.get('confirmPassword');

        if (newPassword !== confirmPassword) {
            this.showNotification('New passwords do not match', 'error');
            return;
        }

        try {
            // Reauthenticate user
            const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
            await reauthenticateWithCredential(auth.currentUser, credential);
            
            // Update password
            await updatePassword(auth.currentUser, newPassword);
            
            this.showNotification('Password updated successfully!', 'success');
            e.target.reset();
        } catch (error) {
            console.error('Error updating password:', error);
            this.showNotification('Error updating password: ' + error.message, 'error');
        }
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }
}

// Global functions for profile management
window.toggleEditMode = function() {
    const profileManager = window.profileManager;
    const form = document.getElementById('profileForm');
    const inputs = form.querySelectorAll('input, select');
    const actions = form.querySelector('.form-actions');
    const editBtn = document.querySelector('.btn-edit');
    
    profileManager.isEditMode = !profileManager.isEditMode;
    
    inputs.forEach(input => {
        if (profileManager.isEditMode) {
            input.readOnly = false;
            input.disabled = false;
            input.removeAttribute('readonly');
            input.removeAttribute('disabled');
        } else {
            input.readOnly = true;
            input.disabled = true;
            input.setAttribute('readonly', '');
            input.setAttribute('disabled', '');
        }
    });
    
    actions.style.display = profileManager.isEditMode ? 'block' : 'none';
    editBtn.textContent = profileManager.isEditMode ? 'Cancel Edit' : 'Edit Profile';
};

window.cancelEdit = function() {
    window.toggleEditMode();
    window.profileManager.loadUserProfile(); // Reload original data
};

// Initialize profile manager
window.profileManager = new ProfileManager();
