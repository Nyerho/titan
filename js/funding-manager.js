import { doc, getDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './firebase-config.js';

class FundingManager {
    constructor() {
        this.apiKeys = {
            stripe: this.getApiKey('STRIPE_PUBLISHABLE_KEY'),
            coinbase: this.getApiKey('COINBASE_API_KEY'),
            paypal: this.getApiKey('PAYPAL_CLIENT_ID'),
            sendgrid: this.getApiKey('SENDGRID_API_KEY')
        };
        
        this.supportedMethods = {
            stripe: {
                name: 'Credit/Debit Card',
                icon: 'fas fa-credit-card',
                fees: '2.9% + $0.30',
                processingTime: 'Instant',
                minAmount: 10,
                maxAmount: 50000,
                currencies: ['USD', 'EUR', 'GBP', 'CAD']
            },
            paypal: {
                name: 'PayPal',
                icon: 'fab fa-paypal',
                fees: '3.49% + $0.49',
                processingTime: 'Instant',
                minAmount: 5,
                maxAmount: 10000,
                currencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD']
            },
            crypto: {
                name: 'Cryptocurrency',
                icon: 'fab fa-bitcoin',
                fees: 'Network fees only',
                processingTime: '10-60 minutes',
                minAmount: 25,
                maxAmount: 100000,
                currencies: ['BTC', 'ETH', 'LTC', 'XRP', 'SOL', 'USDC', 'USDC-SOL', 'USDT']
            },
            wire: {
                name: 'Bank Wire Transfer',
                icon: 'fas fa-university',
                fees: '$25 flat fee',
                processingTime: '1-3 business days',
                minAmount: 1000,
                maxAmount: 1000000,
                currencies: ['USD', 'EUR', 'GBP']
            }
        };
        
        this.transactions = [];
        this.cryptoDepositAddressesCache = null;
        this.cryptoDepositAddressesCacheAt = 0;
        this.cryptoDepositAddressesUnsub = null;
        this.cryptoDepositAddressesLastError = null;
        this.loadStripe();
        this.loadPayPal();
        this.startCryptoDepositAddressesListener();
    }

    getApiKey(keyName) {
        try {
            if (typeof window !== 'undefined' && window.API_CONFIG && typeof window.API_CONFIG.getApiKey === 'function') {
                return window.API_CONFIG.getApiKey(keyName);
            }
        } catch (e) {}
        return null;
    }

    async loadStripe() {
        if (!this.apiKeys.stripe) return;
        if (!window.Stripe) {
            const script = document.createElement('script');
            script.src = 'https://js.stripe.com/v3/';
            document.head.appendChild(script);
            
            await new Promise(resolve => {
                script.onload = resolve;
            });
        }
        this.stripe = Stripe(this.apiKeys.stripe);
    }

    async loadPayPal() {
        if (!this.apiKeys.paypal) return;
        if (!window.paypal) {
            const script = document.createElement('script');
            script.src = `https://www.paypal.com/sdk/js?client-id=${this.apiKeys.paypal}&currency=USD`;
            document.head.appendChild(script);
        }
    }

    async initializePayment(method, amount, currency = 'USD') {
        const transaction = {
            id: this.generateTransactionId(),
            method,
            amount,
            currency,
            status: 'pending',
            timestamp: new Date().toISOString(),
            user: window.authManager?.getCurrentUser()?.email
        };
        
        this.transactions.push(transaction);
        
        try {
            let result;
            switch(method) {
                case 'stripe':
                    result = await this.processStripePayment(transaction);
                    break;
                case 'paypal':
                    result = await this.processPayPalPayment(transaction);
                    break;
                case 'crypto':
                    result = await this.processCryptoPayment(transaction);
                    break;
                case 'wire':
                    result = await this.processWireTransfer(transaction);
                    break;
                default:
                    throw new Error('Unsupported payment method');
            }
            
            transaction.status = 'completed';
            transaction.result = result;
            return transaction;
            
        } catch (error) {
            transaction.status = 'failed';
            transaction.error = error.message;
            throw error;
        }
    }

    async processStripePayment(transaction) {
        const { amount, currency } = transaction;
        
        // Simulate payment processing for demo purposes
        // In production, this would integrate with your backend API
        try {
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Simulate successful payment
            const simulatedResult = {
                payment_intent_id: `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                status: 'succeeded',
                amount: amount * 100, // Stripe uses cents
                currency: currency.toLowerCase(),
                created: Math.floor(Date.now() / 1000)
            };
            
            // Update user balance in Firebase
            if (window.authManager && window.authManager.getCurrentUser()) {
                const user = window.authManager.getCurrentUser();
                const db = firebase.firestore();
                
                // Add transaction record
                await db.collection('transactions').add({
                    userId: user.uid,
                    type: 'deposit',
                    method: 'stripe',
                    amount: amount,
                    currency: currency,
                    status: 'completed',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    transactionId: simulatedResult.payment_intent_id
                });
                
                // Update user balance
                const userRef = db.collection('users').doc(user.uid);
                await userRef.set({
                    balance: firebase.firestore.FieldValue.increment(amount),
                    accountBalance: firebase.firestore.FieldValue.increment(amount),
                    walletBalance: firebase.firestore.FieldValue.increment(amount),
                    totalDeposits: firebase.firestore.FieldValue.increment(amount),
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                    balanceUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            
            return simulatedResult;
            
        } catch (error) {
            throw new Error('Payment processing failed: ' + error.message);
        }
    }

    async processPayPalPayment(transaction) {
        const { amount, currency } = transaction;
        
        // Simulate PayPal payment for demo purposes
        try {
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const simulatedResult = {
                order_id: `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                status: 'COMPLETED',
                amount: amount,
                currency: currency,
                payer: {
                    email_address: window.authManager?.getCurrentUser()?.email || 'demo@example.com'
                }
            };
            
            // Update user balance in Firebase
            if (window.authManager && window.authManager.getCurrentUser()) {
                const user = window.authManager.getCurrentUser();
                const db = firebase.firestore();
                
                await db.collection('transactions').add({
                    userId: user.uid,
                    type: 'deposit',
                    method: 'paypal',
                    amount: amount,
                    currency: currency,
                    status: 'completed',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    transactionId: simulatedResult.order_id
                });
                
                const userRef = db.collection('users').doc(user.uid);
                await userRef.set({
                    balance: firebase.firestore.FieldValue.increment(amount),
                    accountBalance: firebase.firestore.FieldValue.increment(amount),
                    walletBalance: firebase.firestore.FieldValue.increment(amount),
                    totalDeposits: firebase.firestore.FieldValue.increment(amount),
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                    balanceUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            
            return simulatedResult;
            
        } catch (error) {
            throw new Error('PayPal payment failed: ' + error.message);
        }
    }

    async createPayPalButtons(amount, currency) {
        return new Promise((resolve, reject) => {
            paypal.Buttons({
                createOrder: (data, actions) => {
                    return actions.order.create({
                        purchase_units: [{
                            amount: {
                                value: amount.toString(),
                                currency_code: currency
                            }
                        }]
                    });
                },
                onApprove: async (data, actions) => {
                    const order = await actions.order.capture();
                    resolve({
                        order_id: order.id,
                        status: order.status,
                        payer: order.payer
                    });
                },
                onError: (err) => {
                    reject(new Error('PayPal payment failed: ' + err));
                }
            }).render('#paypal-button-container');
        });
    }

    async processCryptoPayment(transaction) {
        const { amount, currency } = transaction;
        
        const walletAddress = await this.generateCryptoAddress(currency);
        if (!walletAddress || !String(walletAddress).trim()) {
            const err = this.cryptoDepositAddressesLastError;
            const msg = String(err?.message || '');
            const denied = err?.code === 'permission-denied' || msg.includes('Missing or insufficient permissions');
            if (denied) {
                throw new Error('Unable to load deposit address (permission denied). Please sign out/in or contact support.');
            }
            throw new Error(`Deposit address not configured for ${currency}`);
        }
        
        // Use specific QR code images for each cryptocurrency
        const qrCodeImages = {
            'BTC': 'assets/images/btc.jpg',
            'ETH': 'assets/images/eth.jpg',
            'LTC': 'assets/images/ltc.jpg',
            'XRP': 'assets/images/XRP.jpg',
            'SOL': 'assets/images/sol.jpg',
            'USDC': 'assets/images/usdceth.jpg', // ETH Network
            'USDC-SOL': 'assets/images/usdcsol.jpg', // SOL Network
            'USDT': 'assets/images/usdt.jpg'
        };
        
        const qrCodeUrl = qrCodeImages[currency] || qrCodeImages['BTC'];
        
        const instructions = {
            address: walletAddress,
            amount: amount,
            currency: currency,
            qr_code: qrCodeUrl,
            network_fee: await this.estimateNetworkFee(currency),
            confirmation_time: '10-60 minutes'
        };
        
        return instructions;
    }

    // Add new method for handling user payment confirmation
    async confirmCryptoPayment(transactionData) {
        try {
            const user = window.authManager?.getCurrentUser();
            if (!user) {
                throw new Error('User not authenticated');
            }

            // Import Firebase functions
            const { db } = await import('./firebase-config.js');
            const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

            // Create pending deposit record
            const pendingDeposit = {
                userId: user.uid,
                userEmail: user.email,
                type: 'crypto_deposit',
                method: 'crypto',
                currency: transactionData.currency,
                amount: transactionData.amount,
                address: transactionData.address,
                status: 'pending_confirmation',
                timestamp: serverTimestamp(),
                createdAt: serverTimestamp(),
                description: `Crypto deposit - ${transactionData.currency} - User confirmed payment sent`,
                transactionId: this.generateTransactionId()
            };

            // Add to pending_deposits collection
            const docRef = await addDoc(collection(db, 'pending_deposits'), pendingDeposit);
            
            console.log('Pending deposit created:', docRef.id);
            return {
                success: true,
                depositId: docRef.id,
                message: 'Payment confirmation received. Your deposit is now pending admin approval.'
            };

        } catch (error) {
            console.error('Error confirming crypto payment:', error);
            throw new Error('Failed to confirm payment: ' + error.message);
        }
    }

    async processWireTransfer(transaction) {
        const { amount, currency } = transaction;
        
        // Generate wire transfer instructions
        const wireInstructions = {
            bank_name: 'TitanTrades Bank',
            account_name: 'TitanTrades Ltd',
            account_number: '1234567890',
            routing_number: '021000021',
            swift_code: 'CTHBUSXX',
            reference: `TT-${transaction.id}`,
            amount: amount,
            currency: currency,
            processing_fee: 25,
            estimated_arrival: '1-3 business days'
        };
        
        return wireInstructions;
    }

    async generateCryptoAddress(currency) {
        const requested = (currency || 'BTC').toString();

        try {
            const now = Date.now();

            if (!this.cryptoDepositAddressesCache && db) {
                const snap = await getDoc(doc(db, 'admin', 'crypto-addresses'));
                if (snap.exists()) {
                    const data = snap.data() || {};
                    if (data.addresses && typeof data.addresses === 'object') {
                        this.cryptoDepositAddressesCache = data.addresses;
                        this.cryptoDepositAddressesCacheAt = now;
                        this.cryptoDepositAddressesLastError = null;
                        this.emitCryptoDepositAddressesUpdated();
                    }
                }
            }

            const addresses = this.cryptoDepositAddressesCache || {};
            const configured = addresses[requested] || addresses[requested.toUpperCase?.() || requested];
            if (configured) return configured;
        } catch (e) {
            this.cryptoDepositAddressesLastError = e;
        }

        return '';
    }

    startCryptoDepositAddressesListener() {
        try {
            if (!db || typeof onSnapshot !== 'function') return;
            if (this.cryptoDepositAddressesUnsub) return;

            const ref = doc(db, 'admin', 'crypto-addresses');
            this.cryptoDepositAddressesUnsub = onSnapshot(ref, (snap) => {
                if (!snap.exists()) return;
                const data = snap.data() || {};
                if (data.addresses && typeof data.addresses === 'object') {
                    this.cryptoDepositAddressesCache = data.addresses;
                    this.cryptoDepositAddressesCacheAt = Date.now();
                    this.cryptoDepositAddressesLastError = null;
                    this.emitCryptoDepositAddressesUpdated();
                }
            }, (err) => {
                this.cryptoDepositAddressesLastError = err;
            });
        } catch (e) {}
    }

    emitCryptoDepositAddressesUpdated() {
        try {
            if (typeof window === 'undefined') return;
            if (!this.cryptoDepositAddressesCache) return;
            window.dispatchEvent(new CustomEvent('tt:cryptoAddressesUpdated', {
                detail: { addresses: this.cryptoDepositAddressesCache }
            }));
        } catch (e) {}
    }

    async estimateNetworkFee(currency) {
        const fees = {
            'BTC': '$2-15',
            'ETH': '$5-25',
            'LTC': '$0.05-0.50',
            'XRP': '$0.01-0.10',
            'SOL': '$0.01-0.05',
            'USDC': '$5-25',
            'USDC-SOL': '$0.01-0.05',
            'USDT': '$5-25'
        };
        return fees[currency] || '$5-25';
    }

    generateTransactionId() {
        return 'TXN-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    getTransactionHistory() {
        return this.transactions.filter(tx => 
            tx.user === window.authManager?.getCurrentUser()?.email
        );
    }

    validateAmount(method, amount, currency) {
        const methodConfig = this.supportedMethods[method];
        if (!methodConfig) {
            throw new Error('Invalid payment method');
        }
        
        if (amount < methodConfig.minAmount) {
            throw new Error(`Minimum amount for ${methodConfig.name} is ${methodConfig.minAmount} ${currency}`);
        }
        
        if (amount > methodConfig.maxAmount) {
            throw new Error(`Maximum amount for ${methodConfig.name} is ${methodConfig.maxAmount} ${currency}`);
        }
        
        if (!methodConfig.currencies.includes(currency)) {
            throw new Error(`${currency} is not supported for ${methodConfig.name}`);
        }
        
        return true;
    }
}

// Initialize funding manager
const fundingManager = new FundingManager();
window.fundingManager = fundingManager;
export default fundingManager;
