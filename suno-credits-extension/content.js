// Content script - displays Suno credits in the sidebar navigation.
// Gets cached data from the background service worker (refreshed every minute,
// plus throttled on-demand fetches) and re-renders on SPA navigations.

let creditsContainer = null;
let lastUrl = location.href;
let renderInFlight = false;
let firstRenderDone = false; // fade-in animation only on the initial page-load render

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  fetchCreditsAndRender();

  // Live updates pushed by the background worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CREDITS_UPDATED') {
      renderCredits(message.data);
    }
  });

  // Re-insert if Suno's React re-render wipes our node
  setupObserver();

  // Re-render on SPA navigations (Suno is a Next.js SPA)
  setupNavigationHooks();

  // Poll for near-live updates; the background throttles real network fetches
  setInterval(fetchCreditsAndRender, 20000);

  // Initial render attempts while the sidebar is still mounting
  setTimeout(fetchCreditsAndRender, 1000);
  setTimeout(fetchCreditsAndRender, 3000);
}

// Find the sidebar nav container. Suno currently renders two
// `div.flex.flex-col.gap-px.px-3` blocks; the top one holds the main
// section links (Home/Explore/Create/Studio/Library).
function findSidebarNav() {
  const candidates = document.querySelectorAll('div.flex.flex-col.gap-px.px-3');
  for (const c of candidates) {
    if (c.querySelector('a[href="/create"], a[href="/discover"], a[href="/explore"]')) {
      return c;
    }
  }
  if (candidates.length > 0) return candidates[0];
  // Fallbacks in case the class names change again
  const nav = document.querySelector('aside nav, nav');
  return nav || null;
}

async function fetchCreditsAndRender() {
  if (renderInFlight) return; // avoid overlapping renders appending duplicates
  renderInFlight = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CREDITS' });
    renderCredits(response);
  } catch (error) {
    console.error('[Suno Credits] Failed to get credits:', error);
    renderCredits(null);
  } finally {
    renderInFlight = false;
  }
}

function setupObserver() {
  if (!document.body) {
    setTimeout(setupObserver, 500);
    return;
  }
  const observer = new MutationObserver(() => {
    if (creditsContainer && !document.contains(creditsContainer)) {
      creditsContainer = null;
      fetchCreditsAndRender();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function setupNavigationHooks() {
  const wrap = (type) => {
    const orig = history[type];
    if (typeof orig !== 'function') return;
    history[type] = function (...args) {
      const result = orig.apply(this, args);
      setTimeout(fetchCreditsAndRender, 300);
      return result;
    };
  };
  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', () => setTimeout(fetchCreditsAndRender, 300));
  // URL watcher as a catch-all for client-side routing
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      fetchCreditsAndRender();
    }
  }, 1000);
}

function formatNumber(num) {
  return Number(num || 0).toLocaleString();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Insert the credits card after the last top-level nav link.
// IMPORTANT: only consider *direct child* anchors (`:scope > a`). Using
// querySelectorAll('a[href]') picks up anchors nested inside the profile
// split-button, whose nextSibling is NOT a child of the sidebar container -
// that made insertBefore throw NotFoundError.
function insertContainer(sidebarNav) {
  const directLinks = sidebarNav.querySelectorAll(':scope > a[href]');
  const lastLink = directLinks.length > 0 ? directLinks[directLinks.length - 1] : null;
  try {
    if (lastLink) {
      lastLink.after(creditsContainer);
      return;
    }
  } catch (e) {
    // fall through to append
  }
  try {
    sidebarNav.appendChild(creditsContainer);
  } catch (e) {
    console.error('[Suno Credits] Failed to insert credits container:', e);
  }
}

function renderCredits(data) {
  const sidebarNav = findSidebarNav();
  if (!sidebarNav) {
    // Sidebar not mounted yet - retry shortly
    setTimeout(() => renderCredits(data), 500);
    return;
  }

  // Remove any existing containers (tracked or orphaned duplicates)
  document.querySelectorAll('.suno-credits-display').forEach(n => n.remove());
  creditsContainer = null;

  // Error state (no data at all)
  if (!data || (data.error && data.daily_credits_left === undefined && data.credits_left === undefined)) {
    showErrorState(sidebarNav, (data && data.error) || 'Failed to load credits');
    return;
  }

  const dailyLeft = Number(data.daily_credits_left !== undefined ? data.daily_credits_left : (data.credits_left || 0));
  const usage = Number(data.daily_usage || 0);
  const limit = Number(data.daily_limit || 0);
  const backup = Number(data.backup_credits !== undefined ? data.backup_credits : (data.credits_left || 0));
  const total = Number(data.total_credits_left || (backup + dailyLeft));
  const isActive = !!data.is_active;
  const isPastDue = !!data.is_past_due;

  creditsContainer = el('div', 'suno-credits-display');
  // Animate only the first render on page load; all later updates are instant
  if (!firstRenderDone) {
    creditsContainer.classList.add('sc-animate');
    firstRenderDone = true;
  }

  const box = el('div', 'sc-box');

  // Header row: label + big daily-credits number
  const header = el('div', 'sc-row sc-header');
  header.appendChild(el('span', 'sc-label', 'Daily credits'));
  header.appendChild(el('span', 'sc-value sc-value-big', formatNumber(dailyLeft)));
  box.appendChild(header);

  // Daily usage progress bar
  const usagePct = limit > 0 ? Math.min(100, (usage / limit) * 100) : 0;
  const usageRow = el('div', 'sc-usage');
  const usageTop = el('div', 'sc-row sc-usage-top');
  usageTop.appendChild(el('span', 'sc-label', 'Daily usage'));
  usageTop.appendChild(el('span', 'sc-label', `${formatNumber(usage)} / ${formatNumber(limit)}`));
  const bar = el('div', 'sc-bar');
  const fill = el('div', 'sc-bar-fill' + (isActive ? ' sc-active' : ''));
  fill.style.width = usagePct + '%';
  bar.appendChild(fill);
  usageRow.appendChild(usageTop);
  usageRow.appendChild(bar);
  box.appendChild(usageRow);

  // Backup balance (top-ups) - only show if non-zero
  if (backup > 0) {
    const backupRow = el('div', 'sc-row sc-sub');
    backupRow.appendChild(el('span', 'sc-label', 'Backup balance'));
    backupRow.appendChild(el('span', 'sc-label', formatNumber(backup)));
    box.appendChild(backupRow);
  }

  // Total available
  if (total > dailyLeft) {
    const totalRow = el('div', 'sc-row sc-sub');
    totalRow.appendChild(el('span', 'sc-label', 'Total available'));
    totalRow.appendChild(el('span', 'sc-label', formatNumber(total)));
    box.appendChild(totalRow);
  }

  // Subscription / status line
  if (isPastDue) {
    box.appendChild(el('div', 'sc-status sc-past-due', 'Payment past due'));
  } else if (isActive) {
    box.appendChild(el('div', 'sc-status sc-active', 'Subscription active'));
  }

  // Last updated timestamp
  if (data.lastUpdated) {
    const updated = el('div', 'sc-updated', 'Updated ' + new Date(data.lastUpdated).toLocaleTimeString());
    box.appendChild(updated);
  }

  creditsContainer.appendChild(box);
  insertContainer(sidebarNav);
}

function showErrorState(sidebarNav, message) {
  document.querySelectorAll('.suno-credits-display').forEach(n => n.remove());
  creditsContainer = el('div', 'suno-credits-display suno-credits-error', message || 'Error loading credits');
  insertContainer(sidebarNav);
}
