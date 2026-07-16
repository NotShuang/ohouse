/* Mirrors Shopify's Online Store → Preferences → password protection.
   The myshopify storefront 302-redirects to /password while protection is on;
   that redirect is the single source of truth for whether the site is locked. */
const STORE = 'https://by1rr0-yf.myshopify.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

module.exports = async (req, res) => {
  try {
    const r = await fetch(STORE + '/', {
      redirect: 'manual',
      headers: { 'User-Agent': UA, 'Accept': 'text/html' }
    });
    const loc = r.headers.get('location') || '';
    const locked = r.status >= 300 && r.status < 400 && loc.includes('/password');
    console.log('lock-status:', JSON.stringify({ status: r.status, location: loc || null, locked }));
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    res.status(200).json({ locked });
  } catch (e) {
    /* if Shopify is unreachable, fail open so the site keeps working */
    console.error('lock-status error:', e.message);
    res.status(200).json({ locked: false });
  }
};
