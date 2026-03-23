// Firebase Database Service
import { 
  collection, 
  doc, 
  addDoc,
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  runTransaction,
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot,
  serverTimestamp,
  increment
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './firebase-config.js';

class FirebaseDatabaseService {
  constructor() {
    this.listeners = new Map();
  }

  async getUserEntitlements(uid) {
    try {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      const data = snap.exists() ? snap.data() : {};

      return {
        success: true,
        data: {
          botsOwned: data.botsOwned || {},
          propAccount: data.propAccount || null
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async purchaseBot(uid, bot) {
    try {
      const userRef = doc(db, 'users', uid);
      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        const data = snap.exists() ? snap.data() : {};

        const botsOwned = data.botsOwned || {};
        if (botsOwned[bot.id]) {
          return { success: false, error: 'already_owned' };
        }

        const currentBalance = Number(data.accountBalance || 0);
        if (currentBalance < bot.price) {
          return { success: false, error: 'insufficient_funds' };
        }

        const nextBalance = currentBalance - bot.price;
        const nextBotsOwned = {
          ...botsOwned,
          [bot.id]: {
            id: bot.id,
            name: bot.name,
            price: bot.price,
            purchasedAt: Date.now(),
            active: false
          }
        };

        tx.set(
          userRef,
          {
            accountBalance: nextBalance,
            botsOwned: nextBotsOwned,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );

        return { success: true, newBalance: nextBalance };
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async setBotActive(uid, botId, active) {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        [`botsOwned.${botId}.active`]: !!active,
        updatedAt: serverTimestamp()
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async setPropAccount(uid, plan) {
    try {
      const userRef = doc(db, 'users', uid);
      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        const data = snap.exists() ? snap.data() : {};

        const propAccount = {
          planId: plan.planId,
          firmName: plan.firmName,
          accountSize: plan.accountSize,
          dailyDrawdownPct: plan.dailyDrawdownPct,
          maxDrawdownPct: plan.maxDrawdownPct,
          profitTargetPct: plan.profitTargetPct,
          status: 'evaluation',
          startingEquity: plan.accountSize,
          currentEquity: data.propAccount?.currentEquity && data.propAccount?.planId === plan.planId
            ? data.propAccount.currentEquity
            : plan.accountSize,
          todayDate: new Date().toISOString().slice(0, 10),
          todayPnl: 0,
          createdAt: data.propAccount?.createdAt || Date.now(),
          updatedAt: Date.now()
        };

        tx.set(
          userRef,
          {
            propAccount,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );

        return { success: true, propAccount };
      });

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async applyBalanceDelta(uid, delta) {
    try {
      const userRef = doc(db, 'users', uid);
      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        const data = snap.exists() ? snap.data() : {};
        const currentBalance = Number(data.accountBalance || 0);
        const nextBalance = Math.max(0, currentBalance + Number(delta || 0));

        tx.set(
          userRef,
          {
            accountBalance: nextBalance,
            balanceUpdatedAt: new Date().toISOString()
          },
          { merge: true }
        );

        return { success: true, balance: nextBalance };
      });

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async applyPropTradeResult(uid, profit) {
    try {
      const userRef = doc(db, 'users', uid);
      const today = new Date().toISOString().slice(0, 10);

      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        const data = snap.exists() ? snap.data() : {};
        const propAccount = data.propAccount;

        if (!propAccount || propAccount.status === 'breached') {
          return { success: false, error: 'no_prop_account' };
        }

        const startingEquity = Number(propAccount.startingEquity || propAccount.accountSize || 0);
        const currentEquity = Number(propAccount.currentEquity || startingEquity);
        const dailyDrawdownPct = Number(propAccount.dailyDrawdownPct || 0);
        const maxDrawdownPct = Number(propAccount.maxDrawdownPct || 0);

        const dailyLimit = startingEquity * dailyDrawdownPct;
        const maxLimit = startingEquity * maxDrawdownPct;

        const prevTodayPnl = propAccount.todayDate === today ? Number(propAccount.todayPnl || 0) : 0;
        const nextTodayPnl = prevTodayPnl + Number(profit || 0);
        const nextEquity = currentEquity + Number(profit || 0);

        let nextStatus = propAccount.status || 'evaluation';
        if (nextTodayPnl <= -dailyLimit || nextEquity <= startingEquity - maxLimit) {
          nextStatus = 'breached';
        }

        const updatedPropAccount = {
          ...propAccount,
          todayDate: today,
          todayPnl: nextTodayPnl,
          currentEquity: nextEquity,
          status: nextStatus,
          updatedAt: Date.now()
        };

        const updatePayload = {
          propAccount: updatedPropAccount,
          updatedAt: serverTimestamp()
        };

        if (nextStatus === 'breached' && data.botsOwned) {
          const botsOwned = data.botsOwned || {};
          const nextBotsOwned = { ...botsOwned };
          Object.keys(nextBotsOwned).forEach((botId) => {
            if (nextBotsOwned[botId] && nextBotsOwned[botId].active) {
              nextBotsOwned[botId] = { ...nextBotsOwned[botId], active: false };
            }
          });
          updatePayload.botsOwned = nextBotsOwned;
        }

        tx.set(userRef, updatePayload, { merge: true });

        return { success: true, propAccount: updatedPropAccount };
      });

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // User Profile Operations
  async getUserProfile(uid) {
    try {
      const userRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        return {
          success: true,
          data: userDoc.data()
        };
      } else {
        return {
          success: false,
          message: 'User profile not found'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateUserProfile(uid, profileData) {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        ...profileData,
        updatedAt: serverTimestamp()
      });
      
      return {
        success: true,
        message: 'Profile updated successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Trading Operations
  async createTrade(uid, tradeData) {
    try {
      const tradesRef = collection(db, 'trades');
      const trade = {
        uid: uid,
        ...tradeData,
        createdAt: serverTimestamp(),
        status: tradeData?.status || 'open'
      };
      
      const docRef = await addDoc(tradesRef, trade);
      
      return {
        success: true,
        tradeId: docRef.id,
        message: 'Trade created successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getUserTrades(uid, limitCount = 50) {
    try {
      const tradesRef = collection(db, 'trades');
      const q = query(
        tradesRef,
        where('uid', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      
      const querySnapshot = await getDocs(q);
      const trades = [];
      
      querySnapshot.forEach((doc) => {
        trades.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return {
        success: true,
        data: trades
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateTrade(tradeId, updateData) {
    try {
      const tradeRef = doc(db, 'trades', tradeId);
      await updateDoc(tradeRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      
      return {
        success: true,
        message: 'Trade updated successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Portfolio Operations
  async updatePortfolio(uid, portfolioData) {
    try {
      const portfolioRef = doc(db, 'portfolios', uid);
      await updateDoc(portfolioRef, {
        ...portfolioData,
        updatedAt: serverTimestamp()
      });
      
      return {
        success: true,
        message: 'Portfolio updated successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Market Data Operations
  async saveMarketData(symbol, data) {
    try {
      const marketRef = doc(db, 'marketData', symbol);
      await updateDoc(marketRef, {
        ...data,
        timestamp: serverTimestamp()
      });
      
      return {
        success: true,
        message: 'Market data saved'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Social Trading Operations
  async followTrader(followerId, traderId) {
    try {
      const followRef = doc(db, 'follows', `${followerId}_${traderId}`);
      await setDoc(followRef, {
        followerId: followerId,
        traderId: traderId,
        createdAt: serverTimestamp(),
        status: 'active'
      });
      
      // Update follower count
      const traderRef = doc(db, 'users', traderId);
      await updateDoc(traderRef, {
        'social.followers': increment(1)
      });
      
      return {
        success: true,
        message: 'Successfully followed trader'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Real-time Listeners
  subscribeToUserTrades(uid, callback) {
    const tradesRef = collection(db, 'trades');
    const q = query(
      tradesRef,
      where('uid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trades = [];
      snapshot.forEach((doc) => {
        trades.push({
          id: doc.id,
          ...doc.data()
        });
      });
      callback(trades);
    });
    
    this.listeners.set(`trades_${uid}`, unsubscribe);
    return unsubscribe;
  }

  subscribeToMarketData(symbol, callback) {
    const marketRef = doc(db, 'marketData', symbol);
    
    const unsubscribe = onSnapshot(marketRef, (doc) => {
      if (doc.exists()) {
        callback(doc.data());
      }
    });
    
    this.listeners.set(`market_${symbol}`, unsubscribe);
    return unsubscribe;
  }

  // Account Balance Operations
  async getUserBalance(uid) {
    try {
      const userRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        return {
          success: true,
          balance: userData.accountBalance || 0
        };
      } else {
        // Initialize user with default balance if profile doesn't exist
        await this.initializeUserAccount(uid);
        return {
          success: true,
          balance: 1000 // Default starting balance
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateUserBalance(uid, newBalance) {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        accountBalance: newBalance,
        balanceUpdatedAt: new Date().toISOString()
      });
      
      return {
        success: true,
        message: 'Balance updated successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async initializeUserAccount(uid, initialBalance = 1000) {
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, {
        accountBalance: initialBalance,
        createdAt: new Date().toISOString(),
        balanceUpdatedAt: new Date().toISOString()
      }, { merge: true });
      
      return {
        success: true,
        message: 'User account initialized'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async addFunds(uid, amount) {
    try {
      const balanceResult = await this.getUserBalance(uid);
      if (!balanceResult.success) {
        return balanceResult;
      }
      
      const newBalance = balanceResult.balance + amount;
      return await this.updateUserBalance(uid, newBalance);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async withdrawFunds(uid, amount) {
    try {
      const balanceResult = await this.getUserBalance(uid);
      if (!balanceResult.success) {
        return balanceResult;
      }
      
      if (balanceResult.balance < amount) {
        return {
          success: false,
          error: 'Insufficient funds'
        };
      }
      
      const newBalance = balanceResult.balance - amount;
      return await this.updateUserBalance(uid, newBalance);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Cleanup listeners
  unsubscribeAll() {
    this.listeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.listeners.clear();
  }

  unsubscribe(key) {
    const unsubscribe = this.listeners.get(key);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(key);
    }
  }
}

// Export singleton instance
export default new FirebaseDatabaseService();
