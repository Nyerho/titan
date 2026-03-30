import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import FirebaseDatabaseService from './firebase-database.js';

function showToast(message, type = 'info', timeout = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.padding = '10px 14px';
  toast.style.borderRadius = '6px';
  toast.style.color = '#fff';
  toast.style.fontSize = '14px';
  toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
  toast.style.transition = 'opacity 0.2s ease';
  toast.style.opacity = '1';

  const colors = {
    info: '#0ea5e9',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444'
  };
  toast.style.background = colors[type] || colors.info;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      container.removeChild(toast);
    }, 200);
  }, timeout);
}

// Helper: find field by id or name or data-user-field
function findField(field) {
  return (
    document.getElementById(field) ||
    document.querySelector(`[name="${field}"]`) ||
    document.querySelector(`[data-user-field="${field}"]`)
  );
}

const BOT_CATALOG = [
  {
    id: 'bot_scalper',
    name: 'Basic Bot',
    price: 500,
    roiPctPerCycle: 5,
    cycleHours: 2,
    style: 'Steady compounding strategy',
    risk: 'Lower'
  },
  {
    id: 'bot_swing',
    name: 'Intermediate Bot',
    price: 1000,
    roiPctPerCycle: 10,
    cycleHours: 2,
    style: 'Faster compounding strategy',
    risk: 'Moderate'
  },
  {
    id: 'bot_ai_pro',
    name: 'Advanced Bot',
    price: 1500,
    roiPctPerCycle: 15,
    cycleHours: 2,
    style: 'Aggressive compounding strategy',
    risk: 'High'
  },
  {
    id: 'bot_quant_elite',
    name: 'Premium Bot',
    price: 2000,
    roiPctPerCycle: 20,
    cycleHours: 2,
    style: 'Maximum growth potential strategy',
    risk: 'Very High'
  }
];

const PROP_PLANS = [
  {
    planId: 'prop_10k',
    firmName: 'TitanTrades Prop',
    accountSize: 10000,
    feeUsd: 155,
    label: '$10,000 Evaluation'
  },
  {
    planId: 'prop_25k',
    firmName: 'TitanTrades Prop',
    accountSize: 25000,
    feeUsd: 250,
    label: '$25,000 Evaluation'
  },
  {
    planId: 'prop_50k',
    firmName: 'TitanTrades Prop',
    accountSize: 50000,
    feeUsd: 345,
    label: '$50,000 Evaluation'
  },
  {
    planId: 'prop_100k',
    firmName: 'TitanTrades Prop',
    accountSize: 100000,
    feeUsd: 540,
    label: '$100,000 Evaluation'
  },
  {
    planId: 'prop_200k',
    firmName: 'TitanTrades Prop',
    accountSize: 200000,
    feeUsd: 1080,
    label: '$200,000 Evaluation'
  }
];

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(Number(amount || 0));
}

async function prefillForm(user) {
  try {
    const cached = JSON.parse(localStorage.getItem('userProfileCache') || 'null');
    if (cached) {
      const dn = findField('displayName') || findField('fullName');
      const em = findField('email');
      const ph = findField('phoneNumber');
      if (dn) dn.value = cached.displayName || cached.fullName || '';
      if (em) em.value = cached.email || '';
      if (ph) ph.value = cached.phoneNumber || '';
    }
  } catch (_) {}

  const uid = user.uid;
  try {
    const profileRef = doc(db, 'profiles', uid);
    const profileSnap = await getDoc(profileRef);

    let data = profileSnap.exists() ? profileSnap.data() : null;
    if (!data) {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      data = userSnap.exists() ? userSnap.data() : {};
    }

    const profile = {
      uid,
      displayName: data.displayName || data.fullName || user.displayName || '',
      fullName: data.fullName || data.displayName || user.displayName || '',
      email: user.email || data.email || '',
      phoneNumber: data.phoneNumber || ''
    };

    const dn = findField('displayName') || findField('fullName');
    const em = findField('email');
    const ph = findField('phoneNumber');
    if (dn) dn.value = profile.displayName || profile.fullName || '';
    if (em) em.value = profile.email || '';
    if (ph) ph.value = profile.phoneNumber || '';

    try { localStorage.setItem('userProfileCache', JSON.stringify(profile)); } catch (_) {}
  } catch (err) {
    console.error('account.js: failed to prefill form:', err);
  }
}

async function saveChanges(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  const user = auth.currentUser;
  if (!user) {
    showToast('You are not signed in.', 'error');
    return;
  }

  const uid = user.uid;
  // Gather values from form
  const dnField = findField('displayName') || findField('fullName');
  const emField = findField('email');
  const phField = findField('phoneNumber');

  const updatedProfile = {
    displayName: dnField ? dnField.value.trim() : user.displayName || '',
    email: emField ? emField.value.trim() : user.email || '',
    phoneNumber: phField ? phField.value.trim() : ''
  };

  try {
    if (updatedProfile.displayName && updatedProfile.displayName !== (user.displayName || '')) {
      await updateProfile(user, { displayName: updatedProfile.displayName });
    }

    await setDoc(
      doc(db, 'profiles', uid),
      {
        displayName: updatedProfile.displayName,
        email: updatedProfile.email,
        phoneNumber: updatedProfile.phoneNumber,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );

    const merged = {
      uid,
      displayName: updatedProfile.displayName,
      fullName: updatedProfile.displayName,
      email: updatedProfile.email,
      phoneNumber: updatedProfile.phoneNumber
    };
    try { localStorage.setItem('userProfileCache', JSON.stringify(merged)); } catch (_) {}
    window.dispatchEvent(new CustomEvent('user-profile-changed', { detail: merged }));

    showToast('Profile saved successfully.', 'success');
  } catch (err) {
    console.error('account.js: failed to save changes:', err);
    showToast('Failed to save changes. Please try again.', 'error');
  }
}

function renderMarketplace(botsOwnedMap, balance) {
  const container = document.getElementById('bot-marketplace');
  if (!container) return;

  container.innerHTML = BOT_CATALOG.map((bot) => {
    const owned = !!botsOwnedMap?.[bot.id];
    const disabled = owned || Number(balance || 0) < bot.price;

    return `
      <div class="col-md-6">
        <div class="border rounded p-3 h-100" style="border-color:#e2e8f0!important; background:#ffffff;">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <div class="fw-semibold">${bot.name}</div>
              <div class="small text-secondary">${bot.style}</div>
              ${bot.roiPctPerCycle ? `<div class="small text-secondary">ROI: ${bot.roiPctPerCycle}% every ${bot.cycleHours || 2} hours</div>` : ''}
              <div class="small text-secondary">Risk: ${bot.risk}</div>
            </div>
            <div class="text-end">
              <div class="small text-secondary">Price</div>
              <div class="fw-semibold">${formatCurrency(bot.price)}</div>
            </div>
          </div>
          <div class="mt-3 d-grid">
            <button class="btn btn-${owned ? 'secondary' : 'primary'}" data-action="buy-bot" data-bot-id="${bot.id}" ${disabled ? 'disabled' : ''}>
              ${owned ? 'Owned' : 'Buy Bot'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderOwnedBots(botsOwnedMap) {
  const container = document.getElementById('owned-bots');
  if (!container) return;

  const bots = botsOwnedMap ? Object.values(botsOwnedMap) : [];
  if (!bots.length) {
    container.innerHTML = `<div class="text-secondary">No bots purchased yet.</div>`;
    return;
  }

  container.innerHTML = bots
    .sort((a, b) => Number(b.purchasedAt || 0) - Number(a.purchasedAt || 0))
    .map((bot) => {
      const isActive = !!bot.active;
      return `
        <div class="border rounded p-3 d-flex align-items-center justify-content-between" style="border-color:#e2e8f0!important; background:#ffffff;">
          <div>
            <div class="fw-semibold">${bot.name || bot.id}</div>
            <div class="small text-secondary">${isActive ? 'Active (runs on the trading platform)' : 'Inactive'}</div>
          </div>
          <div class="form-check form-switch m-0">
            <input class="form-check-input" type="checkbox" role="switch" data-action="toggle-bot" data-bot-id="${bot.id}" ${isActive ? 'checked' : ''}>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderPropCurrent(propAccount) {
  const container = document.getElementById('prop-current');
  if (!container) return;

  if (!propAccount) {
    container.innerHTML = `<div class="text-secondary">No prop account selected yet.</div>`;
    return;
  }

  const status = propAccount.status || 'evaluation';
  const phase = Number(propAccount.phase || 1);
  const stageLabel =
    status === 'breached'
      ? 'Breached'
      : status === 'funded' || phase === 3
        ? 'FTMO Account (Funded stage)'
        : phase === 2
          ? 'Verification (Phase 2)'
          : 'Challenge (Phase 1)';

  const accountSize = Number(propAccount.accountSize || 0);
  const dailyLimit = accountSize * Number(propAccount.dailyDrawdownPct || 0);
  const maxLimit = accountSize * Number(propAccount.maxDrawdownPct || 0);
  const profitTargetPct = Number(propAccount.profitTargetPct || 0);
  const profitTargetUsd = profitTargetPct > 0 ? accountSize * profitTargetPct : 0;
  const minTradingDays = Number(propAccount.minTradingDays || 0);
  const timeLimitDays = Number(propAccount.timeLimitDays || 0);
  const phaseStartedAt = Number(propAccount.phaseStartedAt || propAccount.createdAt || 0);
  const elapsedDays = phaseStartedAt ? Math.floor((Date.now() - phaseStartedAt) / 86400000) : 0;
  const daysRemaining = timeLimitDays > 0 ? Math.max(0, timeLimitDays - elapsedDays) : 0;
  const tradingDaysCount = Array.isArray(propAccount.tradingDays) ? propAccount.tradingDays.length : Number(propAccount.tradingDaysCount || 0);

  container.innerHTML = `
    <div class="border rounded p-3" style="border-color:#e2e8f0!important; background:#ffffff;">
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <div class="fw-semibold">${propAccount.firmName || 'Prop Account'} • ${formatCurrency(propAccount.accountSize)}</div>
          <div class="small text-secondary">Stage: ${stageLabel}</div>
        </div>
        <div class="text-end">
          <div class="small text-secondary">Equity</div>
          <div class="fw-semibold">${formatCurrency(propAccount.currentEquity ?? propAccount.accountSize)}</div>
        </div>
      </div>
      <div class="row mt-3 g-2">
        <div class="col-md-4">
          <div class="small text-secondary">Daily Drawdown</div>
          <div class="fw-semibold">${formatCurrency(dailyLimit)}</div>
        </div>
        <div class="col-md-4">
          <div class="small text-secondary">Max Drawdown</div>
          <div class="fw-semibold">${formatCurrency(maxLimit)}</div>
        </div>
        <div class="col-md-4">
          <div class="small text-secondary">Profit Target</div>
          <div class="fw-semibold">${profitTargetUsd ? formatCurrency(profitTargetUsd) : '—'}</div>
        </div>
        <div class="col-md-4">
          <div class="small text-secondary">Trading Days</div>
          <div class="fw-semibold">${tradingDaysCount || 0} / ${minTradingDays || '—'}</div>
        </div>
        <div class="col-md-4">
          <div class="small text-secondary">Time Limit</div>
          <div class="fw-semibold">${timeLimitDays ? `${daysRemaining} days left` : '—'}</div>
        </div>
        <div class="col-md-4">
          <div class="small text-secondary">Fee (Refundable)</div>
          <div class="fw-semibold">${propAccount.feeUsd ? formatCurrency(propAccount.feeUsd) : '—'}</div>
        </div>
      </div>
    </div>
  `;
}

function renderPropOptions(propAccount) {
  const container = document.getElementById('prop-options');
  if (!container) return;

  container.innerHTML = PROP_PLANS.map((plan) => {
    const isCurrent = propAccount?.planId === plan.planId;
    return `
      <div class="col-md-6">
        <div class="border rounded p-3 h-100" style="border-color:#e2e8f0!important; background:#ffffff;">
          <div class="fw-semibold">${plan.label}</div>
          <div class="small text-secondary">Fee (Refundable): ${formatCurrency(plan.feeUsd)}</div>
          <div class="small text-secondary">Phase 1 target: 10% • Phase 2 target: 5%</div>
          <div class="small text-secondary">Daily drawdown: 5% • Max drawdown: 10%</div>
          <div class="small text-secondary">Minimum trading days: 4</div>
          <div class="mt-3 d-grid">
            <button class="btn btn-${isCurrent ? 'secondary' : 'primary'}" data-action="select-prop" data-plan-id="${plan.planId}">
              ${isCurrent ? 'Selected' : 'Select'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function refreshBotsAndProp(uid) {
  const balanceResult = await FirebaseDatabaseService.getUserBalance(uid);
  const entitlementsResult = await FirebaseDatabaseService.getUserEntitlements(uid);

  const balance = balanceResult.success ? balanceResult.balance : 0;
  const botsOwnedMap = entitlementsResult.success ? entitlementsResult.data.botsOwned : {};
  const propAccount = entitlementsResult.success ? entitlementsResult.data.propAccount : null;

  const balanceEl = document.getElementById('bots-available-balance');
  if (balanceEl) balanceEl.textContent = formatCurrency(balance);

  renderMarketplace(botsOwnedMap, balance);
  renderOwnedBots(botsOwnedMap);
  renderPropCurrent(propAccount);
  renderPropOptions(propAccount);
}

function bindActions() {
  document.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const action = target.getAttribute('data-action');
    if (!action) return;

    const user = auth.currentUser;
    if (!user) {
      showToast('Please sign in to continue.', 'warning');
      return;
    }

    if (action === 'buy-bot') {
      const botId = target.getAttribute('data-bot-id');
      const bot = BOT_CATALOG.find((b) => b.id === botId);
      if (!bot) return;

      target.setAttribute('disabled', 'disabled');
      const result = await FirebaseDatabaseService.purchaseBot(user.uid, bot);
      if (result.success) {
        showToast(`${bot.name} purchased successfully.`, 'success');
      } else if (result.error === 'insufficient_funds') {
        showToast('Insufficient funds to buy this bot.', 'error');
      } else if (result.error === 'already_owned') {
        showToast('You already own this bot.', 'warning');
      } else {
        showToast('Unable to purchase bot right now.', 'error');
      }
      await refreshBotsAndProp(user.uid);
      return;
    }

    if (action === 'select-prop') {
      const planId = target.getAttribute('data-plan-id');
      const plan = PROP_PLANS.find((p) => p.planId === planId);
      if (!plan) return;

      target.setAttribute('disabled', 'disabled');
      const result = await FirebaseDatabaseService.setPropAccount(user.uid, plan);
      if (result.success) {
        showToast('Prop account selected.', 'success');
      } else if (result.error === 'insufficient_funds') {
        showToast('Insufficient funds to pay the prop fee.', 'error');
      } else if (result.error === 'already_has_prop') {
        showToast('You already have an active prop account.', 'warning');
      } else {
        showToast('Unable to select prop account right now.', 'error');
      }
      await refreshBotsAndProp(user.uid);
      return;
    }
  });

  document.addEventListener('change', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.getAttribute('data-action') !== 'toggle-bot') return;

    const user = auth.currentUser;
    if (!user) {
      showToast('Please sign in to continue.', 'warning');
      return;
    }

    const botId = target.getAttribute('data-bot-id');
    const active = target.checked;
    const result = await FirebaseDatabaseService.setBotActive(user.uid, botId, active);
    if (result.success) {
      showToast(active ? 'Bot activated.' : 'Bot deactivated.', 'success');
    } else {
      showToast('Unable to update bot status.', 'error');
    }
    await refreshBotsAndProp(user.uid);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const form =
    document.getElementById('account-form') ||
    document.querySelector('form#account-form') ||
    document.querySelector('form');

  if (form) form.addEventListener('submit', saveChanges);

  const saveBtn =
    document.getElementById('save-button') ||
    document.querySelector('[data-action="save-profile"]');

  if (saveBtn) saveBtn.addEventListener('click', saveChanges);

  bindActions();

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    await prefillForm(user);
    await refreshBotsAndProp(user.uid);
  });
});
