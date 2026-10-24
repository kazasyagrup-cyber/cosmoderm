// Hızlı stok senkronu (24.10.2026, kullanıcı: "ortak stok 5 dk yerine satış gelince çalışsın").
// Cloudflare Worker "cosmoderm-stok-cron" HER DAKİKA çağırır: son PENCERE_MS içinde Kaspi / WB / Ozon'da yeni sipariş var mı (hafif sorgu)?
// Varsa ortak stok önbelleği temizlenir ve senkron HEMEN çalışır (./_stok/sync.js) → WB/Ozon stoğu ~1 dk içinde düşer.
// Kaspi'deki stok feed'den gelir ve Kaspi feed'i saatte bir okur (Kaspi sınırı) → kaspi-feed.js'teki GÜVENLİK PAYI son adetleri korur.
// /api/stok-hizli?key=<STOK_SYNC_KEY> · &dry=1 her zaman gölge · yanıt: {yeni:{kaspi,wb,ozon}, en_eski_ms, sync?}
const core = require('./_stok/core');
const { runSync } = require('./_stok/sync');
const PENCERE_MS = 150 * 1000;   // Worker dakikada bir çağırıyor; tetik kayması ve sipariş kaydının gecikmesi için 2,5 dk

async function yeniKaspi(env, bas, son) {
  const H = { 'X-Auth-Token': env.KASPI_TOKEN, Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json' };
  const out = [];
  for (const st of core.KASPI_STATES.filter((s) => s !== 'ARCHIVE')) {
    const d = await core.http(`${core.KASPI_API}/orders?page[number]=0&page[size]=20&filter[orders][creationDate][$ge]=${bas}&filter[orders][creationDate][$le]=${son}&filter[orders][state]=${st}`, { headers: H });
    for (const o of d.data || []) out.push({ id: o.id, ts: o.attributes.creationDate });
  }
  return out;
}
async function yeniWb(env, bas) {
  const d = await core.http(`${core.WB_MP}/api/v3/orders/new`, { headers: { Authorization: env.WB_TOKEN, 'Content-Type': 'application/json' } });
  return (d.orders || []).map((o) => ({ id: o.id, ts: Date.parse(o.createdAt) || 0 })).filter((o) => o.ts >= bas);
}
async function yeniOzon(env, bas, son) {
  const r = await core.http(`${core.OZON}/v4/posting/fbs/list`, { method: 'POST', headers: core.ozonHeaders(env.OZON_READ_ID, env.OZON_READ_KEY),
    body: JSON.stringify({ dir: 'DESC', filter: { since: new Date(bas).toISOString().slice(0, 19) + 'Z', to: new Date(son).toISOString().slice(0, 19) + 'Z' }, limit: 20, cursor: '', with: {} }) });
  return (r.postings || []).filter((p) => p.status !== 'cancelled').map((p) => ({ id: p.posting_number, ts: Date.parse(p.in_process_at || p.created_at) || 0 }));
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const key = process.env.STOK_SYNC_KEY;
  if (!key || String((req.query && req.query.key) || '').trim() !== key.trim()) { res.statusCode = 404; res.end('Not found'); return; }
  const son = Date.now(), bas = son - PENCERE_MS, env = process.env;
  const yeni = {}, hata = [];
  await Promise.all([['kaspi', () => yeniKaspi(env, bas, son)], ['wb', () => yeniWb(env, bas)], ['ozon', () => yeniOzon(env, bas, son)]].map(async ([ad, fn]) => {
    try { yeni[ad] = await fn(); } catch (e) { yeni[ad] = []; hata.push(ad + ': ' + String(e && e.message || e).slice(0, 120)); }
  }));
  const hepsi = [...yeni.kaspi, ...yeni.wb, ...yeni.ozon];
  const out = { yeni: { kaspi: yeni.kaspi.length, wb: yeni.wb.length, ozon: yeni.ozon.length }, en_eski_ms: hepsi.length ? Math.min(...hepsi.map((o) => o.ts || son)) : null, hata };
  if (hepsi.length) {
    core.cacheTemizle();   // yeni sipariş 4 dk'lık önbellekte yok → taze oku
    const write = env.STOK_YAZ === '1' && !(req.query && req.query.dry === '1');
    try {
      const s = await runSync(env, { write });
      out.sync = s.ok ? { mod: s.mod, degisecek_ean: s.degisecek_ean, fren: s.fren } : { ok: false, errors: s.errors };
    } catch (e) { out.sync = { ok: false, error: String(e && e.message || e).slice(0, 200) }; }
    out.bitti_ms = Date.now();
    console.log('stok-hizli', JSON.stringify(out));
  }
  res.statusCode = hata.length === 3 ? 503 : 200;
  res.end(JSON.stringify(out));
};
