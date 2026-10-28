// Kaspi otomatik fiyat listesi (cosmoderm.kz, merchant 15383076).
// Kaspi bu adresi düzenli okur: /k/<KASPI_FEED_KEY> (vercel.json rewrite). Anahtar yalnızca Vercel ortam değişkeninde durur.
// Almatı saatiyle 18:00–07:00 (feed.json night_from/night_to) arası gece fiyatı (resmi rakibin %1 altı, en az %10 kâr), diğer saatlerde normal fiyat.
// Stok = api/_kaspi/feed.json'daki adet − baseline_ms'den beri Kaspi siparişlerinde satılan (iptaller hariç; KASPI_TOKEN ile).
// Siparişler okunamazsa 503 döner: Kaspi eski listeyi korur, olmayan ürün satılmaz.
const feed = require('./_kaspi/feed.json');
const core = require('./_stok/core');   // 10.10: ortak stok (Kaspi+WB+Ozon) — hata olursa eski Kaspi-only mantığa düşer
const { runSync } = require('./_stok/sync');
let lastSync = 0;   // 17.10: Kaspi okuması WB/Ozon senkronunu da tetikler (en fazla 4 dk'da bir, bu örnek içinde)

// Yanıt gönderildikten sonra iş sürdürmek için Vercel'in waitUntil'i (@vercel/functions'ın kullandığı istek bağlamı; paket kurmadan)
function afterResponse(p) {
  const ctx = globalThis[Symbol.for('@vercel/request-context')];
  const w = ctx && ctx.get && ctx.get();
  if (w && w.waitUntil) w.waitUntil(p);
}

const CANCELLED = new Set(['CANCELLED', 'CANCELLING', 'RETURNED', 'KASPI_DELIVERY_RETURN_REQUESTED', 'RETURN_ACCEPTED_BY_MERCHANT']);
const STATES = ['NEW', 'SIGN_REQUIRED', 'PICKUP', 'DELIVERY', 'KASPI_DELIVERY', 'ARCHIVE'];
const API = 'https://kaspi.kz/shop/api/v2';
let cache = { at: 0, sold: null };
const WINDOW_MS = 14 * 24 * 3600 * 1000;
// 28.10: Kaspi'ye aynı anda en fazla 16 istek (yüzlerce paralel /entries isteği soğuk başlangıçta 429 → feed 503 veriyordu)
async function sinirli(list, fn, n = 16) {
  const out = new Array(list.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); } }));
  return out;
}
async function kaspi(path, token) {
  // 08.10: Kaspi'ye ilk bağlantı ara sıra "fetch failed" veriyor → 3 deneme (0,4 / 1,2 sn arayla)
  // 28.10: Kaspi 429 (çok istek) → 2 / 5 sn bekle (0,4 / 1,2 sn yetmiyordu, feed ara sıra 503 veriyordu)
  let last, cok = false;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(API + path, { headers: { 'X-Auth-Token': token, Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json' } });
      if (r.ok) return r.json();
      last = new Error('kaspi ' + r.status + ' ' + (await r.text()).slice(0, 80).replace(/\s+/g, ' '));
      cok = r.status === 429;
      if (r.status < 500 && r.status !== 429) break;  // 401/403/404 → tekrar denemenin anlamı yok
    } catch (e) { last = e; cok = false; }
    await new Promise((ok) => setTimeout(ok, (cok ? [2000, 5000, 0] : [400, 1200, 0])[i]));
  }
  throw last;
}

async function soldSince(since, token) {
  if (cache.sold && Date.now() - cache.at < 4 * 60 * 1000) return cache.sold;
  const to = Date.now();
  // 08.10: hız — durumlar ve sipariş kalemleri PARALEL okunur (önce sıralı ~8,6 sn sürüyordu; Kaspi zaman aşımına düşmesin)
  // 24.10: Kaspi tek sorguda ~15 günden uzun creationDate aralığını reddediyor (400 "Exceeded the maximum difference") → 14 günlük pencereler
  const listState = async (state) => {
    const out = [];
    for (let from = since; from <= to; from += WINDOW_MS) {
      const until = Math.min(to, from + WINDOW_MS - 1);
      for (let page = 0; page < 20; page++) {
        const q = `/orders?page[number]=${page}&page[size]=100&filter[orders][creationDate][$ge]=${from}&filter[orders][creationDate][$le]=${until}&filter[orders][state]=${state}`;
        const o = await kaspi(q, token);
        out.push(...(o.data || []));
        if (!o.meta || page + 1 >= o.meta.pageCount) break;
      }
    }
    return out;
  };
  // 22.10: Kaspi aynı siparişi birden çok durum listesinde (DELIVERY + KASPI_DELIVERY) döndürüyor → sipariş id'sine göre tekilleştir (yoksa satış 2 kez düşülüyordu)
  const gor = new Set();
  const orders = (await Promise.all(STATES.map(listState))).flat().filter((od) => !CANCELLED.has(od.attributes.status) && !gor.has(od.id) && gor.add(od.id));
  const entries = await sinirli(orders, (od) => core.kaspiEntries(od.id, token));   // 28.10: ortak stokla paylaşılan kalem önbelleği
  const sold = {};
  for (const e of entries) for (const en of e.data || []) {
    const sku = en.attributes.offer && en.attributes.offer.code;
    if (sku) sold[sku] = (sold[sku] || 0) + (en.attributes.quantity || 0);
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
  const night = Date.now() >= (feed.night_start_ms || 0) && (hour >= feed.night_from || hour < feed.night_to);  // night_start_ms öncesi hep gündüz fiyatı

  let sold = {}, snap = null;
  if (process.env.KASPI_TOKEN) {
    // ortak stok anlık görüntüsü (WB+Ozon+Kaspi) Kaspi-only okumayla PARALEL
    // 28.10: soğuk başlangıçta 15 sn yetmiyordu → eski mantığa düşüp feed.json'daki eski adetlerle ~120 ilanı "available=no" gönderiyordu (Kaspi'de satıştan düşüyordu).
    // Artık 40 sn beklenir; yine gelmezse 503 → Kaspi son doğru listeyi korur.
    const snapP = Promise.race([core.snapshot(process.env), new Promise((_, no) => setTimeout(() => no(new Error('zaman aşımı 40 sn')), 40000))]).catch((e) => ({ errors: ['snapshot: ' + String(e && e.message || e).slice(0, 100)] }));
    try { sold = await soldSince(feed.baseline_ms, process.env.KASPI_TOKEN); }
    catch (e) { res.statusCode = 503; res.end('orders unavailable: ' + String(e && e.message || e).slice(0, 120)); return; }
    const sn = await snapP;
    if (sn && sn.R && !(sn.errors || []).length) snap = sn;
    else {
      console.log('stok-ortak devre dışı', JSON.stringify((sn && sn.errors) || []));
      res.statusCode = 503; res.end('stok unavailable: ' + String(((sn && sn.errors) || []).join('; ')).slice(0, 160)); return;
    }
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
  // 10.10: ikiz kart ilanları (it.pool = ana ilanın sku'su) ana ilanla ORTAK stoğu paylaşır: stok = ana stok − havuzdaki tüm sku'ların satışı
  const base = {}, poolSold = {};
  for (const it of feed.items) if (!it.pool) base[it.sku] = it.stock;
  for (const it of feed.items) { const g = it.pool || it.sku; poolSold[g] = (poolSold[g] || 0) + (sold[it.sku] || 0); }
  for (const it of feed.items) {
    const g = it.pool || it.sku;
    const ean = snap && core.IDX.kaspi[it.sku];   // EAN havuzundaki ilan → kalan R (üç platformun satışı düşülmüş)
    // 24.10 (kullanıcı, 2. karar): son 1 adet YALNIZ Kaspi'de satılır → WB/Ozon'da 0 yazılır (./_stok/sync.js wbOzHedef); Kaspi her zaman gerçek kalanı gösterir.
    // (Aynı gün önce denenen "Kaspi'de 1 eksik göster" güvenlik payı KALDIRILDI.)
    const stock = ean ? snap.R[ean] : Math.max(0, (g in base ? base[g] : it.stock) - poolSold[g]);
    // 24.10: süreli kampanya — it.kampanya {fiyat, bas, bit (ISO, Almatı +05:00)}: pencere içinde gece+gündüz min(kampanya, normal); bitişte KENDİLİĞİNDEN normale döner (iş/zamanlayıcı gerekmez)
    const k = it.kampanya, normal = night ? it.night : it.day;
    const price = k && Date.now() >= Date.parse(k.bas) && Date.now() < Date.parse(k.bit) ? Math.min(k.fiyat, normal) : normal;
    out.push(`<offer sku="${esc(it.sku)}"><model>${esc(it.model)}</model>${it.brand ? `<brand>${esc(it.brand)}</brand>` : ''}` +
      `<availabilities><availability available="${stock > 0 ? 'yes' : 'no'}" storeId="${esc(feed.store)}"${stock > 0 ? ` stockCount="${stock}"` : ''}/></availabilities>` +
      `<price>${price}</price></offer>`);
  }
  out.push('</offers>');
  out.push('</kaspi_catalog>');
  console.log('kaspi-feed', JSON.stringify({ mode: night ? 'night' : 'day', ortak: !!snap, ua: req.headers['user-agent'] || '', ip: req.headers['x-forwarded-for'] || '', offers: feed.items.length }));  // Vercel Logs'ta Kaspi okumalarını görmek için
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('X-Feed-Mode', night ? 'night' : 'day');
  res.end(out.join('\n'));
  // 17.10: aynı anlık görüntüyle WB/Ozon'u da düşür (Cloudflare tetikleyicisine ek güvence). Yanıttan sonra çalışır, Kaspi beklemez.
  if (snap && process.env.STOK_YAZ === '1' && Date.now() - lastSync > 4 * 60 * 1000) {
    lastSync = Date.now();
    afterResponse(runSync(process.env, { write: true, snap })
      .then((o) => console.log('stok-sync (kaspi)', JSON.stringify({ degisecek: o.degisecek_ean, wb: (o.wb || []).length, ozon: (o.ozon || []).length, fren: o.fren })))
      .catch((e) => console.log('stok-sync (kaspi) HATA', String(e && e.message || e).slice(0, 200))));
  }
};
