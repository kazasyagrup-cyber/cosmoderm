// Ortak stok senkronu (10.10.2026): Kaspi+WB+Ozon siparişlerinden EAN başına kalan stok R → WB ve Ozon'daki stoğu R'ye DÜŞÜRÜR.
// GitHub Actions her 5 dk tetikler: /api/stok-sync?key=<STOK_SYNC_KEY>. Varsayılan GÖLGE MOD (yazmaz): yazmak için Vercel env STOK_YAZ=1.
// Kurallar: yalnız DÜŞÜŞ yazılır (platform stoğu R'den büyükse); artış/mal gelişi map.json B güncellenerek yapılır. Bozuk veri freni: bir turda
// >%30 EAN değişecekse yazılmaz. Kaspi stoğu bu fonksiyona bağlı değil: kaspi-feed.js her okumada canlı hesaplar.
const core = require('./_stok/core');
const WB_WH = 778307, OZON_WH = 1020005030096510;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const key = process.env.STOK_SYNC_KEY;
  if (!key || String((req.query && req.query.key) || '').trim() !== key.trim()) { res.statusCode = 404; res.end('Not found'); return; }
  const write = process.env.STOK_YAZ === '1' && !(req.query && req.query.dry === '1');
  try {
    const snap = await core.snapshot(process.env);
    if (snap.errors.length) { res.statusCode = 503; res.end(JSON.stringify({ ok: false, errors: snap.errors })); return; }
    const H_WB = { Authorization: process.env.WB_TOKEN, 'Content-Type': 'application/json' };
    const H_OZ_R = core.ozonHeaders(process.env.OZON_READ_ID, process.env.OZON_READ_KEY);
    // mevcut platform stokları
    const wbSkus = Object.values(core.MAP.items).flatMap((s) => s.wb.map((w) => w.sku));
    const ozOffers = Object.values(core.MAP.items).flatMap((s) => s.ozon);
    const wbCur = {}, ozCur = {};
    for (let i = 0; i < wbSkus.length; i += 1000) {
      const d = await core.http(`${core.WB_MP}/api/v3/stocks/${WB_WH}`, { method: 'POST', headers: H_WB, body: JSON.stringify({ skus: wbSkus.slice(i, i + 1000) }) });
      for (const x of d.stocks || []) wbCur[x.sku] = x.amount;
    }
    for (let i = 0; i < ozOffers.length; i += 1000) {
      const d = await core.http(`${core.OZON}/v4/product/info/stocks`, { method: 'POST', headers: H_OZ_R, body: JSON.stringify({ filter: { offer_id: ozOffers.slice(i, i + 1000), visibility: 'ALL' }, limit: 1000, cursor: '' }) });
      for (const it of d.items || []) { const f = (it.stocks || []).find((s) => s.type === 'fbs'); if (f) ozCur[it.offer_id] = f.present; }
    }
    // değişiklik planı (yalnız düşüş)
    const wbPlan = [], ozPlan = [], eans = new Set();
    for (const [ean, s] of Object.entries(core.MAP.items)) {
      const R = snap.R[ean];
      for (const w of s.wb) { const cur = wbCur[w.sku]; if (cur != null && cur > R) { wbPlan.push({ ean, nm: w.nm, sku: w.sku, cur, yeni: R }); eans.add(ean); } }
      for (const o of s.ozon) { const cur = ozCur[o]; if (cur != null && cur > R) { ozPlan.push({ ean, offer_id: o, cur, yeni: R }); eans.add(ean); } }
    }
    const total = Object.keys(core.MAP.items).length;
    const brake = eans.size > 0.3 * total;
    const out = { ok: true, mod: write ? 'YAZ' : 'GOLGE', ean: total, degisecek_ean: eans.size, fren: brake, wb: wbPlan, ozon: ozPlan, sayim: snap.counts };
    if (write && !brake) {
      const wbRes = [], ozRes = [];
      for (let i = 0; i < wbPlan.length; i += 1000) {
        const r = await core.http(`${core.WB_MP}/api/v3/stocks/${WB_WH}`, { method: 'PUT', headers: H_WB, body: JSON.stringify({ stocks: wbPlan.slice(i, i + 1000).map((p) => ({ sku: p.sku, amount: p.yeni })) }) });
        wbRes.push(r);
      }
      const H_OZ_W = core.ozonHeaders(process.env.OZON_WRITE_ID, process.env.OZON_WRITE_KEY);
      for (let i = 0; i < ozPlan.length; i += 100) {
        const r = await core.http(`${core.OZON}/v2/products/stocks`, { method: 'POST', headers: H_OZ_W, body: JSON.stringify({ stocks: ozPlan.slice(i, i + 100).map((p) => ({ offer_id: p.offer_id, stock: p.yeni, warehouse_id: OZON_WH })) }) });
        ozRes.push(r);
      }
      out.yazim_sonuc = { ozon_hata: ozRes.flatMap((r) => (r.result || []).filter((x) => x.errors && x.errors.length)).length };
    }
    console.log('stok-sync', JSON.stringify({ mod: out.mod, ean: total, degisecek: eans.size, wb: wbPlan.length, ozon: ozPlan.length, fren: brake, sayim: snap.counts }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(out));
  } catch (e) {
    console.log('stok-sync HATA', String(e && e.message || e));
    res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: String(e && e.message || e).slice(0, 200) }));
  }
};
