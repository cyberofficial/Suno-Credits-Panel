// Popup script for Suno Credits extension popup

const STORAGE_KEY = 'suno_credits_data';

let refreshBtn = null;
let creditsEl = null;
let usageEl = null;
let barFillEl = null;
let backupRow = null;
let backupEl = null;
let totalRow = null;
let totalEl = null;
let statusEl = null;
let updatedEl = null;
let errorEl = null;

document.addEventListener('DOMContentLoaded', () => {
  refreshBtn = document.getElementById('refreshBtn');
  creditsEl = document.getElementById('credits');
  usageEl = document.getElementById('usage');
  barFillEl = document.getElementById('barFill');
  backupRow = document.getElementById('backupRow');
  backupEl = document.getElementById('backup');
  totalRow = document.getElementById('totalRow');
  totalEl = document.getElementById('total');
  statusEl = document.getElementById('status');
  updatedEl = document.getElementById('updated');
  errorEl = document.getElementById('error');

  refreshBtn.addEventListener('click', handleRefresh);

  // Load initial data
  loadCredits();

  // Near-live updates while the popup is open
  setInterval(loadCredits, 15000);
});

// Load credits from background cache
async function loadCredits() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CREDITS' });
    renderCredits(response);
  } catch (error) {
    console.error('[Suno Credits Popup] Failed to load:', error);
    showError('Failed to load credits');
  }
}

// Handle refresh button click
async function handleRefresh() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Refreshing...';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'FORCE_REFRESH' });
    renderCredits(response);
  } catch (error) {
    console.error('[Suno Credits Popup] Refresh failed:', error);
    showError('Refresh failed');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh';
  }
}

const formatNumber = (num) => Number(num || 0).toLocaleString();

// Render credits data in popup
function renderCredits(data) {
  hideError();

  // Error with no usable data
  if (!data || (data.error && data.daily_credits_left === undefined && data.credits_left === undefined)) {
    showError((data && data.error) || 'Unknown error');
    return;
  }

  const dailyLeft = Number(data.daily_credits_left !== undefined ? data.daily_credits_left : (data.credits_left || 0));
  const usage = Number(data.daily_usage || 0);
  const limit = Number(data.daily_limit || 0);
  const backup = Number(data.backup_credits !== undefined ? data.backup_credits : (data.credits_left || 0));
  const total = Number(data.total_credits_left || (backup + dailyLeft));
  const isActive = !!data.is_active;
  const isPastDue = !!data.is_past_due;

  creditsEl.classList.remove('loading');
  creditsEl.textContent = formatNumber(dailyLeft);

  usageEl.textContent = `${formatNumber(usage)} / ${formatNumber(limit)}`;
  const pct = limit > 0 ? Math.min(100, (usage / limit) * 100) : 0;
  barFillEl.style.width = pct + '%';

  if (backup > 0) {
    backupRow.style.display = 'flex';
    backupEl.textContent = formatNumber(backup);
  } else {
    backupRow.style.display = 'none';
  }

  if (total > dailyLeft) {
    totalRow.style.display = 'flex';
    totalEl.textContent = formatNumber(total);
  } else {
    totalRow.style.display = 'none';
  }

  statusEl.className = 'status';
  if (isPastDue) {
    statusEl.textContent = 'Payment past due';
    statusEl.classList.add('past-due');
  } else if (isActive) {
    statusEl.textContent = 'Subscription active';
    statusEl.classList.add('active');
  } else {
    statusEl.textContent = '';
  }

  if (data.lastUpdated) {
    updatedEl.textContent = 'Updated ' + new Date(data.lastUpdated).toLocaleTimeString();
  }
}

// Show error message
function showError(message) {
  creditsEl.classList.remove('loading');
  creditsEl.textContent = '--';
  usageEl.textContent = '-- / --';
  barFillEl.style.width = '0';
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

// Hide error message
function hideError() {
  errorEl.textContent = '';
  errorEl.style.display = 'none';
}

// Live updates pushed from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CREDITS_UPDATED') {
    renderCredits(message.data);
  }
});
