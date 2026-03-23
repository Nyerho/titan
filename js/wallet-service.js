// Web3 Wallet Service
class WalletService {
  constructor() {
    this.connectedWallet = null;
    this.walletAddress = null;
    this.gitIntegration = null;
    this.loadSavedConnections();
  }

  // Load saved wallet connections
  loadSavedConnections() {
    const savedWallet = localStorage.getItem('currentWallet');
    const savedGit = localStorage.getItem('gitIntegration');
    
    if (savedWallet) {
      this.connectedWallet = JSON.parse(savedWallet);
      this.walletAddress = this.connectedWallet.address;
    }
    
    if (savedGit) {
      this.gitIntegration = JSON.parse(savedGit);
    }
  }

  // Get all saved wallet connections
  getSavedWallets() {
    return JSON.parse(localStorage.getItem('walletConnections') || '[]');
  }

  // Get Git integration status
  getGitIntegration() {
    return this.gitIntegration;
  }

  // Push trading data to Git repository
  async pushToGit(data, commitMessage = 'Update trading data') {
    if (!this.gitIntegration || !this.gitIntegration.hasWriteAccess) {
      throw new Error('Git integration not configured or no write access');
    }

    try {
      // Simulate Git push (in production, use actual Git API)
      console.log('Pushing to Git:', {
        repository: this.gitIntegration.repository,
        data: data,
        message: commitMessage
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        success: true,
        commitHash: Math.random().toString(16).substr(2, 8),
        message: 'Successfully pushed to repository'
      };
    } catch (error) {
      throw new Error('Failed to push to Git: ' + error.message);
    }
  }

  // Check if MetaMask is installed
  isMetaMaskInstalled() {
    return typeof window.ethereum !== 'undefined';
  }

  // Connect to MetaMask wallet
  async connectMetaMask() {
    try {
      if (!this.isMetaMaskInstalled()) {
        return {
          success: false,
          error: 'MetaMask is not installed. Please install MetaMask to continue.'
        };
      }

      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

      if (accounts.length > 0) {
        this.connectedWallet = 'metamask';
        this.walletAddress = accounts[0];
        
        // Listen for account changes
        window.ethereum.on('accountsChanged', (accounts) => {
          if (accounts.length > 0) {
            this.walletAddress = accounts[0];
            this.onAccountChanged(accounts[0]);
          } else {
            this.disconnect();
          }
        });

        return {
          success: true,
          address: this.walletAddress,
          wallet: 'MetaMask'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Simulate other wallet connections
  async connectWallet(walletType) {
    try {
      switch (walletType) {
        case 'metamask':
          return await this.connectMetaMask();
        case 'walletconnect':
          return this.simulateWalletConnect();
        case 'coinbase':
          return this.simulateCoinbaseWallet();
        default:
          return {
            success: false,
            error: 'Unsupported wallet type'
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Simulate WalletConnect
  simulateWalletConnect() {
    this.connectedWallet = 'walletconnect';
    this.walletAddress = '0x' + Math.random().toString(16).substr(2, 40);
    
    return {
      success: true,
      address: this.walletAddress,
      wallet: 'WalletConnect',
      simulated: true
    };
  }

  // Simulate Coinbase Wallet
  simulateCoinbaseWallet() {
    this.connectedWallet = 'coinbase';
    this.walletAddress = '0x' + Math.random().toString(16).substr(2, 40);
    
    return {
      success: true,
      address: this.walletAddress,
      wallet: 'Coinbase Wallet',
      simulated: true
    };
  }

  // Get wallet balance (simulated)
  async getWalletBalance() {
    if (!this.walletAddress) {
      return {
        success: false,
        error: 'No wallet connected'
      };
    }

    try {
      if (this.connectedWallet === 'metamask' && window.ethereum) {
        const balance = await window.ethereum.request({
          method: 'eth_getBalance',
          params: [this.walletAddress, 'latest']
        });
        
        const ethBalance = parseInt(balance, 16) / Math.pow(10, 18);
        
        return {
          success: true,
          balance: ethBalance.toFixed(4),
          currency: 'ETH'
        };
      } else {
        // Simulate balance for demo wallets
        return {
          success: true,
          balance: (Math.random() * 10).toFixed(4),
          currency: 'ETH',
          simulated: true
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Disconnect wallet
  disconnect() {
    this.connectedWallet = null;
    this.walletAddress = null;
    
    // Trigger disconnect event
    this.onWalletDisconnected();
  }

  // Event handlers
  onAccountChanged(newAddress) {
    console.log('Account changed to:', newAddress);
    // Update UI or trigger callbacks
  }

  onWalletDisconnected() {
    console.log('Wallet disconnected');
    // Update UI or trigger callbacks
  }

  // Get connection status
  isConnected() {
    return this.connectedWallet !== null && this.walletAddress !== null;
  }

  // Get current wallet info
  getWalletInfo() {
    return {
      connected: this.isConnected(),
      wallet: this.connectedWallet,
      address: this.walletAddress
    };
  }
}

export default new WalletService();