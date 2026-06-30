# Suno Credits Display - Chrome Extension

## Overview
A Chrome extension that displays your Suno AI credits in the sidebar navigation and extension popup, with automatic updates every minute to prevent API abuse.

## Current Status
- **Chrome Web Store**: Store page will be released once the page is live
- **Firefox Support**: Will come later (Firefox manifest V3 support pending)

## Features
- Shows current credit balance in Suno's sidebar navigation
- Displays monthly usage with progress bar
- Shows subscription status (Free/Pro/Premier)
- Extension popup with detailed credit information
- Automatic updates every minute via background service worker
- Efficient caching to minimize API calls

## Installation
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `suno-credits-extension` folder
5. Visit suno.com to see credits in the sidebar
6. Click the extension icon for the popup view

## How It Works
1. Background service worker uses `chrome.alarms` to wake up every minute
2. Fetches credentials from `https://studio-api-prod.suno.com/api/billing/info/` using session cookie
3. Credits data stored in `chrome.storage.local`
4. Content script and popup retrieve data from storage via message passing
5. Sidebar display shows credits, monthly usage, and subscription status

## Data Displayed
- **Credits Left**: Your current available credit balance
- **Total Credits**: Includes purchased top-up credits
- **Monthly Usage**: Credits used this month / monthly limit
- **Subscription Status**: Free, Pro, or Premier plan indicator
- **Last Updated**: Timestamp of last refresh

## Host Permission Justification

The extension requires host permissions for two specific domains:

**1. https://suno.com/***
- Required to access the `__session` cookie from the suno.com domain
- This cookie contains the JWT authentication token needed to authorize API requests
- Without access to this cookie, the extension cannot authenticate with Suno's billing API

**2. https://studio-api-prod.suno.com/***
- Required to make authenticated requests to Suno's billing API endpoint
- The API endpoint `https://studio-api-prod.suno.com/api/billing/info/` returns credit balance, monthly usage, and subscription information
- This is the only API endpoint the extension communicates with

Both permissions are strictly limited to only the domains necessary for the extension to function. No broader host permissions (like `<all_urls>`) are requested.

## Permissions Used
| Permission | Purpose |
|------------|---------|
| `storage` | Cache credit data locally to minimize API calls |
| `cookies` | Read `__session` cookie for API authentication |
| `activeTab` | Inject content script into active Suno tab |
| `alarms` | Schedule periodic credit updates every minute |
| `host_permissions` | Access suno.com cookies and studio-api-prod.suno.com API |

## Security & Privacy
- No personal data is collected or transmitted
- Only accesses Suno's billing API with user's existing session
- Credits data stored locally in browser storage
- No external servers or third-party services involved

## Firefox Support
Firefox support is planned but will be released after the Chrome version is live on the Chrome Web Store. Firefox's Manifest V3 implementation and extension review process will be addressed in a future update.

## License
MIT License - Feel free to contribute or modify for personal use.