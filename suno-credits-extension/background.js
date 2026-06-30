// Background service worker for Suno Credits extension
// Periodically fetches and caches user credits

const API_URL = 'https://studio-api-prod.suno.com/api/billing/info/';
const STORAGE_KEY = 'suno_credits_data';
const REFRESH_INTERVAL_MINUTES = 1;

// Initialize alarm on extension install/update/startup
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Suno Credits] Extension installed/updated');
  chrome.alarms.create('refreshCredits', { periodInMinutes: REFRESH_INTERVAL_MINUTES });
  fetchAndStoreCredits(); // Initial fetch
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Suno Credits] Extension started');
  // Ensure alarm exists
  chrome.alarms.get('refreshCredits', (alarm) => {
    if (!alarm) {
      chrome.alarms.create('refreshCredits', { periodInMinutes: REFRESH_INTERVAL_MINUTES });
    }
    fetchAndStoreCredits();
  });
});

// Handle alarm triggers
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === 'refreshCredits') {
    console.log('[Suno Credits] Refreshing credits via alarm');
    fetchAndStoreCredits();
  }
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CREDITS') {
    getStoredCredits().then(data => {
      sendResponse(data);
    });
    return true; // Indicates async response
  }

  if (message.type === 'FORCE_REFRESH') {
    fetchAndStoreCredits().then(() => {
      getStoredCredits().then(data => {
        sendResponse(data);
      });
    });
    return true;
  }
});

// Fetch credits from Suno API and store in chrome.storage.local
async function fetchAndStoreCredits() {
  try {
    // Get the session cookie for authentication
    const cookies = await chrome.cookies.getAll({
      domain: 'suno.com',
      name: '__session'
    });

    if (cookies.length === 0) {
      console.log('[Suno Credits] No session found - user not logged in');
      await storeCreditsData({
        credits_left: 0,
        total_credits_left: 0,
        monthly_usage: 0,
        monthly_limit: 50,
        is_active: false,
        subscription_type: false,
        error: 'Not logged in to Suno',
        lastUpdated: Date.now()
      });
      return;
    }

    const sessionJWT = cookies[0].value;

    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${sessionJWT}`
      },
      mode: 'cors'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    const creditsData = {
      credits_left: data.credits || 0,
      total_credits_left: data.total_credits_left || 0,
      monthly_usage: data.monthly_usage || 0,
      monthly_limit: data.monthly_limit || 50,
      is_active: data.is_active || false,
      subscription_type: data.subscription_type || false,
      lastUpdated: Date.now()
    };

    await storeCreditsData(creditsData);
    console.log('[Suno Credits] Credits updated:', creditsData);

    // Notify content scripts and popup of update
    broadcastCreditsUpdate(creditsData);

  } catch (error) {
    console.error('[Suno Credits] Failed to fetch credits:', error);
    // Update stored data with error but keep previous values if available
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
    credits_left: 0,
    total_credits_left: 0,
    monthly_usage: 0,
    monthly_limit: 50,
    is_active: false,
    subscription_type: false,
    error: 'No data yet',
    lastUpdated: 0
  };
}

// Broadcast updates to all open tabs and extension views
function broadcastCreditsUpdate(data) {
  // Notify content scripts in Suno tabs
  chrome.tabs.query({ url: 'https://suno.com/*' }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'CREDITS_UPDATED',
        data: data
      }).catch(() => {}); // Ignore errors for closed/invalid tabs
    });
  });

  // Notify extension views (popup, sidepanel if enabled)
  chrome.runtime.sendMessage({
    type: 'CREDITS_UPDATED',
    data: data
  }).catch(() => {}); // Ignore if no listeners
}