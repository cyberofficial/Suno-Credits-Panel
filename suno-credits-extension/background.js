// Background service worker for Suno Credits extension
// Periodically fetches and caches user credits from Suno's billing API.
//
// Suno's billing API (as of Nov 2026) lives at:
//   https://suno.com/a/api/billing/info/   (current, same-origin)
//   https://studio-api-prod.suno.com/api/billing/info/  (legacy fallback)
// Both accept `Authorization: Bearer <__session cookie>`.
//
// Response fields that matter:
//   monthly_limit   - daily credit allowance (resets at midnight UTC despite the name)
//   monthly_usage   - credits used today
//   credits         - backup/top-up balance, only spent after the daily allowance runs out
//   total_credits_left = credits + (monthly_limit - monthly_usage)
// So: daily credits left = monthly_limit - monthly_usage

const API_URLS = [
  'https://suno.com/a/api/billing/info/',
  'https://studio-api-prod.suno.com/api/billing/info/'
];
const STORAGE_KEY = 'suno_credits_data';
const REFRESH_INTERVAL_MINUTES = 1;
const MIN_FETCH_INTERVAL_MS = 10 * 1000; // throttle real network fetches (polls answer from cache)

let lastFetchAt = 0;

// Initialize alarm on extension install/update/startup
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Suno Credits] Extension installed/updated');
  chrome.alarms.create('refreshCredits', { periodInMinutes: REFRESH_INTERVAL_MINUTES });
  fetchAndStoreCredits(true); // Initial fetch (forced)
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Suno Credits] Extension started');
  chrome.alarms.get('refreshCredits', (alarm) => {
    if (!alarm) {
      chrome.alarms.create('refreshCredits', { periodInMinutes: REFRESH_INTERVAL_MINUTES });
    }
  });
  fetchAndStoreCredits(true);
});

// Handle alarm triggers (the periodic "live update" push)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === 'refreshCredits') {
    console.log('[Suno Credits] Refreshing credits via alarm');
    fetchAndStoreCredits(false);
  }
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CREDITS') {
    // Poll path: kick a real fetch only if the throttle window has passed,
    // but always answer immediately from the cache so the UI stays snappy.
    if (Date.now() - lastFetchAt > MIN_FETCH_INTERVAL_MS) {
      fetchAndStoreCredits(false);
    }
    getStoredCredits().then(data => sendResponse(data));
    return true; // async response
  }

  if (message.type === 'FORCE_REFRESH') {
    fetchAndStoreCredits(true)
      .then(() => getStoredCredits())
      .then(data => sendResponse(data));
    return true;
  }
});

// All Clerk session cookies for suno.com (there may be several keyed variants)
async function getSessionTokens() {
  const cookies = await chrome.cookies.getAll({ domain: 'suno.com' });
  return cookies
    .filter(c => c.name === '__session' || c.name.startsWith('__session_'))
    .map(c => c.value)
    .filter(Boolean);
}

// Try each endpoint with each token until one returns 200
async function fetchBillingInfo(tokens) {
  let lastError = null;
  for (const url of API_URLS) {
    for (const token of tokens) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include'
        });
        if (response.ok) {
          return { data: await response.json(), url };
        }
        lastError = new Error(`HTTP ${response.status} from ${url}`);
      } catch (e) {
        lastError = e;
      }
    }
  }
  throw lastError || new Error('No session tokens available');
}

// Fetch credits from Suno API and store in chrome.storage.local
async function fetchAndStoreCredits(force = false) {
  if (!force && Date.now() - lastFetchAt < MIN_FETCH_INTERVAL_MS) {
    return; // throttled; cache is fresh enough
  }
  lastFetchAt = Date.now();

  try {
    const tokens = await getSessionTokens();

    if (tokens.length === 0) {
      console.log('[Suno Credits] No session found - user not logged in');
      const prev = await getStoredCredits();
      await storeCreditsData({
        ...prev,
        error: 'Not logged in to Suno',
        lastUpdated: Date.now()
      });
      return;
    }

    const { data, url } = await fetchBillingInfo(tokens);

    const monthlyLimit = Number(data.monthly_limit) || 0;
    const monthlyUsage = Number(data.monthly_usage) || 0;
    const dailyCreditsLeft = Math.max(0, monthlyLimit - monthlyUsage);
    const backupCredits = Number(data.credits) || 0;

    const creditsData = {
      daily_credits_left: dailyCreditsLeft,
      daily_usage: monthlyUsage,
      daily_limit: monthlyLimit,
      backup_credits: backupCredits,
      // legacy keys kept so old cached UIs still render something sane
      credits_left: backupCredits,
      total_credits_left: Number(data.total_credits_left) || (backupCredits + dailyCreditsLeft),
      visuals_credits_left: Number(data.visuals_credits_left) || 0,
      is_active: !!data.is_active,
      is_past_due: !!data.is_past_due,
      subscription_type: data.subscription_type || false,
      endpoint: url,
      error: null,
      lastUpdated: Date.now()
    };

    await storeCreditsData(creditsData);
    console.log('[Suno Credits] Credits updated:', creditsData);

    broadcastCreditsUpdate(creditsData);

  } catch (error) {
    console.error('[Suno Credits] Failed to fetch credits:', error);
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const errorData = {
      ...(stored[STORAGE_KEY] || {}),
      error: error.message,
      lastUpdated: Date.now()
    };
    await storeCreditsData(errorData);
  }
}

// Helper to store credits data
async function storeCreditsData(data) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

// Helper to get stored credits data
async function getStoredCredits() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {
    daily_credits_left: 0,
    daily_usage: 0,
    daily_limit: 0,
    backup_credits: 0,
    credits_left: 0,
    total_credits_left: 0,
    visuals_credits_left: 0,
    is_active: false,
    is_past_due: false,
    subscription_type: false,
    error: 'No data yet',
    lastUpdated: 0
  };
}

// Broadcast updates to all open Suno tabs and extension views
function broadcastCreditsUpdate(data) {
  chrome.tabs.query({ url: 'https://suno.com/*' }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'CREDITS_UPDATED',
        data: data
      }).catch(() => {}); // Ignore errors for closed/invalid tabs
    });
  });

  chrome.runtime.sendMessage({
    type: 'CREDITS_UPDATED',
    data: data
  }).catch(() => {}); // Ignore if no listeners
}
