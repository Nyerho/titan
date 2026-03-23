// Password Manager JavaScript
class PasswordManager {
    constructor() {
        this.allUsers = [];
        this.filteredUsers = [];
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.editingUserId = null;
    }

    async init() {
        // Initialize Firebase if not already done
        try {
            if (typeof firebase !== 'undefined' && firebase.apps.length === 0) {
                const firebaseConfig = {
                    apiKey: "AIzaSyAwnWoLfrEc1EtXWCD0by5L0VtCmYf8Unw",
                    authDomain: "centraltradehub-30f00.firebaseapp.com",
                    projectId: "centraltradehub-30f00",
                    storageBucket: "centraltradehub-30f00.firebasestorage.app",
                    messagingSenderId: "745751687877",
                    appId: "1:745751687877:web:4576449aa2e8360931b6ac",
                    measurementId: "G-YHCS5CH450"
                };
                
                firebase.initializeApp(firebaseConfig);
                console.log('Firebase initialized successfully in password manager');
            } else if (typeof firebase !== 'undefined') {
                console.log('Using existing Firebase instance in password manager');
            } else {
                console.error('Firebase not available');
                this.showToast('Firebase connection failed', 'error');
                return;
            }

            console.log('Firebase available, loading real user data...');
            await this.loadUsers();
            this.setupEventListeners();
        } catch (error) {
            console.error('Error initializing password manager:', error);
            this.showToast('Failed to initialize password manager', 'error');
        }
    }

    async loadUsers() {
        try {
            // Show loading state
            const tbody = document.getElementById('passwordTableBody');
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Loading users...</td></tr>';

            // Load users from Firestore
            const usersSnapshot = await firebase.firestore().collection('users').get();
            
            if (usersSnapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No users found in database</td></tr>';
                this.allUsers = [];
                this.filteredUsers = [];
                return;
            }

            this.allUsers = [];
            usersSnapshot.forEach(doc => {
                const userData = doc.data();
                this.allUsers.push({
                    id: doc.id,
                    email: userData.email || 'N/A',
                    name: userData.displayName || (userData.firstName && userData.lastName ? userData.firstName + ' ' + userData.lastName : 'N/A'),
                    status: userData.emailVerified ? 'active' : 'pending',
                    password: userData.password || '••••••••', // Show masked if no password stored
                    createdAt: userData.createdAt || new Date()
                });
            });

            this.filteredUsers = [...this.allUsers];
            this.displayUsers();
            this.showToast(`Loaded ${this.allUsers.length} users successfully`, 'success');
            
        } catch (error) {
            console.error('Error loading users from Firestore:', error);
            this.showToast('Failed to load users from database', 'error');
            
            // Show error message in table
            const tbody = document.getElementById('passwordTableBody');
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #dc3545;">Error loading users. Please check your connection and try refreshing.</td></tr>';
        }
    }

    getSampleUsers() {
        return [
            {
                id: 'user1',
                email: 'john.doe@example.com',
                name: 'John Doe',
                status: 'active',
                password: 'SecurePass123!',
                lastLogin: new Date('2024-01-15')
            },
            {
                id: 'user2',
                email: 'jane.smith@example.com',
                name: 'Jane Smith',
                status: 'pending',
                password: 'MyPassword456@',
                lastLogin: new Date('2024-01-14')
            },
            {
                id: 'user3',
                email: 'bob.wilson@example.com',
                name: 'Bob Wilson',
                status: 'active',
                password: 'BobSecure789#',
                lastLogin: new Date('2024-01-13')
            },
            {
                id: 'user4',
                email: 'alice.brown@example.com',
                name: 'Alice Brown',
                status: 'suspended',
                password: 'AlicePass321$',
                lastLogin: new Date('2024-01-12')
            }
        ];
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('searchInput');
        const statusFilter = document.getElementById('statusFilter');
        
        searchInput.addEventListener('input', () => this.filterUsers());
        statusFilter.addEventListener('change', () => this.filterUsers());
    }

    filterUsers() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const statusFilter = document.getElementById('statusFilter').value;
        
        this.filteredUsers = this.allUsers.filter(user => {
            const matchesSearch = 
                user.email.toLowerCase().includes(searchTerm) ||
                user.name.toLowerCase().includes(searchTerm) ||
                user.id.toLowerCase().includes(searchTerm);
            
            const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
            
            return matchesSearch && matchesStatus;
        });
        
        this.currentPage = 1;
        this.displayUsers();
    }

    displayUsers() {
        const tbody = document.getElementById('passwordTableBody');
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const usersToShow = this.filteredUsers.slice(startIndex, endIndex);
        
        if (usersToShow.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No users match your search criteria</td></tr>';
            return;
        }
        
        tbody.innerHTML = usersToShow.map(user => `
            <tr>
                <td>${user.id}</td>
                <td>${user.email}</td>
                <td>${user.name}</td>
                <td>
                    <span class="status-badge status-${user.status}">
                        ${user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                    </span>
                </td>
                <td>
                    <div class="password-field">
                        <input type="password" 
                               id="password-${user.id}" 
                               class="password-input" 
                               value="${user.password}" 
                               readonly>
                    </div>
                </td>
                <td>
                    <div class="action-buttons">
                        <button onclick="window.passwordManager.togglePassword('${user.id}')" 
                                class="btn btn-sm btn-info" 
                                title="Toggle Password Visibility">
                            <i class="fas fa-eye" id="eye-${user.id}"></i>
                        </button>
                        <button onclick="window.passwordManager.copyPassword('${user.id}')" 
                                class="btn btn-sm btn-success" 
                                title="Copy Password">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button onclick="window.passwordManager.editPassword('${user.id}')" 
                                class="btn btn-sm btn-warning" 
                                title="Edit Password">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="window.passwordManager.generatePassword('${user.id}')" 
                                class="btn btn-sm btn-secondary" 
                                title="Generate New Password">
                            <i class="fas fa-random"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        this.updatePagination();
    }

    togglePassword(userId) {
        console.log('Toggling password for user:', userId);
        const passwordInput = document.getElementById(`password-${userId}`);
        const eyeIcon = document.getElementById(`eye-${userId}`);
        
        if (!passwordInput || !eyeIcon) {
            console.error('Password input or eye icon not found for user:', userId);
            return;
        }
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            eyeIcon.className = 'fas fa-eye-slash';
            console.log('Password shown for user:', userId);
        } else {
            passwordInput.type = 'password';
            eyeIcon.className = 'fas fa-eye';
            console.log('Password hidden for user:', userId);
        }
    }

    async copyPassword(userId) {
        const passwordInput = document.getElementById(`password-${userId}`);
        
        try {
            await navigator.clipboard.writeText(passwordInput.value);
            this.showToast('Password copied to clipboard', 'success');
        } catch (error) {
            // Fallback for older browsers
            passwordInput.select();
            document.execCommand('copy');
            this.showToast('Password copied to clipboard', 'success');
        }
    }

    editPassword(userId) {
        const passwordInput = document.getElementById(`password-${userId}`);
        const user = this.allUsers.find(u => u.id === userId);
        
        if (passwordInput.readOnly) {
            passwordInput.readOnly = false;
            passwordInput.focus();
            passwordInput.style.background = '#fff3cd';
            
            // Add save/cancel buttons
            const actionsCell = passwordInput.closest('tr').querySelector('.action-buttons');
            actionsCell.innerHTML += `
                <button onclick="passwordManager.savePassword('${userId}')" 
                        class="btn btn-sm btn-success" id="save-${userId}">
                    <i class="fas fa-check"></i>
                </button>
                <button onclick="passwordManager.cancelEdit('${userId}')" 
                        class="btn btn-sm btn-secondary" id="cancel-${userId}">
                    <i class="fas fa-times"></i>
                </button>
            `;
        }
    }

    async savePassword(userId) {
        const passwordInput = document.getElementById(`password-${userId}`);
        const newPassword = passwordInput.value;
        
        if (!newPassword || newPassword.length < 6) {
            this.showToast('Password must be at least 6 characters long', 'error');
            return;
        }
        
        try {
            // Update password in Firestore
            await firebase.firestore().collection('users').doc(userId).update({
                password: newPassword,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Update local data
            const userIndex = this.allUsers.findIndex(user => user.id === userId);
            if (userIndex !== -1) {
                this.allUsers[userIndex].password = newPassword;
            }
            
            // Update filtered data
            const filteredIndex = this.filteredUsers.findIndex(user => user.id === userId);
            if (filteredIndex !== -1) {
                this.filteredUsers[filteredIndex].password = newPassword;
            }
            
            this.cancelEdit(userId);
            this.showToast('Password updated successfully', 'success');
            
        } catch (error) {
            console.error('Error updating password:', error);
            this.showToast('Failed to update password', 'error');
        }
    }

    cancelEdit(userId) {
        const passwordInput = document.getElementById(`password-${userId}`);
        const user = this.allUsers.find(u => u.id === userId);
        
        passwordInput.value = user.password;
        passwordInput.readOnly = true;
        passwordInput.style.background = '';
        
        this.displayUsers();
    }

    generatePassword(userId) {
        const length = 12;
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let password = '';
        
        for (let i = 0; i < length; i++) {
            password += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        
        const passwordInput = document.getElementById(`password-${userId}`);
        passwordInput.value = password;
        
        // Auto-save the generated password
        this.savePassword(userId);
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredUsers.length / this.itemsPerPage);
        const paginationContainer = document.getElementById('paginationContainer');
        
        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }
        
        let paginationHTML = `
            <button class="page-btn" onclick="passwordManager.changePage(${this.currentPage - 1})" 
                    ${this.currentPage === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
        `;
        
        for (let i = 1; i <= totalPages; i++) {
            paginationHTML += `
                <button class="page-btn ${i === this.currentPage ? 'active' : ''}" 
                        onclick="passwordManager.changePage(${i})">
                    ${i}
                </button>
            `;
        }
        
        paginationHTML += `
            <button class="page-btn" onclick="passwordManager.changePage(${this.currentPage + 1})" 
                    ${this.currentPage === totalPages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        `;
        
        paginationContainer.innerHTML = paginationHTML;
    }

    changePage(page) {
        const totalPages = Math.ceil(this.filteredUsers.length / this.itemsPerPage);
        
        if (page >= 1 && page <= totalPages) {
            this.currentPage = page;
            this.displayUsers();
        }
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');
        
        toastMessage.textContent = message;
        toast.className = `toast toast-${type} show`;
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Global functions
function refreshPasswords() {
    if (window.passwordManager) {
        window.passwordManager.loadUsers();
    }
}

// Initialize when DOM is loaded
let passwordManager;
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for Firebase to initialize
    setTimeout(() => {
        passwordManager = new PasswordManager();
        window.passwordManager = passwordManager; // Make it globally accessible
        passwordManager.init();
    }, 1000);
});