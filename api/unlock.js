/* Validates a lock-screen password attempt against Shopify itself:
   loads the password page for a session, then posts the storefront password
   form the way a browser would. Shopify answers a correct password with a
   storefront_digest cookie — the one reliable success signal. */
const STORE = 'https://by1rr0-yf.myshopify.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function setCookies(r) {
  return typeof r.headers.getSetCookie === 'function'
    ? r.headers.getSetCookie()
    : (r.headers.get('set-cookie') ? [r.headers.get('set-cookie')] : []);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  const password = ((req.body && req.body.password) || '').toString().trim();
  if (!password) { res.status(400).json({ ok: false }); return; }
  try {
    /* only meaningful while the store is actually password-protected —
       this guard also keeps the redirect heuristic below from
       false-positives when protection is off */
    const gate = await fetch(STORE + '/', {
      redirect: 'manual',
      headers: { 'User-Agent': UA, 'Accept': 'text/html' }
    });
    const gateLoc = gate.headers.get('location') || '';
    const isLocked = gate.status >= 300 && gate.status < 400 && gateLoc.includes('/password');
    if (!isLocked) { res.status(200).json({ ok: true }); return; }

    /* pick up the visitor cookies Shopify issues with the password page */
    const pre = await fetch(STORE + '/password', {
      redirect: 'manual',
      headers: { 'User-Agent': UA, 'Accept': 'text/html' }
    });
    const jar = setCookies(pre).map(c => c.split(';')[0]).join('; ');

    const body = new URLSearchParams({ form_type: 'storefront_password', utf8: '✓', password, commit: 'Enter' });
    const r = await fetch(STORE + '/password', {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
        'Accept': 'text/html',
        'Origin': STORE,
        'Referer': STORE + '/password',
        ...(jar ? { 'Cookie': jar } : {})
      },
      body: body.toString()
    });
    /* correct password → 302 away from /password (usually to /);
       wrong password → 200 re-render of the password page.
       (Some fetch implementations hide the storefront_digest set-cookie,
       so the redirect is the primary signal.) */
    const loc = r.headers.get('location') || '';
    const redirectedIn = r.status >= 300 && r.status < 400 && !loc.includes('/password');
    const gotDigest = setCookies(r).join('; ').includes('storefront_digest');
    const ok = redirectedIn || gotDigest;
    console.log('unlock attempt:', JSON.stringify({ status: r.status, location: loc || null, gotDigest, ok }));
    res.status(200).json({ ok });
  } catch (e) {
    console.error('unlock error:', e.message);
    res.status(200).json({ ok: false });
  }
};
