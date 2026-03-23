// Crypto Service with Firestore Integration
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './firebase-config.js';

class CryptoService {
  constructor() {
    this.listeners = new Map();
    this.cryptoData = new Map();
    this.initializeCryptoData();
  }

  // Initialize crypto data with real API integration
  async initializeCryptoData() {
    try {
      // Fetch real crypto data from CoinGecko API
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd&include_24hr_change=true');
      const data = await response.json();
      
      // Store in Firestore
      await this.saveCryptoData('bitcoin', {
        name: 'Bitcoin',
        symbol: 'BTC',
        price: data.bitcoin.usd,
        change24h: data.bitcoin.usd_24h_change,
        status: 'High'
      });
      
      await this.saveCryptoData('ethereum', {
        name: 'Ethereum',
        symbol: 'ETH',
        price: data.ethereum.usd,
        change24h: data.ethereum.usd_24h_change,
        status: 'High'
      });
      
      await this.saveCryptoData('tether', {
        name: 'Usdt(Tether)',
        symbol: 'USDT',
        price: data.tether.usd,
        change24h: data.tether.usd_24h_change,
        status: 'High'
      });
      
    } catch (error) {
      console.error('Error initializing crypto data:', error);
    }
  }

  // Save crypto data to Firestore
  async saveCryptoData(cryptoId, data) {
    try {
      const cryptoRef = doc(db, 'cryptoData', cryptoId);
      await setDoc(cryptoRef, {
        ...data,
        lastUpdated: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving crypto data:', error);
    }
  }

  // Get user's crypto portfolio
  async getUserCryptoPortfolio(uid) {
    try {
      const portfolioRef = doc(db, 'cryptoPortfolios', uid);
      const portfolioDoc = await getDoc(portfolioRef);
      
      if (portfolioDoc.exists()) {
        return {
          success: true,
          data: portfolioDoc.data()
        };
      } else {
        // Initialize empty portfolio
        const defaultPortfolio = {
          bitcoin: { amount: 0.00, value: 0 },
          ethereum: { amount: 0.00, value: 0 },
          tether: { amount: 0.00, value: 0 },
          totalValue: 0,
          createdAt: serverTimestamp()
        };
        
        await setDoc(portfolioRef, defaultPortfolio);
        return {
          success: true,
          data: defaultPortfolio
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update user's crypto portfolio
  async updateCryptoPortfolio(uid, cryptoId, amount, price) {
    try {
      const portfolioRef = doc(db, 'cryptoPortfolios', uid);
      const portfolio = await this.getUserCryptoPortfolio(uid);
      
      if (portfolio.success) {
        const updatedPortfolio = { ...portfolio.data };
        updatedPortfolio[cryptoId] = {
          amount: amount,
          value: amount * price
        };
        
        // Recalculate total value
        updatedPortfolio.totalValue = Object.values(updatedPortfolio)
          .filter(item => typeof item === 'object' && item.value)
          .reduce((total, item) => total + item.value, 0);
        
        updatedPortfolio.updatedAt = serverTimestamp();
        
        await updateDoc(portfolioRef, updatedPortfolio);
        
        return {
          success: true,
          message: 'Portfolio updated successfully'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Buy crypto functionality
  async buyCrypto(uid, cryptoId, usdAmount) {
    try {
      // Get current crypto price
      const cryptoRef = doc(db, 'cryptoData', cryptoId);
      const cryptoDoc = await getDoc(cryptoRef);
      
      if (!cryptoDoc.exists()) {
        return {
          success: false,
          error: 'Crypto not found'
        };
      }
      
      const cryptoData = cryptoDoc.data();
      const cryptoAmount = usdAmount / cryptoData.price;
      
      // Update user's portfolio
      const portfolioResult = await this.updateCryptoPortfolio(uid, cryptoId, cryptoAmount, cryptoData.price);
      
      if (portfolioResult.success) {
        // Record transaction
        await this.recordTransaction(uid, {
          type: 'buy',
          cryptoId: cryptoId,
          amount: cryptoAmount,
          usdValue: usdAmount,
          price: cryptoData.price,
          timestamp: serverTimestamp()
        });
        
        return {
          success: true,
          message: `Successfully bought ${cryptoAmount.toFixed(6)} ${cryptoData.symbol}`,
          data: {
            amount: cryptoAmount,
            price: cryptoData.price,
            total: usdAmount
          }
        };
      }
      
      return portfolioResult;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Record crypto transaction
  async recordTransaction(uid, transactionData) {
    try {
      const transactionsRef = collection(db, 'cryptoTransactions');
      await setDoc(doc(transactionsRef), {
        uid: uid,
        ...transactionData
      });
    } catch (error) {
      console.error('Error recording transaction:', error);
    }
  }

  // Get all crypto data
  async getAllCryptoData() {
    try {
      const cryptoRef = collection(db, 'cryptoData');
      const snapshot = await getDocs(cryptoRef);
      const cryptoList = [];
      
      snapshot.forEach((doc) => {
        cryptoList.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return {
        success: true,
        data: cryptoList
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Real-time crypto data subscription
  subscribeToCryptoData(callback) {
    const cryptoRef = collection(db, 'cryptoData');
    
    const unsubscribe = onSnapshot(cryptoRef, (snapshot) => {
      const cryptoList = [];
      snapshot.forEach((doc) => {
        cryptoList.push({
          id: doc.id,
          ...doc.data()
        });
      });
      callback(cryptoList);
    });
    
    this.listeners.set('cryptoData', unsubscribe);
    return unsubscribe;
  }

  // Real-time portfolio subscription
  subscribeToUserPortfolio(uid, callback) {
    const portfolioRef = doc(db, 'cryptoPortfolios', uid);
    
    const unsubscribe = onSnapshot(portfolioRef, (doc) => {
      if (doc.exists()) {
        callback(doc.data());
      }
    });
    
    this.listeners.set(`portfolio_${uid}`, unsubscribe);
    return unsubscribe;
  }

  // Wallet connection simulation (for demo purposes)
  async connectWallet(walletType = 'metamask') {
    try {
      // Simulate wallet connection
      if (typeof window.ethereum !== 'undefined') {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        return {
          success: true,
          address: accounts[0],
          walletType: walletType
        };
      } else {
        // Simulate connection for demo
        return {
          success: true,
          address: '0x' + Math.random().toString(16).substr(2, 40),
          walletType: walletType,
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

  // Update crypto prices periodically
  startPriceUpdates() {
    setInterval(() => {
      this.initializeCryptoData();
    }, 60000); // Update every minute
  }

  // Cleanup listeners
  unsubscribeAll() {
    this.listeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.listeners.clear();
  }
}

export default new CryptoService();