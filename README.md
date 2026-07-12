# OHOUSE — MADE FOR FRIENDS.

Hand-drawn clothing brand storefront. Static site, no build step.

- `index.html` — front page: boil-loop background (`outside`), crossfades into the DJ loop on scroll, product listing overlays the animation.
- `product.html` — product detail page (`?handle=...`), hallway loop background on the right half.
- `store.js` — live Shopify catalog (Storefront API), persistent cart, cart modal, checkout via Shopify cart permalink.
- `store.css` — shared styles (Gloria Hallelujah handwritten font).
- `assets/` — boil-loop videos + product artwork.

## Shopify
Connected to `by1rr0-yf.myshopify.com`. Catalog (names, prices, images, availability)
loads live from the Storefront API; checkout is Shopify-hosted. The token in
`store.js` is a public Storefront token (safe to expose by design).

## Deploy
Any static host: point it at this folder. No build.
Locally: `python3 -m http.server 8081` and open http://localhost:8081.
  