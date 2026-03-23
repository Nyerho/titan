import { auth, db } from './firebase-config.js';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import cryptoService from './crypto-service.js';

class CryptoPurchasePortal {
    constructor() {
        this.selectedCrypto = null;
        this.userBalance = 0;
        this.cryptoData = new Map();
        this.init();
    }

    async init() {
        await this.loadUserBalance();
        await this.loadCryptoData();
        this.setupEventListeners();
        this.startPriceUpdates();
    }

    async loadUserBalance() {
        try {
            const user = auth.currentUser;
            if (user) {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    this.userBalance = userDoc.data().accountBalance || 0;
                    document.getElementById('userBalance').textContent = this.userBalance.toFixed(2);
                }
            }
        } catch (error) {
            console.error('Error loading user balance:', error);
        }
    }

    async loadCryptoData() {
        try {
            const cryptos = [
                { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', icon: '₿', color: '#f7931a' },
                { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', icon: 'Ξ', color: '#627eea' },
                { id: 'tether', name: 'Tether', symbol: 'USDT', icon: '₮', color: '#26a17b' },
                { id: 'binancecoin', name: 'BNB', symbol: 'BNB', icon: 'B', color: '#f3ba2f' },
                { id: 'cardano', name: 'Cardano', symbol: 'ADA', icon: '₳', color: '#0033ad' },
                { id: 'solana', name: 'Solana', symbol: 'SOL', icon: '◎', color: '#9945ff' }
            ];

            // Fetch real prices from CoinGecko
            const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptos.map(c => c.id).join(',')}&vs_currencies=usd&include_24hr_change=true`);
            const priceData = await response.json();

            const cryptoGrid = document.getElementById('cryptoGrid');
            const cryptoPrices = document.getElementById('cryptoPrices');
            
            cryptoGrid.innerHTML = '';
            cryptoPrices.innerHTML = '';

            cryptos.forEach(crypto => {
                const price = priceData[crypto.id]?.usd || 0;
                const change = priceData[crypto.id]?.usd_24h_change || 0;
                
                this.cryptoData.set(crypto.id, { ...crypto, price, change });

                // Create crypto card
                const card = document.createElement('div');
                card.className = 'crypto-card';
                card.dataset.cryptoId = crypto.id;
                card.innerHTML = `
                    <div class="crypto-icon" style="background: ${crypto.color}20; color: ${crypto.color}">
                        ${crypto.icon}
                    </div>
                    <div class="crypto-name">${crypto.name}</div>
                    <div class="crypto-symbol">${crypto.symbol}</div>
                    <div class="crypto-price">$${price.toLocaleString()}</div>
                    <div class="crypto-change ${change >= 0 ? 'positive' : 'negative'}">
                        ${change >= 0 ? '+' : ''}${change.toFixed(2)}%
                    </div>
                `;
                
                card.addEventListener('click', () => this.selectCrypto(crypto.id));
                cryptoGrid.appendChild(card);

                // Create price item
                const priceItem = document.createElement('div');
                priceItem.className = 'price-item';
                priceItem.innerHTML = `
                    <span>${crypto.symbol}</span>
                    <span>$${price.toLocaleString()}</span>
                `;
                cryptoPrices.appendChild(priceItem);
            });
        } catch (error) {
            console.error('Error loading crypto data:', error);
        }
    }

    selectCrypto(cryptoId) {
        // Remove previous selection
        document.querySelectorAll('.crypto-card').forEach(card => {
            card.classList.remove('selected');
        });

        // Select new crypto
        const selectedCard = document.querySelector(`[data-crypto-id="${cryptoId}"]`);
        selectedCard.classList.add('selected');
        
        this.selectedCrypto = this.cryptoData.get(cryptoId);
        
        // Show purchase form
        const purchaseForm = document.getElementById('purchaseForm');
        purchaseForm.style.display = 'block';
        
        // Update selected crypto display
        const selectedCryptoDiv = document.getElementById('selectedCrypto');
        selectedCryptoDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
                <div class="crypto-icon" style="background: ${this.selectedCrypto.color}20; color: ${this.selectedCrypto.color}; width: 40px; height: 40px;">
                    ${this.selectedCrypto.icon}
                </div>
                <div>
                    <div style="font-weight: bold;">${this.selectedCrypto.name} (${this.selectedCrypto.symbol})</div>
                    <div style="color: #00d4ff;">$${this.selectedCrypto.price.toLocaleString()}</div>
                </div>
            </div>
        `;
        
        purchaseForm.scrollIntoView({ behavior: 'smooth' });
    }

    setupEventListeners() {
        // Amount input
        const amountInput = document.getElementById('purchaseAmount');
        amountInput.addEventListener('input', () => this.updatePreview());

        // Amount suggestion buttons
        document.querySelectorAll('.amount-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                amountInput.value = btn.dataset.amount;
                this.updatePreview();
            });
        });

        // Confirm purchase button
        document.getElementById('confirmPurchaseBtn').addEventListener('click', () => {
            this.showConfirmation();
        });

        // Modal event listeners
        document.getElementById('closeConfirmationModal').addEventListener('click', () => {
            document.getElementById('confirmationModal').style.display = 'none';
        });

        document.getElementById('cancelPurchase').addEventListener('click', () => {
            document.getElementById('confirmationModal').style.display = 'none';
        });

        document.getElementById('finalConfirmBtn').addEventListener('click', () => {
            this.processPurchase();
        });
    }

    updatePreview() {
        const amount = parseFloat(document.getElementById('purchaseAmount').value) || 0;
        const preview = document.getElementById('purchasePreview');
        
        if (amount > 0 && this.selectedCrypto) {
            const cryptoAmount = amount / this.selectedCrypto.price;
            const fee = amount * 0.01; // 1% fee
            const total = amount + fee;
            
            preview.innerHTML = `
                <h4>Purchase Preview</h4>
                <div style="margin: 10px 0;">
                    <div>You will receive: <strong>${cryptoAmount.toFixed(8)} ${this.selectedCrypto.symbol}</strong></div>
                    <div>Transaction fee: <strong>$${fee.toFixed(2)}</strong></div>
                    <div>Total cost: <strong>$${total.toFixed(2)}</strong></div>
                </div>
                ${total > this.userBalance ? '<div style="color: #ff4757; margin-top: 10px;">⚠️ Insufficient balance</div>' : ''}
            `;
            
            document.getElementById('confirmPurchaseBtn').disabled = total > this.userBalance;
        } else {
            preview.innerHTML = '';
        }
    }

    showConfirmation() {
        const amount = parseFloat(document.getElementById('purchaseAmount').value);
        const cryptoAmount = amount / this.selectedCrypto.price;
        const fee = amount * 0.01;
        const total = amount + fee;
        
        const confirmationDetails = document.getElementById('confirmationDetails');
        confirmationDetails.innerHTML = `
            <div style="text-align: center;">
                <h4>Confirm Your Purchase</h4>
                <div style="margin: 20px 0; padding: 20px; background: rgba(0, 212, 255, 0.1); border-radius: 8px;">
                    <div style="font-size: 24px; margin-bottom: 10px;">${cryptoAmount.toFixed(8)} ${this.selectedCrypto.symbol}</div>
                    <div style="color: #888;">≈ $${amount.toFixed(2)} USD</div>
                </div>
                <div style="text-align: left; margin: 20px 0;">
                    <div>Cryptocurrency: <strong>${this.selectedCrypto.name}</strong></div>
                    <div>Price per ${this.selectedCrypto.symbol}: <strong>$${this.selectedCrypto.price.toLocaleString()}</strong></div>
                    <div>Amount: <strong>$${amount.toFixed(2)}</strong></div>
                    <div>Fee (1%): <strong>$${fee.toFixed(2)}</strong></div>
                    <div style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: 10px; margin-top: 10px;">
                        Total: <strong>$${total.toFixed(2)}</strong>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('confirmationModal').style.display = 'block';
    }

    async processPurchase() {
        try {
            const amount = parseFloat(document.getElementById('purchaseAmount').value);
            const user = auth.currentUser;
            
            if (!user) {
                alert('Please log in to make a purchase');
                return;
            }

            // Process the purchase through crypto service
            const result = await cryptoService.buyCrypto(user.uid, this.selectedCrypto.id, amount);
            
            if (result.success) {
                // Update user balance
                const fee = amount * 0.01;
                const total = amount + fee;
                const newBalance = this.userBalance - total;
                
                await updateDoc(doc(db, 'users', user.uid), {
                    accountBalance: newBalance,
                    lastUpdated: serverTimestamp()
                });
                
                // Record transaction
                await cryptoService.recordTransaction(user.uid, {
                    type: 'crypto_purchase',
                    cryptoId: this.selectedCrypto.id,
                    cryptoSymbol: this.selectedCrypto.symbol,
                    amount: amount,
                    cryptoAmount: amount / this.selectedCrypto.price,
                    fee: fee,
                    total: total,
                    price: this.selectedCrypto.price,
                    timestamp: serverTimestamp()
                });
                
                // Show success modal
                this.showSuccess(result);
                
                // Update balance display
                this.userBalance = newBalance;
                document.getElementById('userBalance').textContent = newBalance.toFixed(2);
                
            } else {
                alert(`Purchase failed: ${result.error}`);
            }
        } catch (error) {
            console.error('Error processing purchase:', error);
            alert('An error occurred while processing your purchase. Please try again.');
        }
        
        document.getElementById('confirmationModal').style.display = 'none';
    }

    showSuccess(result) {
        const successDetails = document.getElementById('successDetails');
        successDetails.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 48px; color: #00ff88; margin-bottom: 20px;">
                    <i class="fas fa-check-circle"></i>
                </div>
                <h3>Purchase Completed Successfully!</h3>
                <div style="margin: 20px 0; padding: 20px; background: rgba(0, 255, 136, 0.1); border-radius: 8px;">
                    <div>You have successfully purchased:</div>
                    <div style="font-size: 20px; font-weight: bold; margin: 10px 0;">
                        ${result.cryptoAmount.toFixed(8)} ${this.selectedCrypto.symbol}
                    </div>
                    <div style="color: #888;">Added to your portfolio</div>
                </div>
                <div style="font-size: 14px; color: #888;">
                    Transaction ID: ${result.transactionId || 'N/A'}
                </div>
            </div>
        `;
        
        document.getElementById('successModal').style.display = 'block';
    }

    startPriceUpdates() {
        // Update prices every 30 seconds
        setInterval(() => {
            this.loadCryptoData();
        }, 30000);
    }
}

// Reset form function
window.resetForm = function() {
    document.getElementById('purchaseAmount').value = '';
    document.getElementById('purchasePreview').innerHTML = '';
    document.querySelectorAll('.crypto-card').forEach(card => {
        card.classList.remove('selected');
    });
    document.getElementById('purchaseForm').style.display = 'none';
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CryptoPurchasePortal();
});