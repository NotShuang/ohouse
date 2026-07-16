# OHOUSE — MADE FOR FRIENDS.

Hand-drawn clothing brand storefront. Static site + two tiny Vercel functions, no build step.

- `index.html` — front page: station boil-loop background; scroll (or the door hotspot / SHOP link) plays the door-open transition into the shop.
- `shop.html` — product list: the productlist animation fills the screen and the live Shopify product image is overlaid exactly where the beanie is drawn (clickable → product page; hover shows the 2nd Shopify image + name label).
- `product.html` — product detail page (`?handle=...`), product-page loop on the right half.
- `contact.html` — contact form (first/last name, email, subject, message) → emails shuang12212024@gmail.com via FormSubmit AJAX (honeypot + validation).
- `store.js` — live Shopify catalog (Storefront API), persistent cart, cart modal, checkout via Shopify cart permalink, door-open route transitions, lock screen.
- `store.css` — shared styles (Gloria Hallelujah handwritten font).
- `assets/` — boil-loop videos only; all product imagery comes from Shopify's CDN.
- `api/lock-status.js`, `api/unlock.js` — mirror Shopify's password protection (Online Store → Preferences). Toggle + password are controlled entirely from Shopify admin; when on, the site shows a COMING SOON lock screen (email signup + password entry) over the main animation.

## Shopify
Connected to `by1rr0-yf.myshopify.com`. Catalog (title, price, description, every image,
availability) loads live from the Storefront API; checkout is Shopify-hosted. The token in
`store.js` is a public Storefront token (safe to expose by design). No product data or
imagery is hardcoded — admin changes appear on the site without code changes.

## Product-over-animation mapping (shop.html)
The productlist animation embeds the product's own Shopify image, uniformly scaled.
Measured mapping of the full 2000×2000 product image into the square 4000×4000 frame:
left 31.43%, top 28.56%, size 32.91% of the frame side. `#beanie-spot` uses those
fractions in `vmax` (the cover-rendered side), so alignment holds at every viewport size.
If the animation is redrawn with the product elsewhere, re-measure and update the three
numbers in `store.css`.

## Deploy
Vercel project `ohouse` (functions need Vercel, so prefer `vercel deploy`).
Locally: `vercel dev` for the full stack, or `python3 -m http.server 8081` for static-only
(the lock screen stays off without `/api`).

## Domain
Production: https://ohouse.shop (plus www; the myshopify storefront's live theme
redirects all its traffic to the custom site).
