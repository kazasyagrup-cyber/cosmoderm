// Ortak stok çekirdeği (10.10.2026): Kaspi + WB + Ozon siparişlerinden EAN başına kalan stok R hesaplar.
// R = max(0, B − Σ(baseline'dan beri üç platformda satılan, iptal hariç)). B ve eşleştirme: ./map.json (stok_map_uret.py üretir).
// Gizli değerler SADECE Vercel env'de: KASPI_TOKEN, WB_TOKEN, OZON_READ_ID/KEY, OZON_WRITE_ID/KEY, STOK_SYNC_KEY.
const MAP = require('./map.json');

const KASPI_API = 'https://kaspi.kz/shop/api/v2';
const WB_MP = 'https://marketplace-api.wildberries.ru';
const OZON = 'https://api-seller.ozon.ru';
const KASPI_CANCELLED = new Set(['CANCELLED', 'CANCELLING', 'RETURNED', 'KASPI_DELIVERY_RETURN_REQUESTED', 'RETURN_ACCEPTED_BY_MERCHANT']);
const KASPI_STATES = ['NEW', 'SIGN_REQUIRED', 'PICKUP', 'DELIVERY', 'KASPI_DELIVERY', 'ARCHIVE'];
const CACHE_MS = 4 * 60 * 1000;
const cache = {};

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function withCache(name, fn) {
  const c = cache[name];
  if (c && Date.now() - c.at < CACHE_MS) return c.v;
  const v = await fn();
  cache[name] = { at: Date.now(), v };
  return v;
}
async function http(url, opts, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(20000) }, opts));
      if (r.ok) { const t = await r.text(); return t ? JSON.parse(t) : {}; }
      last = new Error(url.split('?')[0].replace(/^https:\/\//, '') + ' ' + r.status + ' ' + (await r.text()).slice(0, 80).replace(/\s+/g, ' '));
      if (r.status < 500 && r.status !== 429) break;
    } catch (e) { last = e; }
    await sleep([400, 1200, 0][i]);
  }
  throw last;
}

// ---------- KASPI (kaspi-feed.js'teki mantığın aynısı; kayıt = {ts, key: sku, q})
async function kaspiRecords(sinceMs, token) {
  return withCache('kaspi', async () => {
    const to = Date.now();
    const H = { 'X-Auth-Token': token, Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json' };
    const listState = async (state) => {
      const out = [];
      for (let page = 0; page < 20; page++) {
        const o = await http(`${KASPI_API}/orders?page[number]=${page}&page[size]=100&filter[orders][creationDate][$ge]=${sinceMs}&filter[orders][creationDate][$le]=${to}&filter[orders][state]=${state}`, { headers: H });
        out.push(...(o.data || []));
        if (!o.meta || page + 1 >= o.meta.pageCount) break;
      }
      return out;
    };
    const orders = (await Promise.all(KASPI_STATES.map(listState))).flat().filter((od) => !KASPI_CANCELLED.has(od.attributes.status));
    const entries = await Promise.all(orders.map((od) => http(`${KASPI_API}/orders/${od.id}/entries`, { headers: H })));
    const recs = [];
    entries.forEach((e, i) => {
      const ts = orders[i].attributes.creationDate || 0;
      for (const en of e.data || []) {
        const sku = en.attributes.offer && en.attributes.offer.code;
        if (sku) recs.push({ ts, key: sku, q: en.attributes.quantity || 0 });
      }
    });
    return recs;
  });
}

// ---------- WB FBS (kayıt key = barkod/sku). İptal edilenler (supplierStatus=cancel / wbStatus canceled*/declined*) sayılmaz.
async function wbRecords(sinceMs, token) {
  return withCache('wb', async () => {
    const H = { Authorization: token, 'Content-Type': 'application/json' };
    const from = Math.floor(sinceMs / 1000), to = Math.floor(Date.now() / 1000);
    const orders = [];
    let next = 0;
    for (let i = 0; i < 30; i++) {
      const d = await http(`${WB_MP}/api/v3/orders?limit=1000&next=${next}&dateFrom=${from}&dateTo=${to}`, { headers: H });
      orders.push(...(d.orders || []));
      if (!d.next || (d.orders || []).length < 1000) break;
      next = d.next;
    }
    const st = {};
    for (let i = 0; i < orders.length; i += 1000) {
      const d = await http(`${WB_MP}/api/v3/orders/status`, { method: 'POST', headers: H, body: JSON.stringify({ orders: orders.slice(i, i + 1000).map((o) => o.id) }) });
      for (const o of d.orders || []) st[o.id] = o;
    }
    const recs = [];
    for (const o of orders) {
      const s = st[o.id] || {};
      if (s.supplierStatus === 'cancel' || /^(canceled|declined)/i.test(s.wbStatus || '')) continue;
      const sku = (o.skus || [])[0];
      if (sku) recs.push({ ts: Date.parse(o.createdAt) || 0, key: sku, q: 1 });
    }
    return recs;
  });
}

// ---------- OZON FBS (kayıt key = offer_id). 'cancelled' sayılmaz.
function ozonHeaders(id, key) { return { 'Client-Id': id, 'Api-Key': key, 'Content-Type': 'application/json' }; }
async function ozonRecords(sinceMs, id, key) {
  return withCache('ozon', async () => {
    const H = ozonHeaders(id, key);
    const since = new Date(sinceMs).toISOString().slice(0, 19) + 'Z', to = new Date().toISOString().slice(0, 19) + 'Z';
    const recs = [];
    for (let off = 0; off < 5000; off += 100) {
      const r = (await http(`${OZON}/v3/posting/fbs/list`, { method: 'POST', headers: H, body: JSON.stringify({ dir: 'DESC', filter: { since, to }, limit: 100, offset: off, with: {} }) })).result || {};
      for (const p of r.postings || []) {
        if (p.status === 'cancelled') continue;
        const ts = Date.parse(p.in_process_at || p.created_at) || 0;
        for (const pr of p.products || []) recs.push({ ts, key: pr.offer_id, q: pr.quantity || 1 });
      }
      if (!r.has_next) break;
    }
    return recs;
  });
}

// ---------- Birleştir
const IDX = { kaspi: {}, wb: {}, ozon: {} };   // platform anahtarı → EAN
for (const [ean, s] of Object.entries(MAP.items)) {
  for (const k of s.kaspi) IDX.kaspi[k] = ean;
  for (const w of s.wb) IDX.wb[w.sku] = ean;
  for (const o of s.ozon) IDX.ozon[o] = ean;
}

// env'den kimlik bilgileri; eksik platform → hata (R güvenilmez)
function creds(env) {
  return { kaspi: env.KASPI_TOKEN, wb: env.WB_TOKEN, ozonId: env.OZON_READ_ID, ozonKey: env.OZON_READ_KEY };
}

// snapshot: { R: {ean: n}, sold: {ean: {kaspi, wb, ozon}}, recs: {platform: [..]}, errors: [] }
async function snapshot(env, opts = {}) {
  const c = creds(env);
  const base = MAP.baseline_ms;
  const since = Math.min(base, Date.now() - 14 * 86400000);   // hız hesabı için 14 gün geri; satış sayımı baseline'dan
  const errors = [];
  const run = async (name, ok, fn) => { if (!ok) { errors.push(name + ': kimlik yok'); return []; } try { return await fn(); } catch (e) { errors.push(name + ': ' + String(e && e.message || e).slice(0, 140)); return []; } };
  const [kas, wb, oz] = await Promise.all([
    run('kaspi', c.kaspi, () => kaspiRecords(Math.max(since, Date.now() - 13 * 86400000), c.kaspi)),   // Kaspi sipariş filtresi ~14 gün
    run('wb', c.wb, () => wbRecords(Math.max(since, Date.now() - 29 * 86400000), c.wb)),
    run('ozon', c.ozonId && c.ozonKey, () => ozonRecords(since, c.ozonId, c.ozonKey)),
  ]);
  const sold = {}, v14 = {};
  const add = (plat, recs) => {
    for (const r of recs) {
      const e = IDX[plat][r.key];
      if (!e) continue;
      if (r.ts >= base) { (sold[e] = sold[e] || { kaspi: 0, wb: 0, ozon: 0 })[plat] += r.q; }
      if (r.ts >= Date.now() - 14 * 86400000) v14[e] = (v14[e] || 0) + r.q;
    }
  };
  if (Date.now() - base > 13 * 86400000) errors.push('baseline 13 günden eski → stok_rebaseline.py çalıştırılmalı (Kaspi siparişleri eksik okunur)');
  add('kaspi', kas); add('wb', wb); add('ozon', oz);
  const R = {};
  for (const [ean, s] of Object.entries(MAP.items)) {
    const t = sold[ean] || { kaspi: 0, wb: 0, ozon: 0 };
    R[ean] = Math.max(0, s.B - t.kaspi - t.wb - t.ozon);
  }
  return { R, sold, v14, errors, counts: { kaspi: kas.length, wb: wb.length, ozon: oz.length } };
}

module.exports = { MAP, IDX, snapshot, http, ozonHeaders, WB_MP, OZON, sleep, creds };
