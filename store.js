/* OHOUSE shared store logic: live Shopify catalog, persistent cart,
   slide-out cart drawer, email signup popup, door-open route transitions,
   Shopify-tied "coming soon" lock screen.
   ————————————————————————————————————————————————————————————————
   Catalog loads live from the Shopify Storefront API (public token) —
   titles, prices, descriptions and every image come from Shopify, so
   admin changes show up here without code changes.
   Checkout hands the cart to Shopify's hosted checkout via cart permalink.
   Newsletter signup creates a SUBSCRIBED customer via the Storefront API.
   Lock screen mirrors Online Store → Preferences → password protection. */

const SHOPIFY_DOMAIN = 'by1rr0-yf.myshopify.com';
const STOREFRONT_TOKEN = '7bbfe1c0cf0bfbd15d38274986b08bc3'; /* Headless app public access token */
const STOREFRONT_API = `https://${SHOPIFY_DOMAIN}/api/2025-01/graphql.json`;

let CATALOG = {};

/* fetch live products from Shopify Storefront API */
const catalogReady = (async () => {
  try {
    const query = `{
      products(first: 50, query: "vendor:OHOUSE") {
        nodes {
          handle title description
          images(first: 10) { nodes { url } }
          variants(first: 1) { nodes { id price { amount } availableForSale } }
        }
      }
    }`;
    const r = await fetch(STOREFRONT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN },
      body: JSON.stringify({ query })
    });
    const j = await r.json();
    const nodes = j && j.data && j.data.products && j.data.products.nodes;
    if (!nodes || !nodes.length) return;
    const live = {};
    nodes.forEach(n => {
      const v = n.variants.nodes[0];
      if (!v) return;
      live[n.handle] = {
        name: n.title,
        price: +v.price.amount,
        variantId: v.id.split('/').pop(),
        img: n.images.nodes.length ? n.images.nodes[0].url : '',
        imgs: n.images.nodes.map(im => im.url),
        desc: n.description,
        available: v.availableForSale
      };
    });
    CATALOG = live;
  } catch (e) { /* stay empty; pages keep their animations */ }
})();

const fmtPrice = n => '$' + (Number.isInteger(+n) ? +n : (+n).toFixed(2));
const isAvailable = p => p && p.available !== false;

/* ---------- route transitions ----------
   Leaving the home page plays the door-open clip; every other route change
   is a quick white fade (out on the old page, in on the new one). */
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
let transitioning = false;

/* iOS Low Power Mode / data saver blocks muted autoplay (the native play
   glyph it paints is hidden in store.css) — restart every paused autoplay
   video on the first gesture and whenever the tab becomes visible again */
function resumeVideos() {
  if (REDUCED_MOTION) return;
  document.querySelectorAll('video[autoplay]').forEach(v => { if (v.paused) v.play().catch(() => {}); });
}
['pointerdown', 'touchend', 'keydown'].forEach(ev => addEventListener(ev, resumeVideos, { passive: true }));
addEventListener('visibilitychange', resumeVideos);

function getVeil() {
  let v = document.getElementById('fade-veil');
  if (!v) {
    v = document.createElement('div');
    v.id = 'fade-veil';
    document.body.appendChild(v);
  }
  return v;
}

function transitionTo(href) {
  if (transitioning) return;
  if (REDUCED_MOTION) { location.href = href; return; }
  transitioning = true;

  if (document.body.classList.contains('home')) {
    const v = document.createElement('video');
    v.id = 'route-transition';
    v.src = 'assets/dooropen.mp4';
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    document.body.appendChild(v);
    let done = false;
    const go = () => { if (!done) { done = true; location.href = href; } };
    v.addEventListener('ended', go, { once: true });
    v.addEventListener('error', go, { once: true });
    v.play().catch(go);
    setTimeout(go, 1600); /* cap: never strand the user on the transition */
    return;
  }

  const veil = getVeil();
  requestAnimationFrame(() => veil.classList.add('on'));
  setTimeout(() => { location.href = href; }, 300);
}

/* fade the new page in (skip on home, which opens on its animation) */
function fadeInPage() {
  if (REDUCED_MOTION || document.body.classList.contains('home')) return;
  const veil = getVeil();
  veil.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    veil.classList.remove('on');
    setTimeout(() => veil.remove(), 400);
  }));
}

/* back/forward cache restores must not leave a stale veil or door video */
addEventListener('pageshow', e => {
  if (!e.persisted) return;
  transitioning = false;
  const veil = document.getElementById('fade-veil');
  if (veil) veil.remove();
  const rt = document.getElementById('route-transition');
  if (rt) rt.remove();
});

/* internal .html links ride the door animation (cart link, new tabs and
   modified clicks excluded) */
const INTERNAL_LINK = /^(index|shop|product|contact)\.html/;
document.addEventListener('click', e => {
  const a = e.target.closest('a[href]');
  if (!a || a.id === 'cart-link' || a.target || a.hasAttribute('download')) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  const href = a.getAttribute('href');
  if (!INTERNAL_LINK.test(href)) return;
  e.preventDefault();
  transitionTo(href);
});

/* ---------- cart state (localStorage so it survives page changes) ---------- */
const CART_KEY = 'ohouse-cart';
let cart = [];
try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { cart = []; }
function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} }

function addToCart(handle) {
  if (!isAvailable(CATALOG[handle])) return;
  const found = cart.find(i => i.handle === handle);
  if (found) found.qty++;
  else cart.push({ handle, qty: 1 });
  saveCart();
  renderCart();
  openDrawer();
}

/* ---------- injected chrome: cart drawer + signup popup ---------- */
function injectChrome() {
  document.body.insertAdjacentHTML('beforeend', `
  <div id="drawer-overlay"></div>
  <aside id="cart-drawer" aria-label="Cart">
    <div class="drawer-head"><h3>CART</h3><button id="drawer-close" aria-label="Close cart">✕</button></div>
    <div id="drawer-body">
      <div id="drawer-lines"></div>
      <div id="drawer-upsell"></div>
    </div>
    <div class="drawer-foot">
      <button id="drawer-checkout" disabled>CHECKOUT&nbsp;&nbsp;·&nbsp;&nbsp;$0</button>
    </div>
  </aside>
  <div id="signup-overlay">
    <div id="signup-pop">
      <button id="signup-close" aria-label="Close">✕</button>
      <h3>JOIN THE FRIENDS LIST</h3>
      <p>drops, restocks and doodles. no spam — made for friends.</p>
      <form id="signup-form">
        <input id="signup-email" type="email" required placeholder="your@email.com">
        <button id="signup-submit" type="submit">SIGN UP</button>
      </form>
      <div id="signup-msg"></div>
    </div>
  </div>`);
}

/* ---------- cart drawer ---------- */
function openDrawer() { renderCart(); document.body.classList.add('drawer-open'); }
function closeDrawer() { document.body.classList.remove('drawer-open'); }

function renderCart() {
  const linesEl = document.getElementById('drawer-lines');
  const upsellEl = document.getElementById('drawer-upsell');
  const linkEl = document.getElementById('cart-link');
  const checkoutEl = document.getElementById('drawer-checkout');
  if (!linesEl) return;

  let hasSoldOut = false;
  if (cart.length === 0) {
    linesEl.innerHTML = '<div class="drawer-empty">YOUR CART IS EMPTY.</div>';
  } else {
    linesEl.innerHTML = cart.map((item, idx) => {
      const p = CATALOG[item.handle];
      if (!p) return '';
      const soldOut = !isAvailable(p);
      if (soldOut) hasSoldOut = true;
      return `
      <div class="dline">
        <img src="${p.img}" alt="${p.name}">
        <div class="din">
          <div class="dname">${p.name}${soldOut ? ' <span class="oos">— SOLD OUT</span>' : ''}</div>
          <div class="dprice">${fmtPrice(p.price)}</div>
          <div class="drow">
            <span class="qty-step">
              <button data-q="-1" data-i="${idx}" aria-label="Decrease">−</button>
              <span>${item.qty}</span>
              <button data-q="1" data-i="${idx}" aria-label="Increase">+</button>
            </span>
            <button class="rm" data-i="${idx}">Remove</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  /* COMPLETE WITH: first available product not already in the cart */
  const inCart = new Set(cart.map(i => i.handle));
  const up = Object.entries(CATALOG).find(([h, p]) => !inCart.has(h) && isAvailable(p));
  upsellEl.innerHTML = (cart.length && up) ? `
    <div class="up-label">COMPLETE WITH</div>
    <div class="uline">
      <img src="${up[1].img}" alt="${up[1].name}">
      <div>
        <div class="uname">${up[1].name}</div>
        <div class="uprice">${fmtPrice(up[1].price)}</div>
        <button class="uadd" data-handle="${up[0]}">Add to cart</button>
      </div>
    </div>` : '';

  const count = cart.reduce((s, i) => s + i.qty, 0);
  const total = cart.reduce((s, i) => s + i.qty * (CATALOG[i.handle] ? CATALOG[i.handle].price : 0), 0);
  if (linkEl) linkEl.textContent = `CART (${count})`;
  if (checkoutEl) {
    checkoutEl.innerHTML = `CHECKOUT&nbsp;&nbsp;·&nbsp;&nbsp;${fmtPrice(total)}`;
    checkoutEl.disabled = cart.length === 0 || hasSoldOut;
  }
}

/* ---------- product list page: the products sit over the animation ----------
   The productlist animation embeds each product's own Shopify image, uniformly
   scaled and drawn in place (beanie top-left, tee on a hanger at right). Each
   spot element carries its square placement inline (--pl/--pt/--pw, fractions
   of the frame); store.css turns those into an exact overlay on --side, so the
   live Shopify image always sits exactly over the drawn one. Sourcing (name,
   price, images, link) is identical for every product — pulled live from the
   Shopify catalog by handle, nothing hardcoded. */
const SHOP_SPOTS = [
  { handle: 'beanie-cap', el: 'spot-beanie' },
  { handle: 'tee',        el: 'spot-tee' }
];
function renderProductSpot() {
  SHOP_SPOTS.forEach(({ handle, el }) => {
    const spot = document.getElementById(el);
    if (!spot) return;
    const p = CATALOG[handle];
    if (!p) return; /* product missing from the live catalog — leave its spot hidden */
    const imgs = p.imgs && p.imgs.length ? p.imgs : [p.img];
    spot.href = `product.html?handle=${handle}`;
    spot.setAttribute('aria-label', p.name);
    spot.querySelector('.spot-label').textContent = p.name;
    spot.querySelector('img.front').src = imgs[0];
    spot.querySelector('img.front').alt = p.name;
    spot.querySelector('img.back').src = imgs[1] || imgs[0]; /* hover swaps to 2nd image */
    spot.querySelector('img.back').alt = `${p.name} — alternate view`;
    spot.classList.add('ready');
  });
}

/* product names are a fixed, consistent size for every spot (a fraction of the
   scene --side, set in store.css), so both labels match regardless of product
   width or name length — no per-product fitting needed */

/* ---------- email signup (Shopify Storefront customerCreate) ---------- */
/* v2: the v1 key could be set forever by a single stray tap on the backdrop
   (e.g. tapping the screen to start the animation on iOS) */
const SIGNUP_KEY = 'ohouse-signup-done-v2';
function maybeShowSignup() {
  if (document.getElementById('lock-screen')) return; /* lock page has its own field */
  try { if (localStorage.getItem(SIGNUP_KEY) || sessionStorage.getItem(SIGNUP_KEY)) return; } catch (e) {}
  setTimeout(() => document.getElementById('signup-overlay').classList.add('open'), 600);
}
/* pass persist=false for backdrop taps: hide for this session only, so an
   accidental tap doesn't suppress the popup forever */
function dismissSignup(persist) {
  document.getElementById('signup-overlay').classList.remove('open');
  const store = persist === false ? sessionStorage : localStorage;
  try { store.setItem(SIGNUP_KEY, '1'); } catch (e) {}
}
async function submitSignup(email, msgEl, onDone) {
  msgEl.textContent = '…';
  const pass = 'ohs-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  try {
    const r = await fetch(STOREFRONT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN },
      body: JSON.stringify({
        query: `mutation($input: CustomerCreateInput!) {
          customerCreate(input: $input) { customer { id } customerUserErrors { code message } }
        }`,
        variables: { input: { email, password: pass, acceptsMarketing: true } }
      })
    });
    const j = await r.json();
    const errs = j.data && j.data.customerCreate && j.data.customerCreate.customerUserErrors || [];
    if (errs.length && errs[0].code !== 'TAKEN') {
      msgEl.textContent = errs[0].message || 'Something went wrong — try again.';
      return;
    }
    /* TAKEN means the email already exists — treat as subscribed */
    msgEl.textContent = 'WELCOME, FRIEND. ✓';
    if (onDone) setTimeout(onDone, 1600);
  } catch (e) {
    msgEl.textContent = 'Network hiccup — try again.';
  }
}

/* ---------- lock screen (mirrors Shopify password protection) ----------
   /api/lock-status checks whether the myshopify storefront is password
   protected; /api/unlock validates a password attempt against Shopify.
   Toggle + password both live in Shopify admin (Online Store → Preferences). */
const UNLOCK_KEY = 'ohouse-unlocked';
function lockActive() { return !!document.getElementById('lock-screen'); }

function showLock() {
  if (lockActive()) return;
  document.body.insertAdjacentHTML('beforeend', `
  <div id="lock-screen">
    <video src="assets/station-loop.mp4" autoplay muted loop playsinline></video>
    <div class="lock-wash"></div>
    <div class="lock-inner">
      <h1>OHOUSE</h1>
      <div class="coming">COMING SOON.</div>
      <p>friends get first dibs — join the list.</p>
      <form id="lock-signup">
        <input type="email" required placeholder="your@email.com" aria-label="Email address">
        <button type="submit">JOIN</button>
      </form>
      <div class="lock-msg" id="lock-signup-msg"></div>
      <form id="lock-pass">
        <input type="password" required placeholder="password" aria-label="Password">
        <button type="submit">ENTER</button>
      </form>
      <div class="lock-msg" id="lock-pass-msg"></div>
    </div>
  </div>`);
  document.body.classList.add('locked');

  document.getElementById('lock-signup').addEventListener('submit', e => {
    e.preventDefault();
    submitSignup(e.target.querySelector('input').value.trim(), document.getElementById('lock-signup-msg'));
  });
  document.getElementById('lock-pass').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = document.getElementById('lock-pass-msg');
    msg.textContent = '…';
    try {
      const r = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: e.target.querySelector('input').value })
      });
      const j = await r.json();
      if (j.ok) {
        try { sessionStorage.setItem(UNLOCK_KEY, '1'); } catch (err) {}
        document.getElementById('lock-screen').remove();
        document.body.classList.remove('locked');
        maybeShowSignup();
      } else {
        msg.textContent = 'WRONG PASSWORD — TRY AGAIN.';
      }
    } catch (err) {
      msg.textContent = 'Network hiccup — try again.';
    }
  });
}

async function checkLock() {
  let unlocked = false;
  try { unlocked = sessionStorage.getItem(UNLOCK_KEY) === '1'; } catch (e) {}
  if (unlocked) return;
  try {
    const r = await fetch('/api/lock-status');
    const j = await r.json();
    if (j.locked) showLock();
  } catch (e) { /* no /api locally — site stays open */ }
}

/* ---------- wiring ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  fadeInPage();
  injectChrome();
  checkLock();

  const linkEl = document.getElementById('cart-link');
  if (linkEl) linkEl.addEventListener('click', e => { e.preventDefault(); openDrawer(); });
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); dismissSignup(); } });

  /* drawer interactions: qty steppers, remove, upsell add */
  document.getElementById('cart-drawer').addEventListener('click', e => {
    const q = e.target.closest('[data-q]');
    if (q) {
      const i = +q.dataset.i;
      cart[i].qty += +q.dataset.q;
      if (cart[i].qty <= 0) cart.splice(i, 1);
      saveCart(); renderCart(); return;
    }
    const rm = e.target.closest('.rm');
    if (rm) { cart.splice(+rm.dataset.i, 1); saveCart(); renderCart(); return; }
    const ua = e.target.closest('.uadd');
    if (ua) { addToCart(ua.dataset.handle); return; }
    if (e.target.id === 'drawer-checkout' && !e.target.disabled) {
      const items = cart.map(i => `${CATALOG[i.handle].variantId}:${i.qty}`).join(',');
      window.location.href = `https://${SHOPIFY_DOMAIN}/cart/${items}`;
    }
  });

  /* ADD TO CART buttons anywhere (delegated) */
  document.addEventListener('click', e => {
    const btn = e.target.closest('.buy[data-handle]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    addToCart(btn.dataset.handle);
  });

  /* signup popup */
  document.getElementById('signup-close').addEventListener('click', dismissSignup);
  document.getElementById('signup-overlay').addEventListener('click', e => {
    if (e.target.id === 'signup-overlay') dismissSignup(false);
  });
  document.getElementById('signup-form').addEventListener('submit', e => {
    e.preventDefault();
    submitSignup(document.getElementById('signup-email').value.trim(),
                 document.getElementById('signup-msg'), dismissSignup);
  });
  setTimeout(maybeShowSignup, 900); /* after lock check has had a beat */

  renderCart();
  await catalogReady;
  /* drop cart lines whose product no longer exists, or checkout would throw */
  const pruned = cart.filter(i => CATALOG[i.handle]);
  if (pruned.length !== cart.length) { cart = pruned; saveCart(); }
  renderProductSpot();
  renderCart();
  document.dispatchEvent(new Event('catalog-ready'));
});
