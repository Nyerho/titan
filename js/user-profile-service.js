// User Profile Management Service
import { auth, db } from './firebase-config.js';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';

class UserProfileService {
    constructor() {
        this.currentUser = null;
        this.userProfile = null;
        this.initializeAuthListener();
    }

    // Initialize authentication listener
    initializeAuthListener() {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                await this.loadUserProfile(user.uid);
                this.updatePlatformUI();
            } else {
                this.currentUser = null;
                this.userProfile = null;
            }
        });
    }

    // Load user profile from Firebase
    // Enhanced user profile loading with complete data
    async loadUserProfile(uid) {
        try {
            const userRef = doc(db, 'users', uid);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
                this.userProfile = userDoc.data();
                
                // Load additional account data
                const accountRef = doc(db, 'accounts', uid);
                const accountDoc = await getDoc(accountRef);
                
                if (accountDoc.exists()) {
                    this.userProfile = { ...this.userProfile, ...accountDoc.data() };
                }
                
                return this.userProfile;
            } else {
                // Create comprehensive default profile
                const defaultProfile = {
                    uid: uid,
                    email: this.currentUser.email,
                    displayName: this.currentUser.displayName || 'User',
                    firstName: '',
                    lastName: '',
                    phone: '',
                    country: '',
                    accountType: 'Standard',
                    balance: 0,
                    equity: 0,
                    margin: 0,
                    freeMargin: 0,
                    totalDeposits: 0,
                    totalWithdrawals: 0,
                    totalProfits: 0,
                    totalTrades: 0,
                    successfulTrades: 0,
                    kycStatus: 'pending',
                    emailVerified: this.currentUser.emailVerified || false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                
                await this.updateUserProfile(uid, defaultProfile);
                this.userProfile = defaultProfile;
                return defaultProfile;
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
            return null;
        }
    }

    // Enhanced UI update with complete profile data
    updatePlatformUI() {
        if (!this.userProfile) return;
    
        // Update user name in header
        const userNameEl = document.getElementById('current-user-name');
        if (userNameEl) {
            const displayName = this.userProfile.firstName && this.userProfile.lastName 
                ? `${this.userProfile.firstName} ${this.userProfile.lastName}`
                : this.userProfile.displayName || this.currentUser.displayName || 'User';
            userNameEl.textContent = displayName;
        }
    
        // Update all profile fields if on profile page
        const profileFields = {
            'firstName': this.userProfile.firstName || '',
            'lastName': this.userProfile.lastName || '',
            'email': this.currentUser.email || '',
            'phone': this.userProfile.phone || '',
            'country': this.userProfile.country || '',
            'accountType': this.userProfile.accountType || 'Standard'
        };
        
        Object.entries(profileFields).forEach(([fieldId, value]) => {
            const element = document.getElementById(fieldId);
            if (element) {
                element.value = value;
            }
        });
    
        // Update account balance information
        this.updateAccountSummary();
        
        // Update user avatar if available
        const userAvatarEl = document.querySelector('.user-avatar');
        if (userAvatarEl && this.userProfile.photoURL) {
            userAvatarEl.src = this.userProfile.photoURL;
        }
        
        // Update KYC status if element exists
        const kycStatusEl = document.getElementById('kycStatus');
        if (kycStatusEl) {
            kycStatusEl.textContent = this.userProfile.kycStatus || 'pending';
            kycStatusEl.className = `kyc-status ${this.userProfile.kycStatus || 'pending'}`;
        }
    }

    // Update user profile
    async updateUserProfile(uid, profileData) {
        try {
            const userRef = doc(db, 'users', uid);
            const updateData = {
                ...profileData,
                updatedAt: serverTimestamp()
            };
            
            await updateDoc(userRef, updateData);
            this.userProfile = { ...this.userProfile, ...updateData };
            this.updatePlatformUI();
            
            return { success: true, message: 'Profile updated successfully' };
        } catch (error) {
            console.error('Error updating profile:', error);
            return { success: false, error: error.message };
        }
    }

    // Get user transaction history
    async getTransactionHistory(uid, limit = 50) {
        try {
            const transactionsRef = collection(db, 'transactions');
            const q = query(
                transactionsRef,
                where('userId', '==', uid),
                orderBy('timestamp', 'desc') // Use 'timestamp' instead of 'createdAt'
            );
    
            const querySnapshot = await getDocs(q);
            const transactions = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                transactions.push({
                    id: doc.id,
                    ...data
                });
            });
            return transactions;
        } catch (error) {
            console.error('Error fetching transaction history:', error);
            // Fallback in case of timestamp/index issues
            const fallbackQuery = query(
                collection(db, 'transactions'),
                where('userId', '==', uid),
                orderBy('createdAt', 'desc')
            );
            const fallbackSnapshot = await getDocs(fallbackQuery);
            const fallbackTransactions = [];
            fallbackSnapshot.forEach((doc) => {
                const data = doc.data();
                fallbackTransactions.push({
                    id: doc.id,
                    ...data
                });
            });
            return fallbackTransactions;
        }
    }

    // Get user trading history
    async getTradingHistory(uid, limit = 50) {
        try {
            const tradesRef = collection(db, 'trades');
            const q = query(
                tradesRef,
                where('uid', '==', uid),
                orderBy('createdAt', 'desc'),
                limit(limit)
            );
            
            const querySnapshot = await getDocs(q);
            const trades = [];
            
            querySnapshot.forEach((doc) => {
                trades.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            return trades;
        } catch (error) {
            console.error('Error fetching trading history:', error);
            return [];
        }
    }

    // Update platform UI with user data
    updatePlatformUI() {
        if (!this.userProfile) return;

        // Update user name in header
        const userNameEl = document.getElementById('current-user-name');
        if (userNameEl) {
            userNameEl.textContent = this.userProfile.displayName || 
                `${this.userProfile.firstName} ${this.userProfile.lastName}`.trim() || 
                'User';
        }

        // Update account balance information
        this.updateAccountSummary();
        
        // Update user avatar if available
        const userAvatarEl = document.querySelector('.user-avatar');
        if (userAvatarEl && this.userProfile.photoURL) {
            userAvatarEl.src = this.userProfile.photoURL;
        }
    }

    // Update account summary display
    updateAccountSummary() {
        const elements = {
            'account-balance': this.formatCurrency(this.userProfile.balance || 0),
            'account-equity': this.formatCurrency(this.userProfile.equity || 0),
            'account-margin': this.formatCurrency(this.userProfile.margin || 0),
            'account-free-margin': this.formatCurrency(this.userProfile.freeMargin || 0)
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }

    // Format currency values
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(amount || 0);
    }

    // Get current user profile
    getCurrentUserProfile() {
        return this.userProfile;
    }

    // Check if user is logged in
    isUserLoggedIn() {
        return !!this.currentUser;
    }
}

// Export singleton instance
const userProfileService = new UserProfileService();
export default userProfileService;