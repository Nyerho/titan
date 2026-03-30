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

const PROP_PHASE_DEFS = {
  1: {
    phase: 1,
    label: 'Challenge (Phase 1)',
    profitTargetPct: 0.1,
    dailyDrawdownPct: 0.05,
    maxDrawdownPct: 0.1,
    minTradingDays: 4,
    timeLimitDays: 30
  },
  2: {
    phase: 2,
    label: 'Verification (Phase 2)',
    profitTargetPct: 0.05,
    dailyDrawdownPct: 0.05,
    maxDrawdownPct: 0.1,
    minTradingDays: 4,
    timeLimitDays: 60
  },
  3: {
    phase: 3,
    label: 'FTMO Account (Funded stage)',
    profitTargetPct: 0,
    dailyDrawdownPct: 0.05,
    maxDrawdownPct: 0.1,
    minTradingDays: 0,
    timeLimitDays: 0,
    profitSplitStartPct: 0.8,
    profitSplitMaxPct: 0.9,
    firstPayoutAfterDays: 14,
    scalingIncreasePct: 0.25,
    scalingEveryMonths: 4,
    scalingRequiresProfitPct: 0.1
  }
};

function getPropPhaseDef(phase) {
  return PROP_PHASE_DEFS[Number(phase) || 1] || PROP_PHASE_DEFS[1];
}

function dateKeyIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}

function computeUnifiedBalanceFromTotals(data) {
  const deposits = Number(data?.totalDeposits || 0);
  const profits = Number(data?.totalProfits || 0);
  const withdrawals = Number(data?.totalWithdrawals || 0);
  const hasAnyTotals = Number.isFinite(deposits) || Number.isFinite(profits) || Number.isFinite(withdrawals);
  if (!hasAnyTotals) return null;
  if (!Number.isFinite(deposits) || !Number.isFinite(profits) || !Number.isFinite(withdrawals)) return null;
  return Math.max(0, deposits + profits - withdrawals);
}

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

        const currentWallet = Number(data.walletBalance ?? data.balance ?? 0);
        if (currentWallet < bot.price) {
          return { success: false, error: 'insufficient_funds' };
        }

        const nextWallet = Math.max(0, currentWallet - bot.price);
        const botEntry = {
          id: bot.id,
          name: bot.name,
          price: bot.price,
          purchasedAt: Date.now(),
          active: false
        };
        const roiPctPerCycle = Number(bot.roiPctPerCycle);
        const cycleHours = Number(bot.cycleHours);
        if (Number.isFinite(roiPctPerCycle)) botEntry.roiPctPerCycle = roiPctPerCycle;
        if (Number.isFinite(cycleHours)) botEntry.cycleHours = cycleHours;
        if (bot.botConfig && typeof bot.botConfig === 'object') botEntry.botConfig = bot.botConfig;
        const nextBotsOwned = {
          ...botsOwned,
          [bot.id]: botEntry
        };

        tx.set(
          userRef,
          {
            walletBalance: nextWallet,
            balance: nextWallet,
            balanceUpdatedAt: new Date().toISOString(),
            botsOwned: nextBotsOwned,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );

        return { success: true, walletBalance: nextWallet };
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
        const phaseDef = getPropPhaseDef(1);
        const planId = plan.planId;
        const firmName = plan.firmName || 'TitanTrades Prop';
        const accountSize = Number(plan.accountSize || 0);
        const feeUsd = Number(plan.feeUsd || 0);
        const now = Date.now();
        const today = dateKeyIsoUtc();

        if (!planId || !(accountSize > 0) || !(feeUsd >= 0)) {
          return { success: false, error: 'invalid_plan' };
        }

        const existingProp = data.propAccount || null;
        if (existingProp && existingProp.status !== 'breached') {
          return { success: false, error: 'already_has_prop' };
        }

        const currentWallet = Number(data.walletBalance ?? data.balance ?? 0);
        if (feeUsd > 0 && currentWallet < feeUsd) {
          return { success: false, error: 'insufficient_funds' };
        }

        const nextWallet = Math.max(0, currentWallet - feeUsd);

        const propAccount = {
          planId,
          firmName,
          accountSize,
          feeUsd,
          feeRefundable: true,
          phase: 1,
          phaseLabel: phaseDef.label,
          phaseStartedAt: now,
          minTradingDays: phaseDef.minTradingDays,
          timeLimitDays: phaseDef.timeLimitDays,
          dailyDrawdownPct: phaseDef.dailyDrawdownPct,
          maxDrawdownPct: phaseDef.maxDrawdownPct,
          profitTargetPct: phaseDef.profitTargetPct,
          status: 'evaluation',
          startingEquity: accountSize,
          currentEquity: accountSize,
          todayDate: today,
          todayPnl: 0,
          tradingDays: [],
          profitSplitPct: phaseDef.profitSplitStartPct ?? 0,
          profitSplitMaxPct: phaseDef.profitSplitMaxPct ?? 0,
          firstPayoutAfterDays: phaseDef.firstPayoutAfterDays ?? 0,
          scalingIncreasePct: phaseDef.scalingIncreasePct ?? 0,
          scalingEveryMonths: phaseDef.scalingEveryMonths ?? 0,
          scalingRequiresProfitPct: phaseDef.scalingRequiresProfitPct ?? 0,
          phaseDefs: PROP_PHASE_DEFS,
          feePaidAt: now,
          createdAt: now,
          updatedAt: now
        };

        tx.set(
          userRef,
          {
            walletBalance: nextWallet,
            balance: nextWallet,
            balanceUpdatedAt: new Date().toISOString(),
            propAccount,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );

        return { success: true, propAccount, walletBalance: nextWallet };
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
        const hasPropAccount = !!data.propAccount;
        const hasTradingInit = !!data.tradingBalanceInitializedAt;
        const currentTradingBalance = Number(data.accountBalance ?? 0);
        if (!hasPropAccount && !hasTradingInit) {
          return { success: false, error: 'trading_balance_not_initialized' };
        }
        const nextTradingBalance = Math.max(0, currentTradingBalance + Number(delta || 0));

        const profitDelta = Number(delta || 0);
        const totalsPatch = {};
        if (Number.isFinite(profitDelta) && profitDelta > 0) {
          totalsPatch.totalProfits = increment(profitDelta);
        }

        const patch = {
          accountBalance: nextTradingBalance,
          tradingBalanceUpdatedAt: new Date().toISOString(),
          ...totalsPatch
        };
        if (!hasTradingInit && nextTradingBalance > 0) {
          patch.tradingBalanceInitializedAt = serverTimestamp();
        }
        tx.set(
          userRef,
          patch,
          { merge: true }
        );

        return { success: true, balance: nextTradingBalance };
      });

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async transferTradingToWallet(uid, amount) {
    try {
      const userRef = doc(db, 'users', uid);
      const transferRef = doc(collection(db, 'transactions'));
      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        const data = snap.exists() ? snap.data() : {};
        const trading = Number(data.accountBalance ?? 0);
        const wallet = Number(data.walletBalance ?? data.balance ?? 0);
        const transferAmount = Number(amount || 0);
        if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
          return { success: false, error: 'invalid_amount' };
        }
        if (!Number.isFinite(trading) || trading < transferAmount) {
          return { success: false, error: 'insufficient_trading_balance' };
        }
        const nextTrading = Math.max(0, trading - transferAmount);
        const nextWallet = Math.max(0, wallet + transferAmount);

        tx.set(
          userRef,
          {
            accountBalance: nextTrading,
            tradingBalanceUpdatedAt: new Date().toISOString(),
            walletBalance: nextWallet,
            balance: nextWallet,
            balanceUpdatedAt: new Date().toISOString(),
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );

        tx.set(transferRef, {
          userId: uid,
          type: 'internal_transfer',
          direction: 'trading_to_wallet',
          amount: transferAmount,
          status: 'completed',
          description: 'Transfer from trading balance to wallet balance',
          timestamp: serverTimestamp()
        });

        return { success: true, tradingBalance: nextTrading, walletBalance: nextWallet };
      });

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async transferWalletToTrading(uid, amount) {
    try {
      const userRef = doc(db, 'users', uid);
      const transferRef = doc(collection(db, 'transactions'));
      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        const data = snap.exists() ? snap.data() : {};
        const trading = Number(data.accountBalance ?? 0);
        const wallet = Number(data.walletBalance ?? data.balance ?? 0);
        const transferAmount = Number(amount || 0);
        if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
          return { success: false, error: 'invalid_amount' };
        }
        if (!Number.isFinite(wallet) || wallet < transferAmount) {
          return { success: false, error: 'insufficient_wallet_balance' };
        }
        const nextWallet = Math.max(0, wallet - transferAmount);
        const nextTrading = Math.max(0, trading + transferAmount);

        tx.set(
          userRef,
          {
            walletBalance: nextWallet,
            balance: nextWallet,
            balanceUpdatedAt: new Date().toISOString(),
            accountBalance: nextTrading,
            tradingBalanceUpdatedAt: new Date().toISOString(),
            tradingBalanceInitializedAt: data.tradingBalanceInitializedAt || serverTimestamp(),
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );

        tx.set(transferRef, {
          userId: uid,
          type: 'internal_transfer',
          direction: 'wallet_to_trading',
          amount: transferAmount,
          status: 'completed',
          description: 'Transfer from wallet balance to trading balance',
          timestamp: serverTimestamp()
        });

        return { success: true, tradingBalance: nextTrading, walletBalance: nextWallet };
      });

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async applyPropTradeResult(uid, profit) {
    try {
      const userRef = doc(db, 'users', uid);
      const today = dateKeyIsoUtc();

      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        const data = snap.exists() ? snap.data() : {};
        const propAccount = data.propAccount;

        if (!propAccount || propAccount.status === 'breached') {
          return { success: false, error: 'no_prop_account' };
        }

        const phase = Number(propAccount.phase || 1);
        const phaseDef = getPropPhaseDef(phase);

        const accountSize = Number(propAccount.accountSize || 0);
        const startingEquity = Number(propAccount.startingEquity || accountSize || 0);
        const currentEquity = Number(propAccount.currentEquity || startingEquity);
        const dailyDrawdownPct = Number(propAccount.dailyDrawdownPct ?? phaseDef.dailyDrawdownPct ?? 0);
        const maxDrawdownPct = Number(propAccount.maxDrawdownPct ?? phaseDef.maxDrawdownPct ?? 0);
        const minTradingDays = Number(propAccount.minTradingDays ?? phaseDef.minTradingDays ?? 0);
        const timeLimitDays = Number(propAccount.timeLimitDays ?? phaseDef.timeLimitDays ?? 0);
        const phaseStartedAt = Number(propAccount.phaseStartedAt || propAccount.createdAt || Date.now());
        const profitTargetPct = Number(propAccount.profitTargetPct ?? phaseDef.profitTargetPct ?? 0);

        const dailyLimit = startingEquity * dailyDrawdownPct;
        const maxLimit = startingEquity * maxDrawdownPct;

        const prevTodayPnl = propAccount.todayDate === today ? Number(propAccount.todayPnl || 0) : 0;
        const nextTodayPnl = prevTodayPnl + Number(profit || 0);
        const nextEquity = currentEquity + Number(profit || 0);

        let nextStatus = propAccount.status || 'evaluation';
        let breachReason = propAccount.breachReason || '';
        if (nextTodayPnl <= -dailyLimit) {
          nextStatus = 'breached';
          breachReason = 'daily_drawdown';
        }
        if (nextEquity <= startingEquity - maxLimit) {
          nextStatus = 'breached';
          breachReason = 'max_drawdown';
        }

        const tradingDays = Array.isArray(propAccount.tradingDays) ? propAccount.tradingDays.slice() : [];
        if (!tradingDays.includes(today)) tradingDays.push(today);

        const elapsedDays = Math.floor((Date.now() - phaseStartedAt) / 86400000);
        if (timeLimitDays > 0 && elapsedDays > timeLimitDays) {
          nextStatus = 'breached';
          breachReason = 'time_limit';
        }

        let updatedPropAccount = {
          ...propAccount,
          todayDate: today,
          todayPnl: nextTodayPnl,
          currentEquity: nextEquity,
          status: nextStatus,
          breachReason,
          tradingDays,
          updatedAt: Date.now()
        };

        const isEvaluation = updatedPropAccount.status !== 'breached' && updatedPropAccount.status !== 'funded';
        const targetEquity = startingEquity * (1 + profitTargetPct);
        const meetsProfitTarget = profitTargetPct > 0 && updatedPropAccount.currentEquity >= targetEquity;
        const meetsTradingDays = minTradingDays <= 0 || tradingDays.length >= minTradingDays;

        if (isEvaluation && meetsProfitTarget && meetsTradingDays) {
          if (phase === 1) {
            const nextPhaseDef = getPropPhaseDef(2);
            updatedPropAccount = {
              ...updatedPropAccount,
              phase: 2,
              phaseLabel: nextPhaseDef.label,
              phaseStartedAt: Date.now(),
              minTradingDays: nextPhaseDef.minTradingDays,
              timeLimitDays: nextPhaseDef.timeLimitDays,
              dailyDrawdownPct: nextPhaseDef.dailyDrawdownPct,
              maxDrawdownPct: nextPhaseDef.maxDrawdownPct,
              profitTargetPct: nextPhaseDef.profitTargetPct,
              startingEquity: accountSize,
              currentEquity: accountSize,
              todayDate: today,
              todayPnl: 0,
              tradingDays: [],
              phase1PassedAt: Date.now(),
              phase1ResultEquity: updatedPropAccount.currentEquity
            };
          }

          if (phase === 2) {
            const nextPhaseDef = getPropPhaseDef(3);
            updatedPropAccount = {
              ...updatedPropAccount,
              phase: 3,
              phaseLabel: nextPhaseDef.label,
              phaseStartedAt: Date.now(),
              minTradingDays: nextPhaseDef.minTradingDays,
              timeLimitDays: nextPhaseDef.timeLimitDays,
              dailyDrawdownPct: nextPhaseDef.dailyDrawdownPct,
              maxDrawdownPct: nextPhaseDef.maxDrawdownPct,
              profitTargetPct: nextPhaseDef.profitTargetPct,
              status: 'funded',
              startingEquity: accountSize,
              currentEquity: accountSize,
              todayDate: today,
              todayPnl: 0,
              tradingDays: [],
              profitSplitPct: nextPhaseDef.profitSplitStartPct ?? updatedPropAccount.profitSplitPct ?? 0,
              profitSplitMaxPct: nextPhaseDef.profitSplitMaxPct ?? updatedPropAccount.profitSplitMaxPct ?? 0,
              firstPayoutAfterDays: nextPhaseDef.firstPayoutAfterDays ?? updatedPropAccount.firstPayoutAfterDays ?? 0,
              scalingIncreasePct: nextPhaseDef.scalingIncreasePct ?? updatedPropAccount.scalingIncreasePct ?? 0,
              scalingEveryMonths: nextPhaseDef.scalingEveryMonths ?? updatedPropAccount.scalingEveryMonths ?? 0,
              scalingRequiresProfitPct: nextPhaseDef.scalingRequiresProfitPct ?? updatedPropAccount.scalingRequiresProfitPct ?? 0,
              phase2PassedAt: Date.now(),
              phase2ResultEquity: updatedPropAccount.currentEquity,
              fundedAt: Date.now()
            };
          }
        }

        const updatePayload = {
          propAccount: updatedPropAccount,
          updatedAt: serverTimestamp()
        };

        const equityForBalance = Math.max(0, Number(updatedPropAccount.currentEquity || 0));
        updatePayload.accountBalance = equityForBalance;
        updatePayload.tradingBalanceUpdatedAt = new Date().toISOString();
        const profitDelta = Number(profit || 0);
        if (Number.isFinite(profitDelta) && profitDelta > 0) {
          updatePayload.totalProfits = increment(profitDelta);
        }

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
      const normalizedProfit =
        tradeData && tradeData.pnl === undefined && tradeData.profit !== undefined
          ? { pnl: tradeData.profit }
          : {};
      const trade = {
        uid: uid,
        ...tradeData,
        ...normalizedProfit,
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
        const hasSplit = !!userData.balancesSeparatedAt;
        if (!hasSplit) {
          const walletCandidate = Number(userData.walletBalance ?? userData.balance ?? userData.accountBalance ?? 0);
          if (Number.isFinite(walletCandidate) && walletCandidate >= 0) {
            try {
              await updateDoc(userRef, {
                walletBalance: walletCandidate,
                balance: walletCandidate,
                balanceUpdatedAt: new Date().toISOString(),
                accountBalance: 0,
                tradingBalanceUpdatedAt: new Date().toISOString(),
                balancesSeparatedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
            } catch (e) {}
            return { success: true, balance: walletCandidate };
          }
        }

        const stored = Number(userData.walletBalance ?? userData.balance ?? 0);
        return { success: true, balance: Number.isFinite(stored) ? stored : 0 };
      } else {
        await this.initializeUserAccount(uid);
        return { success: true, balance: 0 };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getUserTradingBalance(uid) {
    try {
      const userRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) return { success: true, balance: 0 };
      const userData = userDoc.data();
      const hasSplit = !!userData.balancesSeparatedAt;
      if (!hasSplit) {
        const walletCandidate = Number(userData.walletBalance ?? userData.balance ?? userData.accountBalance ?? 0);
        if (Number.isFinite(walletCandidate) && walletCandidate >= 0) {
          try {
            await updateDoc(userRef, {
              walletBalance: walletCandidate,
              balance: walletCandidate,
              balanceUpdatedAt: new Date().toISOString(),
              accountBalance: 0,
              tradingBalanceUpdatedAt: new Date().toISOString(),
              balancesSeparatedAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          } catch (e) {}
          return { success: true, balance: 0 };
        }
      }
      const hasPropAccount = !!userData.propAccount;
      const hasTradingInit = !!userData.tradingBalanceInitializedAt;
      const tradingCandidate = Number(userData.accountBalance ?? 0);
      if (!hasPropAccount && !hasTradingInit && Number.isFinite(tradingCandidate) && tradingCandidate > 0) {
        try {
          await updateDoc(userRef, {
            accountBalance: 0,
            tradingBalanceUpdatedAt: new Date().toISOString(),
            updatedAt: serverTimestamp()
          });
        } catch (e) {}
        return { success: true, balance: 0 };
      }
      const trading = tradingCandidate;
      return { success: true, balance: Number.isFinite(trading) ? trading : 0 };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  subscribeToUserBalance(uid, callback) {
    const userRef = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (!snap.exists()) {
        callback(0);
        return;
      }
      const data = snap.data() || {};
      const stored = Number(data.walletBalance ?? data.balance ?? 0);
      callback(Number.isFinite(stored) ? stored : 0);
    });

    this.listeners.set(`balance_${uid}`, unsubscribe);
    return unsubscribe;
  }

  subscribeToUserTradingBalance(uid, callback) {
    const userRef = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (!snap.exists()) {
        callback(0);
        return;
      }
      const data = snap.data() || {};
      const hasPropAccount = !!data.propAccount;
      const hasTradingInit = !!data.tradingBalanceInitializedAt;
      const tradingCandidate = Number(data.accountBalance ?? 0);
      if (!hasPropAccount && !hasTradingInit && Number.isFinite(tradingCandidate) && tradingCandidate > 0) {
        try {
          updateDoc(userRef, {
            accountBalance: 0,
            tradingBalanceUpdatedAt: new Date().toISOString(),
            updatedAt: serverTimestamp()
          });
        } catch (e) {}
        callback(0);
        return;
      }
      callback(Number.isFinite(tradingCandidate) ? tradingCandidate : 0);
    });

    this.listeners.set(`trading_balance_${uid}`, unsubscribe);
    return unsubscribe;
  }

  async updateUserBalance(uid, newBalance) {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        balance: newBalance,
        walletBalance: newBalance,
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

  async initializeUserAccount(uid, initialBalance = 0) {
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, {
        balance: initialBalance,
        walletBalance: initialBalance,
        accountBalance: 0,
        createdAt: new Date().toISOString(),
        balanceUpdatedAt: new Date().toISOString(),
        tradingBalanceUpdatedAt: new Date().toISOString(),
        balancesSeparatedAt: serverTimestamp()
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
