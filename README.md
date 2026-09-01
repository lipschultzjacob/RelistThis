# RelistThis

A Chrome extension that adds a one-click "relist" button to your Depop shop page. Relisting (deleting a listing and reposting it as new) bumps it back to the top of search/browse results instead of leaving it buried under newer items.

> **Status: archived.** This was a personal project, shared here for reference. Relisting this way isn't officially supported by Depop and may violate their Terms of Service — use at your own risk, and don't expect it to keep working if Depop changes their API.

## How it works

Depop's web app doesn't expose a "relist" action, so this extension reproduces it by talking directly to Depop's internal API (`webapi.depop.com`), the same one the site itself calls:

1. **Fetch** the full listing data for the item being relisted.
2. **Re-download and re-upload** each listing photo, since a new listing needs its own fresh image IDs (Depop's API returns new picture IDs on upload; you can't reuse the old ones).
3. **Delete** the original listing.
4. **Recreate** the listing from the fetched data plus the new image IDs.

All of this runs as one flow per click, with toast notifications in the page showing progress ("Re-uploading images...", "Deleting old listing...", etc).

## Architecture

| File | Role |
|---|---|
| [manifest.json](manifest.json) | Manifest V3 config. Declares the content script (runs on `depop.com`), the background service worker, and host permissions for `webapi.depop.com` / `www.depop.com`. |
| [content.js](content.js) | Injected into Depop shop pages. Does three things: captures your auth token from cookies, injects a "↺ Relist" button over each listing card (via a `MutationObserver` so it also catches items loaded lazily/via infinite scroll), and contains all the Depop API logic (fetch listing → reupload images → delete → recreate). |
| [background.js](background.js) | Minimal service worker. Present mainly for the manifest's requirements — the actual API calls live in `content.js` because they need to run in the page's context to satisfy Depop's `Sec-Fetch-Site` header checks. |

There's no build step, bundler, or external dependencies — it's plain vanilla JS injected via Chrome's extension APIs (`chrome.storage`, `chrome.runtime.onMessage`, `chrome.tabs`).

### Auth

The extension reads the `access_token` cookie that Depop's own site sets when you're logged in, and stores it in `chrome.storage.local`. It never asks for or handles your password — it just reuses the session you already have open in the browser.

## Setup

1. Clone or download this repo.
2. Go to `chrome://extensions` in Chrome (or any Chromium-based browser).
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the project folder.
5. Visit your Depop shop page (`depop.com/<your-username>`) while logged in.
6. Hover over a listing card — a "↺ Relist" button will appear in the corner. Click it to relist that item.

No API keys or configuration needed; everything is derived from your existing logged-in Depop session.
