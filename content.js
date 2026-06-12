// content.js
// 1. Captures auth token
// 2. Injects relist buttons on your shop page

(function () {

  // ── Token capture ────────────────────────────────────────────────────────────
  function getTokenFromCookie() {
  const match = document.cookie.match(/access_token=([^;]+)/);
  if (match) {
    const token = match[1];
    chrome.storage.local.set({ depopToken: token });
    console.log('RelistThis: token captured from cookie ✓');
    return token;
  }
  return null;
}

getTokenFromCookie();

  // ── Only run the rest on your shop page ──────────────────────────────────────
  const isShopPage = () => /^\/[a-z0-9_]+\/?$/i.test(location.pathname);
  if (!isShopPage()) return;

  // ── Styles ───────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .dr-wrap {
      position: relative;
    }
    .dr-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 999;
      background: #ff2d55;
      color: white;
      border: none;
      border-radius: 20px;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .dr-wrap:hover .dr-btn {
      opacity: 1;
      pointer-events: auto;
    }
    .dr-btn:disabled {
      background: #555;
      cursor: not-allowed;
    }
    .dr-toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #1a1a1a;
      color: #f0f0f0;
      border: 1px solid #333;
      border-radius: 10px;
      padding: 10px 18px;
      font-size: 13px;
      z-index: 99999;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }
    .dr-toast.show { opacity: 1; }
    .dr-toast.success { border-color: #4ade80; color: #4ade80; }
    .dr-toast.error { border-color: #f87171; color: #f87171; }
  `;
  document.head.appendChild(style);

  // ── Toast ────────────────────────────────────────────────────────────────────
  const toast = document.createElement('div');
  toast.className = 'dr-toast';
  document.body.appendChild(toast);

  let toastTimer;
  function showToast(msg, type = '', duration = 3000) {
    toast.textContent = msg;
    toast.className = `dr-toast ${type} show`;
    clearTimeout(toastTimer);
    if (duration > 0) {
      toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
    }
  }

  // ── Extract slug and product ID from a listing URL ───────────────────────────
  function parseHref(href) {
  const match = href.match(/\/products\/([^/?#]+)/);
  if (!match) return null;
  const slug = match[1].replace(/\/$/, '');
  if (slug === 'create') return null;
  return { slug };
}

  // ── Inject relist button onto a listing card ─────────────────────────────────
  function injectButton(anchor) {
  
  if (anchor.dataset.drInjected) {
    return;
  }
  anchor.dataset.drInjected = '1';

  const parsed = parseHref(anchor.getAttribute('href'));
  
  if (!parsed) {
    return;
  }

  const { slug } = parsed;

  // wrap the card
  const wrap = document.createElement('div');
  wrap.className = 'dr-wrap';
  anchor.parentNode.insertBefore(wrap, anchor);
  wrap.appendChild(anchor);

  const btn = document.createElement('button');
  btn.className = 'dr-btn';
  btn.textContent = '↺ Relist';
  btn.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();

  const token = getTokenFromCookie();
  if (!token) {
    showToast('No token — are you logged in?', 'error', 3000);
    return;
  }

  btn.disabled = true;
  btn.textContent = '...';

  try {
    await relistItem(slug, token, showToast);
  } catch (err) {
    showToast(`✗ ${err.message}`, 'error', 4000);
  } finally {
    btn.disabled = false;
    btn.textContent = '↺ Relist';
  }
});

  wrap.appendChild(btn);
  
}

  // ── Listen for updates from background.js ────────────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'UPDATE') showToast(message.message, '', 0);
    if (message.type === 'DONE') {
      showToast('✓ Relisted!', 'success', 3000);
      document.querySelectorAll('.dr-btn').forEach(b => {
        b.disabled = false;
        b.textContent = '↺ Relist';
      });
    }
    if (message.type === 'ERROR') {
      showToast(`✗ ${message.message}`, 'error', 4000);
      document.querySelectorAll('.dr-btn').forEach(b => {
        b.disabled = false;
        b.textContent = '↺ Relist';
      });
    }
  });

  // ── Watch for listing cards appearing on the page ────────────────────────────
  function scanForCards() {
    document.querySelectorAll('a[href*="/products/"]').forEach(injectButton);
  }

  const observer = new MutationObserver(scanForCards);
  observer.observe(document.body, { childList: true, subtree: true });
  scanForCards();

})();

//handles all Depop API calls

const BASE = 'https://webapi.depop.com';

function headers(token) {
  return {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'authorization': `Bearer ${token}`,
    'content-type': 'application/json',
    'sec-fetch-site': 'same-site',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    'referer': 'https://www.depop.com/',
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Fetch full data for a single listing by its slug
async function getListingDetail(slug, token) {
  const res = await fetch(
    `${BASE}/presentation/api/v1/products/by-slug/${slug}/edit-listing/`,
    { headers: headers(token) }
  );

  if (!res.ok) throw new Error(`Failed to fetch listing: ${res.status}`);

  return res.json();
}

// Step 1 — Tell Depop we're about to upload an image, get back an ID and upload URL
async function registerImage(token) {
  const res = await fetch(`${BASE}/api/v4/pictures/`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      type: 'product',
      extension: 'jpg',
      dimensions: { width: 1280, height: 1280 }
    }),
  });

  if (!res.ok) throw new Error(`Failed to register image: ${res.status}`);
  return res.json(); // returns { id, upload_url }
}

// Step 2 — Fetch an existing image from Depop's CDN as raw bytes
async function fetchImageBlob(imageUrl) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image: ${imageUrl}`);
  return res.blob();
}

// Step 3 — Upload the raw bytes to S3 using the URL from step 1
async function uploadImageToS3(uploadUrl, imageBlob) {
  
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: imageBlob,
  });
  if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
}

// Combines all 3 steps — takes an old image URL, returns a fresh Depop picture ID
async function reuploadImage(token, oldImageUrl) {
  const [registered, blob] = await Promise.all([
    registerImage(token),
    fetchImageBlob(oldImageUrl),
  ]);
  await uploadImageToS3(registered.url, blob);
  return registered.id;
}

// Delete a listing by its product ID
async function deleteListing(productId, token) {
  const res = await fetch(
    `${BASE}/presentation/api/v1/products/${productId}/`,
    {
      method: 'DELETE',
      headers: headers(token),
    }
  );

  if (!res.ok) throw new Error(`Failed to delete listing: ${res.status}`);
}

// Create a new listing
async function createListing(token, payload) {
  const res = await fetch(`${BASE}/presentation/api/v1/listing/products/`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create listing: ${res.status} - ${err}`);
  }

  return res.json();
}

// Takes raw listing data and shapes it into what the POST endpoint expects
function buildPayload(detail, newPictureIds) {
  return {
    address: detail.location || 'United States',
    attributes: detail.attributes || {},
    brand: detail.brand || 'unbranded',
    colour: detail.colour || [],
    condition: detail.condition,
    country: detail.country || 'US',
    description: detail.description,
    gender: detail.gender,
    is_kids: detail.is_kids || false,
    national_shipping_cost: detail.national_shipping_cost || '0.00',
    picture_ids: newPictureIds,
    price_amount: detail.pricing.original_price.total_price,
    price_currency: detail.pricing.currency,
    product_type: detail.product_type,
    shipping_methods: detail.shipping_methods || [],
    variant_set: detail.variant_set_id,
    variants: detail.variants || {},
    persistent_id: crypto.randomUUID(),
  };
}

// The main function — orchestrates the full relist flow for a single item
async function relistItem(slug, token, sendUpdate) {
  sendUpdate('Fetching listing data...');
  const detail = await getListingDetail(slug, token);
  const productId = detail.id;

  const pictures = detail.pictures || [];
  sendUpdate(`Re-uploading ${pictures.length} image(s)...`);

  const newPictureIds = [];
  for (const pic of pictures) {
    const newId = await reuploadImage(token, pic.url);
    newPictureIds.push(newId);
    await sleep(500);
  }

  const payload = buildPayload(detail, newPictureIds);

  sendUpdate('Deleting old listing...');
  await deleteListing(productId, token);
  await sleep(2000 + Math.random() * 2000);

  sendUpdate('Reposting...');
  const result = await createListing(token, payload);

  sendUpdate('✓ Done!');
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'RELIST_SINGLE') {
    const { slug, productId } = message;
    const tabId = sender.tab?.id;

    chrome.storage.local.get('depopToken', ({ depopToken }) => {
      if (!depopToken) {
        chrome.tabs.sendMessage(tabId, {
          type: 'ERROR',
          message: 'No token — browse Depop first'
        });
        return;
      }

      const sendUpdate = (msg) => {
        chrome.tabs.sendMessage(tabId, { type: 'UPDATE', message: msg }).catch(() => {});
      };

      relistItem(slug, depopToken, sendUpdate)
        .then(() => {
          chrome.tabs.sendMessage(tabId, { type: 'DONE' }).catch(() => {});
        })
        .catch((err) => {
          chrome.tabs.sendMessage(tabId, { type: 'ERROR', message: err.message }).catch(() => {});
        });
    });

    sendResponse({ started: true });
    return true;
  }

});