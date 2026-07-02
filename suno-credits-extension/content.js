// Content script - displays Suno credits in the sidebar navigation
// Gets cached data from background service worker (updated every minute)

let creditsContainer = null;
let observer = null;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  // Fetch and render initial credits
  fetchCreditsAndRender();

  // Listen for updates from background service worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CREDITS_UPDATED') {
      renderCredits(message.data);
    }
  });

  // Watch for sidebar changes (navigation collapse/expand)
  setupSidebarObserver();
}

async function fetchCreditsAndRender() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CREDITS' });
    renderCredits(response);
  } catch (error) {
    console.error('[Suno Credits] Failed to get credits:', error);
    // Show error state in UI
    showErrorState();
  }
}

function setupSidebarObserver() {
  // Watch for the sidebar nav container
  const sidebarNav = document.querySelector('div.flex.flex-col.gap-px.px-3');
  if (sidebarNav) {
    observer = new MutationObserver(() => {
      // Re-render if our container was removed
      if (creditsContainer && !document.contains(creditsContainer)) {
        creditsContainer = null;
        fetchCreditsAndRender();
      }
    });
    observer.observe(sidebarNav, { childList: true, subtree: true });
  }
}

function renderCredits(data) {
  // Find the sidebar navigation container
  const sidebarNav = document.querySelector('div.flex.flex-col.gap-px.px-3');
  if (!sidebarNav) {
    // Retry after a short delay if sidebar not ready yet
    setTimeout(() => renderCredits(data), 500);
    return;
  }

  // Remove existing credits container if present
  if (creditsContainer && creditsContainer.parentNode) {
    creditsContainer.parentNode.removeChild(creditsContainer);
  }

  // Check for error state
  if (data.error && (!data.credits_left && data.credits_left !== 0)) {
    showErrorState(sidebarNav, data.error);
    return;
  }

  // Create credits display element matching the sidebar button style
  creditsContainer = document.createElement('div');
  creditsContainer.className = 'suno-credits-display';
  creditsContainer.style.cssText = `
    margin-top: 8px;
    padding: 8px 12px;
    background: var(--color-background-glass-dense, rgba(0,0,0,0.1));
    border-radius: 8px;
    border: 1px solid var(--color-border-secondary, rgba(255,255,255,0.1));
    font-family: inherit;
  `;

  const creditsLeft = data.credits_left || 0;
  const totalCredits = data.total_credits_left || 0;
  const dailyUsage = data.daily_usage || 0;
  const dailyLimit = data.daily_limit || 50;
  const isActive = data.is_active || false;

  // Format numbers with commas
  const formatNumber = (num) => num.toLocaleString();

  let html = `
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 12px; color: var(--color-foreground-tertiary, #888); font-weight: 500;">
          Credits
        </span>
        <span style="font-size: 14px; font-weight: 600; color: var(--color-foreground-primary, #fff);">
          ${formatNumber(creditsLeft)}
        </span>
      </div>
  `;

  // Add total credits if different (includes top-ups)
  if (totalCredits > creditsLeft) {
    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--color-foreground-tertiary, #888);">
        <span>Total (with top-ups)</span>
        <span>${formatNumber(totalCredits)}</span>
      </div>
    `;
  }

  // Daily usage bar
  const usagePercent = dailyLimit > 0 ? Math.min(100, (dailyUsage / dailyLimit) * 100) : 0;
  html += `
      <div style="font-size: 11px; color: var(--color-foreground-tertiary, #888);">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span>Daily Usage</span>
          <span>${formatNumber(dailyUsage)} / ${formatNumber(dailyLimit)}</span>
        </div>
        <div style="height: 4px; background: var(--color-border-secondary, rgba(255,255,255,0.1)); border-radius: 2px; overflow: hidden;">
          <div style="width: ${usagePercent}%; height: 100%; background: ${isActive ? 'var(--color-primary, #fd429c)' : 'var(--color-foreground-tertiary, #888)'}; border-radius: 2px; transition: width 0.3s ease;"></div>
        </div>
      </div>
  `;

  // Last updated timestamp
  if (data.lastUpdated) {
    const lastUpdated = new Date(data.lastUpdated).toLocaleTimeString();
    html += `
      <div style="font-size: 10px; color: var(--color-foreground-quaternary, #666); text-align: right;">
        Updated: ${lastUpdated}
      </div>
    `;
  }

  html += '</div>';
  creditsContainer.innerHTML = html;

  // Insert after the navigation buttons (as the 6th child or at the end)
  const navButtons = sidebarNav.querySelectorAll('a[href]');
  if (navButtons.length > 0) {
    // Insert after the last nav button
    const lastButton = navButtons[navButtons.length - 1];
    if (lastButton.nextSibling) {
      sidebarNav.insertBefore(creditsContainer, lastButton.nextSibling);
    } else {
      sidebarNav.appendChild(creditsContainer);
    }
  } else {
    sidebarNav.appendChild(creditsContainer);
  }
}

function showErrorState(sidebarNav, message = 'Failed to load credits') {
  // Remove existing container
  if (creditsContainer && creditsContainer.parentNode) {
    creditsContainer.parentNode.removeChild(creditsContainer);
  }

  creditsContainer = document.createElement('div');
  creditsContainer.className = 'suno-credits-display error-state';
  creditsContainer.style.cssText = `
    margin-top: 8px;
    padding: 8px 12px;
    background: var(--color-background-glass-dense, rgba(0,0,0,0.1));
    border-radius: 8px;
    border: 1px solid var(--color-border-secondary, rgba(255,255,255,0.1));
    font-family: inherit;
    color: var(--color-destructive, #ff6b6b);
    font-size: 11px;
    text-align: center;
  `;
  creditsContainer.textContent = message || 'Error loading credits';

  // Insert after navigation buttons
  const navButtons = sidebarNav.querySelectorAll('a[href]');
  if (navButtons.length > 0) {
    const lastButton = navButtons[navButtons.length - 1];
    if (lastButton.nextSibling) {
      sidebarNav.insertBefore(creditsContainer, lastButton.nextSibling);
    } else {
      sidebarNav.appendChild(creditsContainer);
    }
  } else {
    sidebarNav.appendChild(creditsContainer);
  }
}

// Handle sidebar collapse/expand
document.addEventListener('click', (e) => {
  // If sidebar toggle clicked, re-render after animation
  if (e.target.closest('[aria-label*="sidebar"], [data-testid*="sidebar"], button[aria-expanded]')) {
    setTimeout(() => fetchCreditsAndRender(), 300);
  }
});

// Initial render attempt
setTimeout(fetchCreditsAndRender, 1000);