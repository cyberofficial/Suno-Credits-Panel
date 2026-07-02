// Popup script for Suno Credits extension popup

const STORAGE_KEY = 'suno_credits_data';

let refreshBtn = null;
let creditsEl = null;
let usageEl = null;
let errorEl = null;

document.addEventListener('DOMContentLoaded', () => {
  refreshBtn = document.getElementById('refreshBtn');
  creditsEl = document.getElementById('credits');
  usageEl = document.getElementById('usage');
  errorEl = document.getElementById('error');

  refreshBtn.addEventListener('click', handleRefresh);

  // Load initial data
  loadCredits();
});

// Load credits from storage
async function loadCredits() {
  showLoading();

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

// Render credits data in popup
function renderCredits(data) {
  hideError();
  hideLoading();

  // Check if we have an error but no data
  if (data.error && (!data.credits_left && data.credits_left !== 0)) {
    showError(data.error || 'Unknown error');
    return;
  }

  const creditsLeft = data.credits_left || 0;
  const totalCredits = data.total_credits_left || 0;
  const dailyUsage = data.daily_usage || 0;
  const dailyLimit = data.daily_limit || 50;
  const isActive = data.is_active || false;

  // Format numbers with commas
  const formatNumber = (num) => num.toLocaleString();

  // Display main credits
  creditsEl.textContent = formatNumber(creditsLeft);

  // Display usage
  usageEl.textContent = `Daily usage: ${formatNumber(dailyUsage)} / ${formatNumber(dailyLimit)}`;

  // Add subscription indicator if applicable
  if (isActive) {
    usageEl.textContent += ' • Active subscription';
  }
}

// Show loading state
function showLoading() {
  creditsEl.textContent = 'Loading...';
  usageEl.textContent = '';
  hideError();
}

// Hide loading state
function hideLoading() {
  // Loading state is implicit in the text content
}

// Show error message
function showError(message) {
  creditsEl.textContent = '--';
  usageEl.textContent = '';
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

// Hide error message
function hideError() {
  errorEl.textContent = '';
  errorEl.style.display = 'none';
}

// Listen for updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CREDITS_UPDATED') {
    renderCredits(message.data);
  }
});