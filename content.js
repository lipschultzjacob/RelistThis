// content.js
// 1. Captures auth token
// 2. Injects relist buttons on your shop page

(function () {

  // ── Token capture ────────────────────────────────────────────────────────────
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const [resource, config] = args;
    const url = typeof resource === 'string' ? resource : resource?.url;

    if (url && url.includes('webapi.depop.com')) {
      const auth = config?.headers?.authorization || config?.headers?.Authorization;
      if (auth && auth.startsWith('Bearer ')) {
        chrome.storage.local.set({ depopToken: auth.replace('Bearer ', '') });
      }
    }

    return originalFetch.apply(this, args);
  };

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
  console.log('injectButton called for:', anchor.getAttribute('href'));
  
  if (anchor.dataset.drInjected) {
    console.log('already injected, skipping');
    return;
  }
  anchor.dataset.drInjected = '1';

  const parsed = parseHref(anchor.getAttribute('href'));
  console.log('parsed:', parsed);
  
  if (!parsed) {
    console.log('parseHref returned null, skipping');
    return;
  }

  const { slug } = parsed;
  console.log('slug:', slug);

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
    btn.disabled = true;
    btn.textContent = '...';
    showToast('Starting relist...', '', 0);
    chrome.runtime.sendMessage({
      type: 'RELIST_SINGLE',
      slug,
    });
  });

  wrap.appendChild(btn);
  console.log('button injected for:', slug);
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