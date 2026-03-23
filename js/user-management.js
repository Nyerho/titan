// User Management System
let currentPage = 1;
const usersPerPage = 10;
let allUsers = [];
let filteredUsers = [];
let currentUserDetails = {};

// Error handling
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    showToast('An error occurred. Please refresh the page.', 'error');
});

// Enhanced Firebase initialization with better error handling
try {
    // Check if Firebase is available
    if (typeof firebase === 'undefined') {
        console.error('Firebase not loaded from CDN');
        showToast('Firebase connection failed. Please check your internet connection and refresh the page.', 'error');
        return;
    }
    
    if (firebase.apps.length === 0) {
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
        window.db = firebase.firestore();
        console.log('Firebase initialized successfully with correct config');
    } else {
        window.db = firebase.firestore();
        console.log('Using existing Firebase instance');
    }
} catch (error) {
    console.error('Firebase initialization failed:', error);
    window.db = null;
    showToast('Database connection failed. Please refresh the page.', 'error');
}

// Enhanced initialization with timeout
async function initializeUserManagement() {
    try {
        // Wait for Firebase to be ready
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds
        
        while (typeof firebase === 'undefined' && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase failed to load after 5 seconds');
        }
        
        setupEventListeners();
        showLoading(true);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await loadUsers();
        updateDashboardStats();
        
        setTimeout(() => showLoading(false), 200);
    } catch (error) {
        console.error('Failed to initialize user management:', error);
        showToast('Failed to load user management system. Please refresh the page.', 'error');
        showLoading(false);
        
        // Show error message in the main content area
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #dc3545;">
                    <h3>Failed to Load User Management</h3>
                    <p>Please check your internet connection and refresh the page.</p>
                    <button onclick="location.reload()" class="btn-primary">Refresh Page</button>
                </div>
            `;
        }
    }
}

// Setup event listeners
function setupEventListeners() {
    const searchInput = document.getElementById('searchUsers');
    const statusFilter = document.getElementById('statusFilter');
    const refreshBtn = document.getElementById('refreshUsers');
    
    if (searchInput) searchInput.addEventListener('input', filterUsers);
    if (statusFilter) statusFilter.addEventListener('change', filterUsers);
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
        loadUsers();
        showToast('User data refreshed', 'success');
    });
}

// Load users from Firestore - Updated to work with real database
async function loadUsers() {
    try {
        showLoading(true);
        
        if (window.db) {
            console.log('Loading users from Firestore...');
            const usersSnapshot = await window.db.collection('users').get();
            allUsers = usersSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            console.log(`Successfully loaded ${allUsers.length} users from database`);
            
            if (allUsers.length === 0) {
                console.log('No users found in database');
                showToast('No users found in database', 'info');
            } else {
                showToast(`Loaded ${allUsers.length} users successfully`, 'success');
            }
        } else {
            console.error('Firebase database not available');
            showToast('Database connection failed', 'error');
            allUsers = [];
        }
        
        filteredUsers = [...allUsers];
        displayUsers();
        updatePagination();
        updateDashboardStats();
        showLoading(false);
        
    } catch (error) {
        console.error('Error loading users:', error);
        showToast(`Error loading users: ${error.message}`, 'error');
        showLoading(false);
        allUsers = [];
        filteredUsers = [];
        displayUsers();
        updatePagination();
        updateDashboardStats();
    }
}

// Load sample data
function loadSampleData() {
    allUsers = [
        {
            id: 'user1',
            email: 'john.doe@example.com',
            fullName: 'John Doe',
            accountBalance: 15000.50,
            status: 'active',
            joinDate: '2024-01-15',
            phone: '+1-555-0123',
            address: '123 Main St, New York, NY 10001',
            verificationStatus: 'verified',
            twoFactorEnabled: true,
            lastLogin: '2024-01-20 14:30:00'
        },
        {
            id: 'user2',
            email: 'jane.smith@example.com',
            fullName: 'Jane Smith',
            accountBalance: 8750.25,
            status: 'active',
            joinDate: '2024-01-10',
            phone: '+1-555-0124',
            address: '456 Oak Ave, Los Angeles, CA 90210',
            verificationStatus: 'verified',
            twoFactorEnabled: false,
            lastLogin: '2024-01-19 09:15:00'
        },
        {
            id: 'user3',
            email: 'mike.johnson@example.com',
            fullName: 'Mike Johnson',
            accountBalance: 2300.75,
            status: 'pending',
            joinDate: '2024-01-18',
            phone: '+1-555-0125',
            address: '789 Pine St, Chicago, IL 60601',
            verificationStatus: 'pending',
            twoFactorEnabled: false,
            lastLogin: '2024-01-18 16:45:00'
        },
        {
            id: 'user4',
            email: 'sarah.wilson@example.com',
            fullName: 'Sarah Wilson',
            accountBalance: 0.00,
            status: 'suspended',
            joinDate: '2024-01-05',
            phone: '+1-555-0126',
            address: '321 Elm St, Houston, TX 77001',
            verificationStatus: 'verified',
            twoFactorEnabled: true,
            lastLogin: '2024-01-15 11:20:00'
        }
    ];
}

// Update dashboard statistics
function updateDashboardStats() {
    const totalUsers = allUsers.length;
    const activeUsers = allUsers.filter(user => user.status === 'active').length;
    const pendingUsers = allUsers.filter(user => user.status === 'pending').length;
    const suspendedUsers = allUsers.filter(user => user.status === 'suspended').length;
    
    // Update the stat cards
    const totalUsersElement = document.getElementById('totalUsersCount');
    const activeUsersElement = document.getElementById('activeUsersCount');
    const pendingUsersElement = document.getElementById('pendingUsersCount');
    const suspendedUsersElement = document.getElementById('suspendedUsersCount');
    
    if (totalUsersElement) totalUsersElement.textContent = totalUsers;
    if (activeUsersElement) activeUsersElement.textContent = activeUsers;
    if (pendingUsersElement) pendingUsersElement.textContent = pendingUsers;
    if (suspendedUsersElement) suspendedUsersElement.textContent = suspendedUsers;
}

// Filter users based on search and status
function filterUsers() {
    const searchTerm = document.getElementById('searchUsers')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    
    filteredUsers = allUsers.filter(user => {
        const matchesSearch = user.fullName.toLowerCase().includes(searchTerm) || 
                            user.email.toLowerCase().includes(searchTerm);
        const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
        
        return matchesSearch && matchesStatus;
    });
    
    currentPage = 1;
    displayUsers();
    updatePagination();
}

// Display users in table
function displayUsers() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    const startIndex = (currentPage - 1) * usersPerPage;
    const endIndex = startIndex + usersPerPage;
    const usersToShow = filteredUsers.slice(startIndex, endIndex);
    
    // Create a document fragment to build the new content
    const fragment = document.createDocumentFragment();
    
    usersToShow.forEach(user => {
        const row = document.createElement('tr');
        // Fix the name display logic
        const displayName = user.displayName || 
                           (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : '') ||
                           (user.profile?.firstName && user.profile?.lastName ? `${user.profile.firstName} ${user.profile.lastName}` : '') ||
                           user.fullName ||
                           'N/A';
        
        row.innerHTML = `
            <td>${user.id}</td>
            <td>${user.email || 'N/A'}</td>
            <td>${displayName}</td>
            <td>$${user.accountBalance?.toFixed(2) || user.balance?.toFixed(2) || user.trading?.balance?.toFixed(2) || '0.00'}</td>
            <td><span class="status-badge status-${user.status || user.trading?.accountStatus || 'active'}">${user.status || user.trading?.accountStatus || 'active'}</span></td>
            <td>${user.joinDate || (user.createdAt ? new Date(user.createdAt.toDate ? user.createdAt.toDate() : user.createdAt).toLocaleDateString() : 'N/A')}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="toggleUserDetails('${user.id}')">
                    <i class="fas fa-eye"></i> Details
                </button>
                <button class="btn btn-sm btn-warning" onclick="editUser('${user.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteUser('${user.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        fragment.appendChild(row);
    });
    
    // Replace all content at once to prevent flashing
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

// Update pagination
function updatePagination() {
    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const pagination = document.getElementById('pagination');
    
    if (!pagination) return;
    
    pagination.innerHTML = '';
    
    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.className = `btn btn-sm ${currentPage === 1 ? 'btn-secondary' : 'btn-primary'}`;
    prevBtn.textContent = 'Previous';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => changePage(currentPage - 1);
    pagination.appendChild(prevBtn);
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-outline-primary'}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => changePage(i);
        pagination.appendChild(pageBtn);
    }
    
    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.className = `btn btn-sm ${currentPage === totalPages ? 'btn-secondary' : 'btn-primary'}`;
    nextBtn.textContent = 'Next';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => changePage(currentPage + 1);
    pagination.appendChild(nextBtn);
}

// Change page
function changePage(page) {
    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        displayUsers();
        updatePagination();
    }
}

// Toggle user details
async function toggleUserDetails(userId) {
    const existingDetails = document.getElementById(`user-details-${userId}`);
    
    if (existingDetails) {
        existingDetails.remove();
        return;
    }
    
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    // Generate sample data
    const trades = generateSampleTrades(userId);
    const transactions = generateSampleTransactions(userId);
    
    // Find the user row
    const userRow = document.querySelector(`tr:has(button[onclick="toggleUserDetails('${userId}')"])`);
    if (!userRow) return;
    
    // Create details row
    const detailsRow = document.createElement('tr');
    detailsRow.id = `user-details-${userId}`;
    detailsRow.innerHTML = `
        <td colspan="7">
            ${renderUserDetails(user, trades, transactions, userId)}
        </td>
    `;
    
    // Insert after user row
    userRow.insertAdjacentElement('afterend', detailsRow);
}

// Generate sample trades
function generateSampleTrades(userId) {
    return [
        {
            id: `trade_${userId}_1`,
            pair: 'BTC/USD',
            type: 'buy',
            amount: 0.5,
            price: 45000,
            total: 22500,
            date: '2024-01-20 10:30:00',
            status: 'completed'
        },
        {
            id: `trade_${userId}_2`,
            pair: 'ETH/USD',
            type: 'sell',
            amount: 2.0,
            price: 2800,
            total: 5600,
            date: '2024-01-19 14:15:00',
            status: 'completed'
        }
    ];
}

// Generate sample transactions
function generateSampleTransactions(userId) {
    return [
        {
            id: `txn_${userId}_1`,
            type: 'deposit',
            amount: 10000,
            currency: 'USD',
            date: '2024-01-18 09:00:00',
            status: 'completed',
            method: 'Bank Transfer'
        },
        {
            id: `txn_${userId}_2`,
            type: 'withdrawal',
            amount: 2500,
            currency: 'USD',
            date: '2024-01-17 16:30:00',
            status: 'completed',
            method: 'Bank Transfer'
        }
    ];
}

// Render user details
function renderUserDetails(userData, trades, transactions, userId) {
    const stats = calculateUserStats(trades, transactions);
    
    // Fix name display in user details
    const fullName = userData.displayName || 
                    (userData.firstName && userData.lastName ? `${userData.firstName} ${userData.lastName}` : '') ||
                    (userData.profile?.firstName && userData.profile?.lastName ? `${userData.profile.firstName} ${userData.profile.lastName}` : '') ||
                    userData.fullName ||
                    'N/A';
    
    return `
        <div class="user-details-container">
            <div class="details-tabs">
                <button class="tab-btn active" onclick="showTab('profile-${userId}', this)">Profile</button>
                <button class="tab-btn" onclick="showTab('financial-${userId}', this)">Financial</button>
                <button class="tab-btn" onclick="showTab('trading-${userId}', this)">Trading History</button>
                <button class="tab-btn" onclick="showTab('transactions-${userId}', this)">Transactions</button>
            </div>
            
            <div class="tab-content">
                <!-- Profile Tab -->
                <div id="profile-${userId}" class="tab-pane active">
                    <div class="profile-section">
                        <h4>User Profile</h4>
                        <div class="form-group">
                            <label>Full Name:</label>
                            <input type="text" value="${fullName}" id="fullName-${userId}">
                        </div>
                        <div class="form-group">
                            <label>Email:</label>
                            <input type="email" value="${userData.email || 'N/A'}" id="email-${userId}">
                        </div>
                        <div class="form-group">
                            <label>Phone:</label>
                            <input type="tel" value="${userData.phone || ''}" id="phone-${userId}">
                        </div>
                        <div class="form-group">
                            <label>Address:</label>
                            <textarea id="address-${userId}">${userData.address || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label>Status:</label>
                            <select id="status-${userId}">
                                <option value="active" ${userData.status === 'active' ? 'selected' : ''}>Active</option>
                                <option value="pending" ${userData.status === 'pending' ? 'selected' : ''}>Pending</option>
                                <option value="suspended" ${userData.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Verification Status:</label>
                            <select id="verification-${userId}">
                                <option value="verified" ${userData.verificationStatus === 'verified' ? 'selected' : ''}>Verified</option>
                                <option value="pending" ${userData.verificationStatus === 'pending' ? 'selected' : ''}>Pending</option>
                                <option value="rejected" ${userData.verificationStatus === 'rejected' ? 'selected' : ''}>Rejected</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>2FA Enabled:</label>
                            <input type="checkbox" ${userData.twoFactorEnabled ? 'checked' : ''} id="twoFA-${userId}" onchange="toggle2FA('${userId}')">
                        </div>
                        <div class="form-group">
                            <label>Join Date:</label>
                            <input type="date" value="${userData.joinDate}" id="joinDate-${userId}">
                        </div>
                        <div class="form-group">
                            <label>Last Login:</label>
                            <input type="text" value="${userData.lastLogin || 'Never'}" readonly>
                        </div>
                        <div class="action-buttons">
                            <button class="btn btn-primary" onclick="saveInlineUserChanges('${userId}')">Save Changes</button>
                            <button class="btn btn-warning" onclick="resetUserPassword('${userId}')">Reset Password</button>
                        </div>
                    </div>
                </div>
                
                <!-- Financial Tab -->
                <div id="financial-${userId}" class="tab-pane">
                    <div class="financial-section">
                        <h4>Financial Overview</h4>
                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="stat-value">$${userData.accountBalance?.toFixed(2) || '0.00'}</div>
                                <div class="stat-label">Account Balance</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">$${(userData.totalProfits || 0).toFixed(2)}</div>
                                <div class="stat-label">Total Profits (Received)</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">$${(userData.totalDeposits || 0).toFixed(2)}</div>
                                <div class="stat-label">Total Deposits</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">$${stats.tradingVolume.toFixed(2)}</div>
                                <div class="stat-label">Trading Volume</div>
                            </div>
                        </div>
                        
                        <!-- Admin Edit Section for Profits and Deposits -->
                        <div class="admin-edit-section">
                            <h5>Edit Financial Data</h5>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Total Profits (Received):</label>
                                    <input type="number" id="edit-profits-${userId}" 
                                           value="${userData.totalProfits || 0}" 
                                           step="0.01" min="0" class="form-control">
                                </div>
                                <div class="form-group">
                                    <label>Total Deposits:</label>
                                    <input type="number" id="edit-deposits-${userId}" 
                                           value="${userData.totalDeposits || 0}" 
                                           step="0.01" min="0" class="form-control">
                                </div>
                            </div>
                            <div class="form-group">
                                <button onclick="updateUserFinancials('${userId}')" class="btn btn-primary">
                                    <i class="fas fa-save"></i> Update Financial Data
                                </button>
                                <button onclick="calculateBalance('${userId}')" class="btn btn-info">
                                    <i class="fas fa-calculator"></i> Auto-Calculate Balance
                                </button>
                            </div>
                            <div class="balance-info">
                                <small class="text-muted">
                                    Account Balance = Total Deposits + Total Profits - Total Withdrawals
                                </small>
                            </div>
                        </div>
                        
                        <div class="balance-adjustment">
                            <h5>Manual Balance Adjustment</h5>
                            <div class="form-group">
                                <label>Amount:</label>
                                <input type="number" step="0.01" id="balanceAdjustment-${userId}" placeholder="Enter amount">
                            </div>
                            <div class="form-group">
                                <label>Reason:</label>
                                <input type="text" id="adjustmentReason-${userId}" placeholder="Reason for adjustment">
                            </div>
                            <div class="action-buttons">
                                <button class="btn btn-success" onclick="adjustUserBalance('${userId}', 'add')">Add Funds</button>
                                <button class="btn btn-danger" onclick="adjustUserBalance('${userId}', 'subtract')">Subtract Funds</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Trading History Tab -->
                <div id="trading-${userId}" class="tab-pane">
                    <div class="trading-section">
                        <h4>Trading History</h4>
                        <div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Pair</th>
                                        <th>Type</th>
                                        <th>Amount</th>
                                        <th>Price</th>
                                        <th>Total</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${trades.map(trade => `
                                        <tr>
                                            <td>${trade.date}</td>
                                            <td>${trade.pair}</td>
                                            <td><span class="badge badge-${trade.type === 'buy' ? 'success' : 'danger'}">${trade.type.toUpperCase()}</span></td>
                                            <td>${trade.amount}</td>
                                            <td>$${trade.price.toLocaleString()}</td>
                                            <td>$${trade.total.toLocaleString()}</td>
                                            <td><span class="status-badge status-${trade.status}">${trade.status}</span></td>
                                            <td>
                                                <button class="btn btn-sm btn-warning" onclick="editTrade('${trade.id}')">Edit</button>
                                                <button class="btn btn-sm btn-danger" onclick="deleteTrade('${trade.id}')">Delete</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                
                <!-- Transactions Tab -->
                <div id="transactions-${userId}" class="tab-pane">
                    <div class="transactions-section">
                        <h4>Transaction History</h4>
                        <div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Amount</th>
                                        <th>Currency</th>
                                        <th>Method</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${transactions.map(txn => `
                                        <tr>
                                            <td>${txn.date}</td>
                                            <td><span class="badge badge-${txn.type === 'deposit' ? 'success' : 'warning'}">${txn.type.toUpperCase()}</span></td>
                                            <td>$${txn.amount.toLocaleString()}</td>
                                            <td>${txn.currency}</td>
                                            <td>${txn.method}</td>
                                            <td><span class="status-badge status-${txn.status}">${txn.status}</span></td>
                                            <td>
                                                <button class="btn btn-sm btn-warning" onclick="editTransaction('${txn.id}')">Edit</button>
                                                <button class="btn btn-sm btn-danger" onclick="deleteTransaction('${txn.id}')">Delete</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Calculate user statistics
function calculateUserStats(trades, transactions) {
    const totalDeposits = transactions
        .filter(txn => txn.type === 'deposit')
        .reduce((sum, txn) => sum + txn.amount, 0);
    
    const totalWithdrawals = transactions
        .filter(txn => txn.type === 'withdrawal')
        .reduce((sum, txn) => sum + txn.amount, 0);
    
    const tradingVolume = trades
        .reduce((sum, trade) => sum + trade.total, 0);
    
    return {
        totalDeposits,
        totalWithdrawals,
        tradingVolume
    };
}

// Show tab
function showTab(tabId, buttonElement) {
    // Hide all tab panes
    const tabPanes = buttonElement.closest('.user-details-container').querySelectorAll('.tab-pane');
    tabPanes.forEach(pane => pane.classList.remove('active'));
    
    // Remove active class from all tab buttons
    const tabButtons = buttonElement.closest('.details-tabs').querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab and mark button as active
    document.getElementById(tabId).classList.add('active');
    buttonElement.classList.add('active');
}

// Show loading state
function showLoading(show) {
    const loadingElement = document.getElementById('loadingSpinner');
    if (loadingElement) {
        loadingElement.style.display = show ? 'block' : 'none';
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    // Create toast element if it doesn't exist
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    
    toast.className = `toast toast-${type} show`;
    toast.textContent = message;
    
    // Auto hide after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Placeholder functions for user actions
function saveInlineUserChanges(userId) {
    showToast('User changes saved successfully', 'success');
}

async function adjustUserBalance(userId, action) {
    const amountInput = document.getElementById(`balanceAdjustment-${userId}`);
    const reasonInput = document.getElementById(`adjustmentReason-${userId}`);
    
    if (!amountInput || !reasonInput) {
        showToast('Error: Input fields not found', 'error');
        return;
    }
    
    const amount = parseFloat(amountInput.value);
    const reason = reasonInput.value.trim();
    
    if (!amount || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }
    
    if (!reason) {
        showToast('Please enter a reason for the adjustment', 'error');
        return;
    }
    
    try {
        // Get current user data first
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        const currentBalance = userDoc.exists() ? (userDoc.data().accountBalance || userDoc.data().balance || 0) : 0;
        
        // Calculate new balance
        const newBalance = action === 'add' ? currentBalance + amount : currentBalance - amount;
        
        const batch = db.batch();
        
        // Update users collection with ALL balance fields
        batch.update(userRef, {
            balance: newBalance,
            accountBalance: newBalance,
            walletBalance: newBalance,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            balanceUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastAdminUpdate: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Also update accounts collection if it exists
        const accountRef = db.collection('accounts').doc(userId);
        const accountDoc = await accountRef.get();
        
        if (accountDoc.exists()) {
            batch.update(accountRef, {
                balance: newBalance,
                accountBalance: newBalance,
                walletBalance: newBalance,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                syncedFromUsers: true
            });
        }
        
        // Create transaction record
        const transactionRef = db.collection('transactions').doc();
        batch.set(transactionRef, {
            userId: userId,
            type: action === 'add' ? 'manual_adjustment_add' : 'manual_adjustment_subtract',
            amount: amount,
            status: 'completed',
            description: `Manual balance adjustment: ${reason}`,
            reason: reason,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            adminId: window.currentUser?.uid || 'admin'
        });
        
        await batch.commit();
        
        showToast(`Balance ${action === 'add' ? 'increased' : 'decreased'} by $${amount.toFixed(2)}`, 'success');
        
        // Clear the input fields
        amountInput.value = '';
        reasonInput.value = '';
        
        // Refresh the user details display
        setTimeout(() => {
            toggleUserDetails(userId);
        }, 1000);
        
    } catch (error) {
        console.error('Error adjusting balance:', error);
        showToast('Error adjusting balance: ' + error.message, 'error');
    }
}

function resetUserPassword(userId) {
    showToast('Password reset email sent', 'success');
}

function toggle2FA(userId) {
    showToast('2FA settings updated', 'success');
}
async function editUser(userId) {
    try {
        if (!window.db) {
            showToast('Database connection not available', 'error');
            return;
        }
        
        const userDoc = await window.db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            showToast('User not found', 'error');
            return;
        }
        
        const userData = userDoc.data();
        
        // Create edit modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Edit User: ${userData.email}</h3>
                    <button onclick="closeEditModal()" class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="editUserForm">
                        <div class="form-group">
                            <label>Full Name:</label>
                            <input type="text" id="editFullName" value="${userData.fullName || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>Email:</label>
                            <input type="email" id="editEmail" value="${userData.email || ''}" required>
                        </div>
                        <div class="form-group">
                            <label>Phone:</label>
                            <input type="tel" id="editPhone" value="${userData.phone || ''}">
                        </div>
                        <div class="form-group">
                            <label>Balance ($):</label>
                            <input type="number" id="editBalance" value="${userData.balance || 0}" step="0.01" min="0">
                        </div>
                        <div class="form-group">
                            <label>Status:</label>
                            <select id="editStatus">
                                <option value="active" ${userData.status === 'active' ? 'selected' : ''}>Active</option>
                                <option value="suspended" ${userData.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                                <option value="pending" ${userData.status === 'pending' ? 'selected' : ''}>Pending</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Account Type:</label>
                            <select id="editAccountType">
                                <option value="basic" ${userData.accountType === 'basic' ? 'selected' : ''}>Basic</option>
                                <option value="premium" ${userData.accountType === 'premium' ? 'selected' : ''}>Premium</option>
                                <option value="vip" ${userData.accountType === 'vip' ? 'selected' : ''}>VIP</option>
                            </select>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button onclick="saveUserEdits('${userId}')" class="btn-primary">Save Changes</button>
                    <button onclick="closeEditModal()" class="btn-secondary">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error('Error loading user for edit:', error);
        showToast('Failed to load user data', 'error');
    }
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        return;
    }
    
    try {
        await window.db.collection('users').doc(userId).delete();
        await loadUsers(); // Refresh the user list
        showToast('User deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting user:', error);
        showToast('Failed to delete user', 'error');
    }
}

async function editTransaction(transactionId) {
    showToast('Transaction editing feature coming soon', 'info');
}

function deleteTransaction(transactionId) {
    if (confirm('Are you sure you want to delete this transaction?')) {
        showToast('Transaction deleted successfully', 'success');
    }
}

async function editTrade(tradeId) {
    showToast('Trade editing feature coming soon', 'info');
}

function deleteTrade(tradeId) {
    if (confirm('Are you sure you want to delete this trade?')) {
        showToast('Trade deleted successfully', 'success');
    }
}

// Add these new functions
async function saveUserEdits(userId) {
    try {
        const updatedData = {
            fullName: document.getElementById('editFullName').value.trim(),
            email: document.getElementById('editEmail').value.trim(),
            phone: document.getElementById('editPhone').value.trim(),
            balance: parseFloat(document.getElementById('editBalance').value) || 0,
            status: document.getElementById('editStatus').value,
            accountType: document.getElementById('editAccountType').value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await window.db.collection('users').doc(userId).update(updatedData);
        
        closeEditModal();
        await loadUsers(); // Refresh the user list
        showToast('User updated successfully', 'success');
        
    } catch (error) {
        console.error('Error updating user:', error);
        showToast('Failed to update user', 'error');
    }
}

function closeEditModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
}

// Add modal styles
const modalStyles = `
<style>
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
}

.modal-content {
    background: #16213e;
    border-radius: 10px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
}

.modal-header {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #2a3f5f;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.modal-header h3 {
    color: #e8eaed;
    margin: 0;
}

.close-btn {
    background: none;
    border: none;
    color: #b3c1d1;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-body {
    padding: 1.5rem;
}

.form-group {
    margin-bottom: 1rem;
}

.form-group label {
    display: block;
    color: #b3c1d1;
    margin-bottom: 0.5rem;
    font-weight: 500;
}

.form-group input,
.form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #2a3f5f;
    border-radius: 5px;
    background: #0f1419;
    color: #e8eaed;
    font-size: 1rem;
}

.form-group input:focus,
.form-group select:focus {
    outline: none;
    border-color: #00d4ff;
}

.modal-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid #2a3f5f;
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
}

.btn-secondary {
    background: #6c757d;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 5px;
    cursor: pointer;
    font-weight: 600;
}

.btn-secondary:hover {
    background: #5a6268;
}
</style>
`;

if (!document.querySelector('#modal-styles')) {
    const styleElement = document.createElement('div');
    styleElement.id = 'modal-styles';
    styleElement.innerHTML = modalStyles;
    document.head.appendChild(styleElement);
}

// Make functions globally available
window.toggleUserDetails = toggleUserDetails;
window.showTab = showTab;
window.saveInlineUserChanges = saveInlineUserChanges;
window.adjustUserBalance = adjustUserBalance;
window.resetUserPassword = resetUserPassword;
window.toggle2FA = toggle2FA;
window.editUser = editUser;
window.deleteUser = deleteUser;
window.editTransaction = editTransaction;
window.deleteTransaction = deleteTransaction;
window.editTrade = editTrade;
window.deleteTrade = deleteTrade;
window.changePage = changePage;
window.saveUserEdits = saveUserEdits;
window.closeEditModal = closeEditModal;
window.saveUserProfile = saveUserProfile;
window.editUserProfile = editUserProfile;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeUserManagement);


// Enhanced user creation with full profile
async function createNewUser() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Create New User</h3>
                <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <form id="createUserForm" class="modal-form">
                <div class="form-section">
                    <h4>Personal Information</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label>First Name *</label>
                            <input type="text" name="firstName" required>
                        </div>
                        <div class="form-group">
                            <label>Last Name *</label>
                            <input type="text" name="lastName" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Email *</label>
                            <input type="email" name="email" required>
                        </div>
                        <div class="form-group">
                            <label>Phone</label>
                            <input type="tel" name="phone">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Country</label>
                            <input type="text" name="country">
                        </div>
                        <div class="form-group">
                            <label>Account Type</label>
                            <select name="accountType">
                                <option value="Standard">Standard</option>
                                <option value="Premium">Premium</option>
                                <option value="VIP">VIP</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="form-section">
                    <h4>Account Settings</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Initial Balance</label>
                            <input type="number" name="balance" value="0" step="0.01">
                        </div>
                        <div class="form-group">
                            <label>Status</label>
                            <select name="status">
                                <option value="active">Active</option>
                                <option value="suspended">Suspended</option>
                                <option value="pending">Pending</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" onclick="this.closest('.modal-overlay').remove()" class="btn-secondary">Cancel</button>
                    <button type="submit" class="btn-primary">Create User</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Handle form submission
    document.getElementById('createUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const userData = Object.fromEntries(formData.entries());
        
        try {
            // Create user in Firebase Auth (you'll need to implement this server-side)
            const userDoc = {
                firstName: userData.firstName,
                lastName: userData.lastName,
                email: userData.email,
                phone: userData.phone || '',
                country: userData.country || '',
                accountType: userData.accountType,
                balance: parseFloat(userData.balance) || 0,
                status: userData.status,
                emailVerified: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // Add to Firestore
            await db.collection('users').add(userDoc);
            
            showToast('User created successfully', 'success');
            modal.remove();
            await loadUsers();
            
        } catch (error) {
            console.error('Error creating user:', error);
            showToast('Error creating user: ' + error.message, 'error');
        }
    });
}

// Enhanced user editing with full profile access
async function editUserProfile(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            showToast('User not found', 'error');
            return;
        }
        
        const userData = userDoc.data();
        
        // Load user's transaction and trade history
        const [transactions, trades] = await Promise.all([
            db.collection('transactions').where('userId', '==', userId).orderBy('timestamp', 'desc').get(),
            db.collection('trades').where('userId', '==', userId).orderBy('timestamp', 'desc').get()
        ]);
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay large-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Edit User Profile - ${userData.firstName} ${userData.lastName}</h3>
                    <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                </div>
                <div class="modal-tabs">
                    <button class="tab-btn active" onclick="showModalTab('modal-profile-tab', this)">Profile</button>
                    <button class="tab-btn" onclick="showModalTab('modal-financial-tab', this)">Financial</button>
                    <button class="tab-btn" onclick="showModalTab('modal-transactions-tab', this)">Transactions</button>
                    <button class="tab-btn" onclick="showModalTab('modal-trades-tab', this)">Trades</button>
                </div>
                <div class="modal-body">
                    <!-- Profile Tab -->
                    <div id="modal-profile-tab" class="tab-content active">
                        <form id="editUserForm">
                            <div class="form-section">
                                <h4>Personal Information</h4>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label>First Name</label>
                                        <input type="text" name="firstName" value="${userData.firstName || ''}">
                                    </div>
                                    <div class="form-group">
                                        <label>Last Name</label>
                                        <input type="text" name="lastName" value="${userData.lastName || ''}">
                                    </div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label>Email</label>
                                        <input type="email" name="email" value="${userData.email || ''}" readonly>
                                    </div>
                                    <div class="form-group">
                                        <label>Phone</label>
                                        <input type="tel" name="phone" value="${userData.phone || ''}">
                                    </div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label>Country</label>
                                        <input type="text" name="country" value="${userData.country || ''}">
                                    </div>
                                    <div class="form-group">
                                        <label>Status</label>
                                        <select name="status">
                                            <option value="active" ${userData.status === 'active' ? 'selected' : ''}>Active</option>
                                            <option value="suspended" ${userData.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                                            <option value="pending" ${userData.status === 'pending' ? 'selected' : ''}>Pending</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                    
                    <!-- Financial Tab -->
                    <div id="modal-financial-tab" class="tab-content">
                        <div class="form-section">
                            <h4>Account Balance Management</h4>
                            <div class="balance-display">
                                <div class="current-balance">
                                    <label>Current Balance:</label>
                                    <span class="balance-amount">$${(userData.balance || 0).toLocaleString()}</span>
                                </div>
                            </div>
                            <div class="balance-actions">
                                <div class="form-group">
                                    <label>Add Deposit</label>
                                    <div class="input-group">
                                        <input type="number" id="depositAmount" placeholder="Amount" step="0.01">
                                        <button type="button" onclick="addUserDeposit('${userId}')" class="btn-success">Add Deposit</button>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label>Add Received Profit</label>
                                    <div class="input-group">
                                        <input type="number" id="profitAmount" placeholder="Amount" step="0.01">
                                        <button type="button" onclick="addUserProfit('${userId}')" class="btn-info">Add Profit</button>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label>Adjust Balance</label>
                                    <div class="input-group">
                                        <input type="number" id="adjustAmount" placeholder="Amount (+ or -)" step="0.01">
                                        <button type="button" onclick="adjustUserBalance('${userId}')" class="btn-warning">Adjust</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Transactions Tab -->
                    <div id="modal-transactions-tab" class="tab-content">
                        <div class="transactions-list">
                            ${transactions.empty ? '<p>No transactions found</p>' : transactions.docs.map(doc => {
                                const tx = doc.data();
                                return `
                                    <div class="transaction-item">
                                        <div class="transaction-header">
                                            <span class="transaction-type type-${tx.type}">${tx.type}</span>
                                            <span class="transaction-amount">$${tx.amount}</span>
                                            <span class="transaction-date">${new Date(tx.timestamp?.seconds * 1000).toLocaleDateString()}</span>
                                        </div>
                                        <div class="transaction-details">
                                            <p><strong>Status:</strong> ${tx.status}</p>
                                            ${tx.description ? `<p><strong>Description:</strong> ${tx.description}</p>` : ''}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    
                    <!-- Trades Tab -->
                    <div id="modal-trades-tab" class="tab-content\>
                        <div class="trades-list">
                            ${trades.empty ? '<p>No trades found</p>' : trades.docs.map(doc => {
                                const trade = doc.data();
                                return `
                                    <div class="trade-item">
                                        <div class="trade-header">
                                            <span class="trade-symbol">${trade.symbol}</span>
                                            <span class="trade-status status-${trade.status}">${trade.status}</span>
                                            <span class="trade-pnl ${trade.profit >= 0 ? 'positive' : 'negative'}">$${trade.profit}</span>
                                        </div>
                                        <div class="trade-details">
                                            <p><strong>Type:</strong> ${trade.type} | <strong>Volume:</strong> ${trade.volume}</p>
                                            <p><strong>Open:</strong> ${trade.openPrice} | <strong>Close:</strong> ${trade.closePrice || 'N/A'}</p>
                                            <p><strong>Date:</strong> ${new Date(trade.timestamp?.seconds * 1000).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" onclick="this.closest('.modal-overlay').remove()" class="btn-secondary">Close</button>
                    <button type="button" onclick="saveUserProfile('${userId}')" class="btn-primary">Save Changes</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error('Error loading user profile:', error);
        showToast('Error loading user profile', 'error');
    }
}

// Add deposit function with automatic balance update
window.addUserDeposit = async function(userId) {
    const amount = parseFloat(document.getElementById('depositAmount').value);
    if (!amount || amount <= 0) {
        showToast('Please enter a valid deposit amount', 'error');
        return;
    }
    
    try {
        const batch = db.batch();
        
        // Add transaction record
        const transactionRef = db.collection('transactions').doc();
        batch.set(transactionRef, {
            uid: userId, // Changed from 'userId' to 'uid' for consistency
            type: 'deposit',
            amount: amount,
            status: 'completed',
            description: 'Admin deposit',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            adminId: window.currentUser?.uid || 'admin'
        });
        
        // Update user balance AND totalDeposits
        const userRef = db.collection('users').doc(userId);
        batch.update(userRef, {
            balance: firebase.firestore.FieldValue.increment(amount),
            accountBalance: firebase.firestore.FieldValue.increment(amount),
            walletBalance: firebase.firestore.FieldValue.increment(amount),
            totalDeposits: firebase.firestore.FieldValue.increment(amount),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            balanceUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastAdminUpdate: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update accounts collection for consistency
        const accountRef = db.collection('accounts').doc(userId);
        batch.set(accountRef, {
            balance: firebase.firestore.FieldValue.increment(amount),
            accountBalance: firebase.firestore.FieldValue.increment(amount),
            walletBalance: firebase.firestore.FieldValue.increment(amount),
            totalDeposits: firebase.firestore.FieldValue.increment(amount),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        await batch.commit();
        
        showToast(`Deposit of $${amount} added successfully`, 'success');
        document.getElementById('depositAmount').value = '';
        
        // Refresh the modal content
        setTimeout(() => {
            document.querySelector('.modal-overlay .close-btn').click();
            editUserProfile(userId);
        }, 1000);
        
    } catch (error) {
        console.error('Error adding deposit:', error);
        showToast('Error adding deposit', 'error');
    }
};

// Add profit function with automatic balance update
window.addUserProfit = async function(userId) {
    const amount = parseFloat(document.getElementById('profitAmount').value);
    if (!amount || amount <= 0) {
        showToast('Please enter a valid profit amount', 'error');
        return;
    }
    
    try {
        const batch = db.batch();
        
        // Add transaction record with 'uid' field
        const transactionRef = db.collection('transactions').doc();
        batch.set(transactionRef, {
            uid: userId, // Changed from 'userId' to 'uid'
            type: 'profit',
            amount: amount,
            status: 'completed',
            description: 'Received profit',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            adminId: window.currentUser?.uid || 'admin'
        });
        
        // Update user balance, accountBalance, and profit tracking
        const userRef = db.collection('users').doc(userId);
        batch.update(userRef, {
            balance: firebase.firestore.FieldValue.increment(amount),
            accountBalance: firebase.firestore.FieldValue.increment(amount),
            walletBalance: firebase.firestore.FieldValue.increment(amount),
            totalProfits: firebase.firestore.FieldValue.increment(amount),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            balanceUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastAdminUpdate: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update accounts collection for consistency
        const accountRef = db.collection('accounts').doc(userId);
        batch.set(accountRef, {
            balance: firebase.firestore.FieldValue.increment(amount),
            accountBalance: firebase.firestore.FieldValue.increment(amount),
            walletBalance: firebase.firestore.FieldValue.increment(amount),
            totalProfits: firebase.firestore.FieldValue.increment(amount),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        await batch.commit();
        
        showToast(`Profit of $${amount} added successfully`, 'success');
        document.getElementById('profitAmount').value = '';
        
        // Refresh the modal content
        setTimeout(() => {
            document.querySelector('.modal-overlay .close-btn').click();
            editUserProfile(userId);
        }, 1000);
        
    } catch (error) {
        console.error('Error adding profit:', error);
        showToast('Error adding profit', 'error');
    }
};

// Modal tab switching function
window.showModalTab = function(tabId, button) {
    // Get the modal container to limit scope
    const modal = button.closest('.modal-overlay');
    if (!modal) return;
    
    // Hide all tab contents within this modal only
    modal.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all tab buttons within this modal only
    modal.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab and mark button as active
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.add('active');
        button.classList.add('active');
    }
};

// Save user profile changes
async function saveUserProfile(userId) {
    try {
        const form = document.getElementById('editUserForm');
        const formData = new FormData(form);
        const updates = Object.fromEntries(formData.entries());
        
        updates.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        
        await db.collection('users').doc(userId).update(updates);
        showToast('User profile updated successfully', 'success');
        
        // Close the modal
        document.querySelector('.modal-overlay .close-btn').click();
        
        // Refresh the user list
        await loadUsers();
        
    } catch (error) {
        console.error('Error saving user profile:', error);
        showToast('Error saving user profile: ' + error.message, 'error');
    }
}

// Update user financial data (profits and deposits)
window.updateUserFinancials = async function(userId) {
    const profitsInput = document.getElementById(`edit-profits-${userId}`);
    const depositsInput = document.getElementById(`edit-deposits-${userId}`);
    
    if (!profitsInput || !depositsInput) {
        showToast('Error: Financial input fields not found', 'error');
        return;
    }
    
    const newProfits = parseFloat(profitsInput.value) || 0;
    const newDeposits = parseFloat(depositsInput.value) || 0;
    
    if (newProfits < 0 || newDeposits < 0) {
        showToast('Financial values cannot be negative', 'error');
        return;
    }
    
    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
            showToast('User not found', 'error');
            return;
        }
        
        const currentData = userDoc.data();
        const oldProfits = currentData.totalProfits || 0;
        const oldDeposits = currentData.totalDeposits || 0;
        
        // Calculate balance adjustment
        const profitsDiff = newProfits - oldProfits;
        const depositsDiff = newDeposits - oldDeposits;
        const totalBalanceChange = profitsDiff + depositsDiff;
        
        // Update user data
        await userRef.update({
            totalProfits: newProfits,
            totalDeposits: newDeposits,
            balance: firebase.firestore.FieldValue.increment(totalBalanceChange),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Create transaction records for the changes
        const batch = db.batch();
        
        if (profitsDiff !== 0) {
            const profitTransactionRef = db.collection('transactions').doc();
            batch.set(profitTransactionRef, {
                userId: userId,
                type: profitsDiff > 0 ? 'profit_adjustment_add' : 'profit_adjustment_subtract',
                amount: Math.abs(profitsDiff),
                status: 'completed',
                description: `Admin adjustment: Profits ${profitsDiff > 0 ? 'increased' : 'decreased'} by $${Math.abs(profitsDiff).toFixed(2)}`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                adminId: window.currentUser?.uid || 'admin'
            });
        }
        
        if (depositsDiff !== 0) {
            const depositTransactionRef = db.collection('transactions').doc();
            batch.set(depositTransactionRef, {
                userId: userId,
                type: depositsDiff > 0 ? 'deposit_adjustment_add' : 'deposit_adjustment_subtract',
                amount: Math.abs(depositsDiff),
                status: 'completed',
                description: `Admin adjustment: Deposits ${depositsDiff > 0 ? 'increased' : 'decreased'} by $${Math.abs(depositsDiff).toFixed(2)}`,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                adminId: window.currentUser?.uid || 'admin'
            });
        }
        
        await batch.commit();
        
        showToast('Financial data updated successfully', 'success');
        
        // Refresh the user details display
        setTimeout(() => {
            toggleUserDetails(userId);
        }, 1000);
        
    } catch (error) {
        console.error('Error updating financial data:', error);
        showToast('Error updating financial data: ' + error.message, 'error');
    }
};

// Calculate and update user balance based on transactions
window.calculateBalance = async function(userId) {
    try {
        // Get all user transactions
        const transactionsSnapshot = await db.collection('transactions')
            .where('userId', '==', userId)
            .where('status', '==', 'completed')
            .get();
        
        let totalDeposits = 0;
        let totalProfits = 0;
        let totalWithdrawals = 0;
        
        transactionsSnapshot.forEach(doc => {
            const transaction = doc.data();
            const amount = transaction.amount || 0;
            
            switch (transaction.type) {
                case 'deposit':
                case 'deposit_adjustment_add':
                    totalDeposits += amount;
                    break;
                case 'profit':
                case 'profit_adjustment_add':
                    totalProfits += amount;
                    break;
                case 'withdrawal':
                    totalWithdrawals += amount;
                    break;
                case 'deposit_adjustment_subtract':
                    totalDeposits -= amount;
                    break;
                case 'profit_adjustment_subtract':
                    totalProfits -= amount;
                    break;
            }
        });
        
        // Calculate new balance
        const calculatedBalance = totalDeposits + totalProfits - totalWithdrawals;
        
        // Update user document
        const userRef = db.collection('users').doc(userId);
        await userRef.update({
            balance: Math.max(0, calculatedBalance), // Ensure balance doesn't go negative
            totalDeposits: Math.max(0, totalDeposits),
            totalProfits: Math.max(0, totalProfits),
            calculatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToast(`Balance recalculated successfully. New balance: $${calculatedBalance.toFixed(2)}`, 'success');
        
        // Refresh the user details display
        setTimeout(() => {
            toggleUserDetails(userId);
        }, 1000);
        
    } catch (error) {
        console.error('Error calculating balance:', error);
        showToast('Error calculating balance: ' + error.message, 'error');
    }
};