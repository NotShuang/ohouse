/* OHOUSE shared store logic: live Shopify catalog, persistent cart, cart modal.
   ————————————————————————————————————————————————————————————————————————
   LIVE CATALOG: paste your Storefront API access token into STOREFRONT_TOKEN
   below (Shopify admin → Settings → Apps and sales channels → Develop apps →
   create app → Configuration: enable Storefront API → API credentials →
   Storefront API access token). Once set, products, names, prices, images and
   descriptions come straight from Shopify on every page load. Until then the
   embedded FALLBACK_CATALOG below is used.
   CHECKOUT: builds a Shopify cart permalink to hosted checkout. */

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
          featuredImage { url }
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

/* ---------- cart state (localStorage so it survives page changes) ---------- */
const CART_KEY = 'ohouse-cart';
let cart = [];
try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { cart = []; }
function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} }

const isAvailable = p => p && p.available !== false;

function addToCart(handle) {
  if (!isAvailable(CATALOG[handle])) return;
  const found = cart.find(i => i.handle === handle);
  if (found) found.qty++;
  else cart.push({ handle, qty: 1 });
  saveCart();
  renderCart();
  openCart();
}

/* ---------- cart modal ---------- */
function renderCart() {
  const linesEl = document.getElementById('cart-lines');
  const totalEl = document.getElementById('cart-total');
  const linkEl = document.getElementById('cart-link');
  const checkoutEl = document.getElementById('checkout');
  if (!linesEl) return;

  linesEl.innerHTML = '';
  let hasSoldOut = false;
  if (cart.length === 0) {
    linesEl.innerHTML = '<div class="cart-empty">YOUR CART IS EMPTY.</div>';
  } else {
    cart.forEach((item, idx) => {
      const p = CATALOG[item.handle];
      if (!p) return;
      const soldOut = !isAvailable(p);
      if (soldOut) hasSoldOut = true;
      const row = document.createElement('div');
      row.className = 'cart-line';
      row.innerHTML = `<span class="n">${p.name}${soldOut ? ' <span class="oos">— SOLD OUT, PLEASE REMOVE</span>' : ''}</span>
        <span class="q">×${item.qty} — ${fmtPrice(p.price * item.qty)}</span>
        <button class="rm" data-i="${idx}">REMOVE</button>`;
      linesEl.appendChild(row);
    });
  }
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const total = cart.reduce((s, i) => s + i.qty * (CATALOG[i.handle] ? CATALOG[i.handle].price : 0), 0);
  if (linkEl) linkEl.textContent = `CART (${count})`;
  if (totalEl) totalEl.textContent = `TOTAL — ${fmtPrice(total)}`;
  if (checkoutEl) checkoutEl.disabled = cart.length === 0 || hasSoldOut;
}

function openCart() { document.getElementById('cart-overlay').classList.add('open'); }
function closeCart() { document.getElementById('cart-overlay').classList.remove('open'); }

/* ---------- shop grid (rendered from CATALOG so new products appear) ---------- */
function renderGrid() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  /* listing shows only the name above the artwork (yuremane-style) */
  grid.innerHTML = Object.entries(CATALOG).map(([handle, p]) => `
    <a class="product${isAvailable(p) ? '' : ' soldout'}" href="product.html?handle=${handle}">
      <div class="name">${p.name}${isAvailable(p) ? '' : ' — SOLD OUT'}</div>
      <div class="media">
        <img class="main" src="${(p.imgs || [p.img])[0]}" alt="${p.name} print">
        <img class="alt" src="${(p.imgs || [p.img])[1] || (p.imgs || [p.img])[0]}" alt="${p.name} alternate view">
      </div>
    </a>`).join('');
}

/* ---------- wiring ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  const overlay = document.getElementById('cart-overlay');
  const linkEl = document.getElementById('cart-link');

  if (linkEl) linkEl.addEventListener('click', e => { e.preventDefault(); renderCart(); openCart(); });
  const closeBtn = document.getElementById('cart-close');
  if (closeBtn) closeBtn.addEventListener('click', closeCart);
  if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeCart(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });

  const linesEl = document.getElementById('cart-lines');
  if (linesEl) linesEl.addEventListener('click', e => {
    if (e.target.matches('.rm')) { cart.splice(+e.target.dataset.i, 1); saveCart(); renderCart(); }
  });

  const checkoutEl = document.getElementById('checkout');
  if (checkoutEl) checkoutEl.addEventListener('click', () => {
    if (cart.length === 0) return;
    const items = cart.map(i => `${CATALOG[i.handle].variantId}:${i.qty}`).join(',');
    window.location.href = `https://${SHOPIFY_DOMAIN}/cart/${items}`;
  });

  /* ADD TO CART buttons (delegated — grid is rendered dynamically) */
  document.addEventListener('click', e => {
    const btn = e.target.closest('.buy[data-handle]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    addToCart(btn.dataset.handle);
  });

  renderGrid();      /* instant paint from fallback */
  renderCart();
  await catalogReady;
  renderGrid();      /* re-paint with live Shopify data once loaded */
  renderCart();
  document.dispatchEvent(new Event('catalog-ready'));
});
