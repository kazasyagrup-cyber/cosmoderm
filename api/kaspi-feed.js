// Kaspi otomatik fiyat listesi (cosmoderm.kz, merchant 15383076).
// Kaspi bu adresi düzenli okur: /k/<KASPI_FEED_KEY> (vercel.json rewrite). Anahtar yalnızca Vercel ortam değişkeninde durur.
// Almatı saatiyle 19:00–07:00 arası gece fiyatı (resmi rakibin %1 altı, en az %10 kâr), diğer saatlerde normal fiyat.
// Stok = api/_kaspi/feed.json'daki adet − baseline_ms'den beri Kaspi siparişlerinde satılan (iptaller hariç; KASPI_TOKEN ile).
// Siparişler okunamazsa 503 döner: Kaspi eski listeyi korur, olmayan ürün satılmaz.
const feed = require('./_kaspi/feed.json');

const CANCELLED = new Set(['CANCELLED', 'CANCELLING', 'RETURNED', 'KASPI_DELIVERY_RETURN_REQUESTED', 'RETURN_ACCEPTED_BY_MERCHANT']);
const STATES = ['NEW', 'SIGN_REQUIRED', 'PICKUP', 'DELIVERY', 'KASPI_DELIVERY', 'ARCHIVE'];
const API = 'https://kaspi.kz/shop/api/v2';
let cache = { at: 0, sold: null };

async function kaspi(path, token) {
  const r = await fetch(API + path, { headers: { 'X-Auth-Token': token, Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json' } });
  if (!r.ok) throw new Error('kaspi ' + r.status);
  return r.json();
}

async function soldSince(since, token) {
  if (cache.sold && Date.now() - cache.at < 4 * 60 * 1000) return cache.sold;
  const sold = {};
  const to = Date.now();
  for (const state of STATES) {
    for (let page = 0; page < 20; page++) {
      const q = `/orders?page[number]=${page}&page[size]=100&filter[orders][creationDate][$ge]=${since}&filter[orders][creationDate][$le]=${to}&filter[orders][state]=${state}`;
      const o = await kaspi(q, token);
      for (const od of o.data || []) {
        if (CANCELLED.has(od.attributes.status)) continue;
        const e = await kaspi(`/orders/${od.id}/entries`, token);
        for (const en of e.data || []) {
          const sku = en.attributes.offer && en.attributes.offer.code;
          if (sku) sold[sku] = (sold[sku] || 0) + (en.attributes.quantity || 0);
        }
      }
      if (!o.meta || page + 1 >= o.meta.pageCount) break;
    }
  }
  cache = { at: Date.now(), sold };
  return sold;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const key = process.env.KASPI_FEED_KEY;
  if (!key) { res.statusCode = 404; res.end('Not found (key not configured)'); return; }  // teşhis: Vercel'de KASPI_FEED_KEY yok
  if (String((req.query && req.query.key) || '').trim() !== key.trim()) { res.statusCode = 404; res.end('Not found'); return; }

  const hour = (new Date().getUTCHours() + feed.tz_offset) % 24;
  const night = hour >= feed.night_from || hour < feed.night_to;

  let sold = {};
  if (process.env.KASPI_TOKEN) {
    try { sold = await soldSince(feed.baseline_ms, process.env.KASPI_TOKEN); }
    catch (e) { res.statusCode = 503; res.end('orders unavailable'); return; }
  } else if (!(req.query && req.query.test === '1')) {
    res.statusCode = 503; res.end('KASPI_TOKEN missing'); return;
  }

  const now = new Date(Date.now() + feed.tz_offset * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
  const out = [];
  out.push('<?xml version="1.0" encoding="utf-8"?>');
  out.push(`<kaspi_catalog date="${now}" xmlns="kaspiShopping" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="kaspiShopping http://kaspi.kz/kaspishopping.xsd">`);
  out.push(`<company>${esc(feed.company)}</company>`);
  out.push(`<merchantid>${esc(feed.merchant)}</merchantid>`);
  out.push('<offers>');
  for (const it of feed.items) {
    const stock = Math.max(0, it.stock - (sold[it.sku] || 0));
    const price = night ? it.night : it.day;
    out.push(`<offer sku="${esc(it.sku)}"><model>${esc(it.model)}</model>${it.brand ? `<brand>${esc(it.brand)}</brand>` : ''}` +
      `<availabilities><availability available="${stock > 0 ? 'yes' : 'no'}" storeId="${esc(feed.store)}"${stock > 0 ? ` stockCount="${stock}"` : ''}/></availabilities>` +
      `<price>${price}</price></offer>`);
  }
  out.push('</offers>');
  out.push('</kaspi_catalog>');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('X-Feed-Mode', night ? 'night' : 'day');
  res.end(out.join('\n'));
};
