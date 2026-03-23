// Simple Balance Fix - Safe version that won't crash the dashboard

(function() {
    'use strict';
    
    console.log('Simple Balance Fix: Starting...');
    
    let currentUserId = null;
    let correctBalance = null;
    
    // Get user ID from Firebase Auth
    function getUserId() {
        if (window.firebase && firebase.auth && firebase.auth().currentUser) {
            return firebase.auth().currentUser.uid;
        }
        return null;
    }
    
    // Get correct balance from Firebase
    function fetchCorrectBalance() {
        const userId = getUserId();
        if (!userId) {
            console.log('Simple Balance Fix: No user ID found, retrying...');
            setTimeout(fetchCorrectBalance, 2000);
            return;
        }
        
        currentUserId = userId;
        
        if (window.firebase && firebase.firestore) {
            const db = firebase.firestore();
            
            db.collection('users').doc(userId).get()
                .then((doc) => {
                    if (doc.exists) {
                        const userData = doc.data();
                        correctBalance = userData.walletBalance || 0;
                        
                        console.log('Simple Balance Fix: Fetched correct balance:', correctBalance);
                        fixBalances();
                        
                        // Set up real-time listener for balance changes
                        setupBalanceListener(userId);
                    } else {
                        console.log('Simple Balance Fix: User document not found');
                    }
                })
                .catch((error) => {
                    console.log('Simple Balance Fix: Error fetching balance:', error);
                    // Fallback to manual balance fixing
                    setTimeout(fetchCorrectBalance, 5000);
                });
        } else {
            console.log('Simple Balance Fix: Firebase not available');
            setTimeout(fetchCorrectBalance, 2000);
        }
    }
    
    // Set up real-time listener for balance changes
    function setupBalanceListener(userId) {
        if (window.firebase && firebase.firestore) {
            const db = firebase.firestore();
            
            db.collection('users').doc(userId).onSnapshot((doc) => {
                if (doc.exists) {
                    const userData = doc.data();
                    const newBalance = userData.walletBalance || 0;
                    
                    if (newBalance !== correctBalance) {
                        console.log('Simple Balance Fix: Balance changed from', correctBalance, 'to', newBalance);
                        correctBalance = newBalance;
                        fixBalances();
                    }
                }
            }, (error) => {
                console.log('Simple Balance Fix: Listener error:', error);
            });
            
            console.log('Simple Balance Fix: Set up real-time balance listener');
        }
    }
    
    // Simple function to replace wrong balances
    function fixBalances() {
        if (!correctBalance) {
            console.log('Simple Balance Fix: No correct balance available yet');
            return;
        }
        
        try {
            const formattedBalance = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2
            }).format(correctBalance);
            
            const plainBalance = new Intl.NumberFormat('en-US', {
                minimumFractionDigits: 2
            }).format(correctBalance);
            
            // Find and replace balance amounts
            const elements = document.querySelectorAll('*');
            let fixedCount = 0;
            
            elements.forEach(element => {
                if (element.children.length === 0) { // Only text nodes
                    let text = element.textContent;
                    let originalText = text;
                    
                    // Replace any balance that's not the correct one
                    // Common wrong patterns
                    const wrongPatterns = [
                        /\$?[0-9]{1,3}(,[0-9]{3})*\.[0-9]{2}/g, // Any currency amount
                        /[0-9]{1,3}(,[0-9]{3})*\.[0-9]{2}/g     // Any number with decimals
                    ];
                    
                    wrongPatterns.forEach(pattern => {
                        const matches = text.match(pattern);
                        if (matches) {
                            matches.forEach(match => {
                                // Only replace if it's not already the correct balance
                                const numericValue = parseFloat(match.replace(/[$,]/g, ''));
                                if (Math.abs(numericValue - correctBalance) > 0.01) {
                                    // This is a wrong balance, replace it
                                    if (match.includes('$')) {
                                        text = text.replace(match, formattedBalance);
                                    } else {
                                        text = text.replace(match, plainBalance);
                                    }
                                }
                            });
                        }
                    });
                    
                    // Update element if text changed
                    if (text !== originalText) {
                        element.textContent = text;
                        fixedCount++;
                        console.log('Simple Balance Fix: Updated element:', element.tagName, 'from', originalText, 'to', text);
                    }
                }
            });
            
            if (fixedCount > 0) {
                console.log(`Simple Balance Fix: Fixed ${fixedCount} balance displays to ${formattedBalance}`);
            }
        } catch (error) {
            console.log('Simple Balance Fix: Error (non-critical):', error.message);
        }
    }
    
    // Override balance calculation functions
    function overrideBalanceCalculations() {
        // Override updateAccountSummary if it exists
        if (window.updateAccountSummary) {
            const original = window.updateAccountSummary;
            window.updateAccountSummary = function(data) {
                console.log('Simple Balance Fix: Intercepting updateAccountSummary');
                if (data && correctBalance !== null) {
                    // Use the correct balance from database
                    data.walletBalance = correctBalance;
                    console.log('Simple Balance Fix: Using correct balance:', correctBalance);
                }
                return original.call(this, data);
            };
            console.log('Simple Balance Fix: Overrode updateAccountSummary');
        }
        
        // Override calculateBalance if it exists
        if (window.calculateBalance) {
            const original = window.calculateBalance;
            window.calculateBalance = function() {
                console.log('Simple Balance Fix: Intercepting calculateBalance');
                return correctBalance || original.apply(this, arguments);
            };
            console.log('Simple Balance Fix: Overrode calculateBalance');
        }
    }
    
    // Run the fix safely
    function safeRun() {
        // Wait for Firebase to be available
        if (!window.firebase) {
            console.log('Simple Balance Fix: Waiting for Firebase...');
            setTimeout(safeRun, 1000);
            return;
        }
        
        // Fetch the correct balance
        fetchCorrectBalance();
        
        // Override balance calculation functions
        setTimeout(overrideBalanceCalculations, 2000);
        
        // Run periodic fixes
        setInterval(() => {
            if (correctBalance !== null) {
                fixBalances();
            }
        }, 10000);
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', safeRun);
    } else {
        safeRun();
    }
    
    // Global functions for manual control
    window.fixBalance = fixBalances;
    window.refreshBalance = fetchCorrectBalance;
    
    // Debug function
    window.debugBalance = function() {
        console.log('=== BALANCE DEBUG ===');
        console.log('User ID:', currentUserId);
        console.log('Correct Balance:', correctBalance);
        console.log('Firebase available:', !!window.firebase);
        console.log('Auth available:', !!(window.firebase && firebase.auth));
        console.log('Current user:', firebase.auth().currentUser);
        
        // Show all balance-related elements
        document.querySelectorAll('*').forEach(el => {
            const text = el.textContent;
            if (text.match(/\$?[0-9]{1,3}(,[0-9]{3})*\.[0-9]{2}/) && el.children.length === 0) {
                console.log('Balance element:', el.tagName, el.className || el.id, ':', text);
            }
        });
        
        fetchCorrectBalance();
    };
    
    console.log('Simple Balance Fix: Loaded successfully');
})();