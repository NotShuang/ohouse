/* OHOUSE shared store logic: live Shopify catalog, persistent cart,
   slide-out cart drawer, email signup popup.
   ————————————————————————————————————————————————————————————————
   Catalog loads live from the Shopify Storefront API (public token).
   Checkout hands the cart to Shopify's hosted checkout via cart permalink.
   Newsletter signup creates a SUBSCRIBED customer via the Storefront API. */

const SHOPIFY_DOMAIN = 'by1rr0-yf.myshopify.com';
const STOREFRONT_TOKEN = '7bbfe1c0cf0bfbd15d38274986b08bc3'; /* Headless app public access token */
const STOREFRONT_API = `https://${SHOPIFY_DOMAIN}/api/2025-01/graphql.json`;

const FALLBACK_CATALOG = {
  'dog-girl-tee': {
    name: 'Dog Girl Tee', price: 45, variantId: '46033021141071',
    img: 'assets/dog-on-head-girl.png',
    imgs: ['assets/dog-on-head-girl.png', 'assets/peace-sign.png', 'assets/weightlifter.png'],
    desc: 'Hand-drawn dog girl print on a heavyweight cotton tee. 240gsm combed cotton, unisex boxy fit, water-based screen print.'
  },
  'golfer-cat-crewneck': {
    name: 'Golfer & Cat Crewneck', price: 75, variantId: '46033021337679',
    img: 'assets/golfer-and-cat.png',
    imgs: ['assets/golfer-and-cat.png', 'assets/two-people-talking.png', 'assets/pixel-cigarette.png'],
    desc: 'Golfer and cat ink-stamp print on a heavyweight crewneck. 240gsm combed cotton, unisex boxy fit, water-based screen print.'
  },
  'peace-tee': {
    name: 'Peace Tee', price: 45, variantId: '46033021534287',
    img: 'assets/peace-sign.png',
    imgs: ['assets/peace-sign.png', 'assets/dog-on-head-girl.png', 'assets/golfer-and-cat.png'],
    desc: 'Peace-sign character print on a heavyweight cotton tee. 240gsm combed cotton, unisex boxy fit, water-based screen print.'
  },
  'talkers-hoodie': {
    name: 'Talkers Hoodie', price: 95, variantId: '46033021730895',
    img: 'assets/two-people-talking.png',
    imgs: ['assets/two-people-talking.png', 'assets/pixel-cigarette.png', 'assets/weightlifter.png'],
    desc: 'Two friends in conversation — ballpoint pen sketch on a heavy hoodie. 240gsm combed cotton, unisex boxy fit, water-based screen print.'
  },
  'lifter-tee': {
    name: 'Lifter Tee', price: 45, variantId: '46033022124111',
    img: 'assets/weightlifter.png',
    imgs: ['assets/weightlifter.png', 'assets/dog-on-head-girl.png', 'assets/peace-sign.png'],
    desc: 'Grumpy weightlifter marker print on a heavyweight cotton tee. 240gsm combed cotton, unisex boxy fit, water-based screen print.'
  },
  'smoke-break-longsleeve': {
    name: 'Smoke Break Longsleeve', price: 55, variantId: '46033022255183',
    img: 'assets/pixel-cigarette.png',
    imgs: ['assets/pixel-cigarette.png', 'assets/golfer-and-cat.png', 'assets/two-people-talking.png'],
    desc: 'Pixel cigarette print on a heavyweight longsleeve. 240gsm combed cotton, unisex boxy fit, water-based screen print.'
  }
};

let CATALOG = FALLBACK_CATALOG;

/* fetch live products from Shopify Storefront API; fall back silently */
const catalogReady = (async () => {
  if (!STOREFRONT_TOKEN) return;
  try {
    const query = `{
      products(first: 50, query: "vendor:OHOUSE") {
        nodes {
          handle title description
          images(first: 3) { nodes { url } }
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
      const imgs = n.images.nodes.map(im => im.url);
      /* placeholder padding to 3 unique slots until real gallery shots are uploaded */
      const pool = [...new Set(Object.values(FALLBACK_CATALOG).flatMap(f => f.imgs))];
      let seed = n.handle.length;
      while (imgs.length < 3 && pool.length) {
        const pick = pool[seed % pool.length];
        seed += 5;
        if (!imgs.some(u => u.includes(pick.split('/').pop()))) imgs.push(pick);
      }
      live[n.handle] = {
        name: n.title,
        price: +v.price.amount,
        variantId: v.id.split('/').pop(),
        img: imgs[0],
        imgs,
        desc: n.description,
        available: v.availableForSale
      };
    });
    CATALOG = live;
  } catch (e) { /* keep fallback */ }
})();

const fmtPrice = n => '$' + (Number.isInteger(+n) ? +n : (+n).toFixed(2));
const isAvailable = p => p && p.available !== false;

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

/* ---------- shop grid (rendered from CATALOG so new products appear) ---------- */
function renderGrid() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  grid.innerHTML = Object.entries(CATALOG).map(([handle, p]) => `
    <a class="product${isAvailable(p) ? '' : ' soldout'}" href="product.html?handle=${handle}">
      <div class="name">${p.name}${isAvailable(p) ? '' : ' — SOLD OUT'}</div>
      <div class="media">
        <img class="main" src="${(p.imgs || [p.img])[0]}" alt="${p.name} print">
        <img class="alt" src="${(p.imgs || [p.img])[1] || (p.imgs || [p.img])[0]}" alt="${p.name} alternate view">
      </div>
    </a>`).join('');
}

/* ---------- email signup (Shopify Storefront customerCreate) ---------- */
const SIGNUP_KEY = 'ohouse-signup-done';
function maybeShowSignup() {
  try { if (localStorage.getItem(SIGNUP_KEY)) return; } catch (e) {}
  setTimeout(() => document.getElementById('signup-overlay').classList.add('open'), 600);
}
function dismissSignup() {
  document.getElementById('signup-overlay').classList.remove('open');
  try { localStorage.setItem(SIGNUP_KEY, '1'); } catch (e) {}
}
async function submitSignup(email) {
  const msg = document.getElementById('signup-msg');
  msg.textContent = '…';
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
      msg.textContent = errs[0].message || 'Something went wrong — try again.';
      return;
    }
    /* TAKEN means the email already exists — treat as subscribed */
    msg.textContent = 'WELCOME, FRIEND. ✓';
    setTimeout(dismissSignup, 1600);
  } catch (e) {
    msg.textContent = 'Network hiccup — try again.';
  }
}

/* ---------- wiring ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  injectChrome();

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
    if (e.target.id === 'signup-overlay') dismissSignup();
  });
  document.getElementById('signup-form').addEventListener('submit', e => {
    e.preventDefault();
    submitSignup(document.getElementById('signup-email').value.trim());
  });
  maybeShowSignup();

  renderGrid();      /* instant paint from fallback */
  renderCart();
  await catalogReady;
  /* drop cart lines whose product no longer exists, or checkout would throw */
  const pruned = cart.filter(i => CATALOG[i.handle]);
  if (pruned.length !== cart.length) { cart = pruned; saveCart(); }
  renderGrid();      /* re-paint with live Shopify data */
  renderCart();
  document.dispatchEvent(new Event('catalog-ready'));
});
