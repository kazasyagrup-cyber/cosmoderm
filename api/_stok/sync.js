// Ortak stok senkron mantığı (10.10.2026; 17.10'da stok-sync.js'ten ayrıldı): EAN başına kalan stok R → WB ve Ozon'daki stoğu R'ye DÜŞÜRÜR.
// Çağıranlar: /api/stok-sync (Cloudflare Worker her 5 dk + GitHub Actions yedek) ve kaspi-feed.js (Kaspi listeyi her okuduğunda, yanıttan sonra).
// Kurallar: yalnız DÜŞÜŞ yazılır (platform stoğu R'den büyükse); artış/mal gelişi map.json B güncellenerek + stok_artis_yaz.py ile yapılır.
// Bozuk veri freni: bir turda >%30 EAN değişecekse yazılmaz. Yazma yalnız Vercel env STOK_YAZ=1 iken.
const core = require('./core');
const WB_WH = 778307, OZON_WH = 1020005030096510;

// snap verilirse yeniden hesaplanmaz (kaspi-feed zaten hesaplamış olur)
async function runSync(env, { write, snap } = {}) {
  snap = snap || await core.snapshot(env);
  if (snap.errors.length) return { ok: false, errors: snap.errors };
  const H_WB = { Authorization: env.WB_TOKEN, 'Content-Type': 'application/json' };
  const H_OZ_R = core.ozonHeaders(env.OZON_READ_ID, env.OZON_READ_KEY);
  // mevcut platform stokları
  const setler = core.MAP.setler || [];
  const wbSkus = Object.values(core.MAP.items).flatMap((s) => s.wb.map((w) => w.sku)).concat(setler.filter((x) => x.platform === 'wb').map((x) => String(x.key)));
  const ozOffers = Object.values(core.MAP.items).flatMap((s) => s.ozon).concat(setler.filter((x) => x.platform === 'ozon').map((x) => String(x.key)));
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
  // SETLER: kapasite = bileşenlerden çıkan set sayısı. 'acik' (kullanıcı onaylı) setlerde stok = kapasite (artış dahil); kapalı setlerde yalnız düşüş (0 kalır).
  for (const st of setler) {
    const cap = snap.S[st.platform + ':' + st.key];
    const cur = st.platform === 'wb' ? wbCur[String(st.key)] : ozCur[String(st.key)];
    if (cur == null) continue;
    if (st.acik ? cur !== cap : cur > cap) {
      (st.platform === 'wb' ? wbPlan : ozPlan).push(st.platform === 'wb' ? { ean: 'set:' + st.key, nm: null, sku: String(st.key), cur, yeni: cap } : { ean: 'set:' + st.key, offer_id: String(st.key), cur, yeni: cap });
      eans.add('set:' + st.key);
    }
  }
  const total = Object.keys(core.MAP.items).length + setler.length;
  const fren = parseFloat(env.STOK_FREN_ORAN || '0.3');   // varsayılan %30; ilk açılış senkronu için kullanıcı Vercel'de GEÇİCİ 1 yapar, sonra siler
  const brake = eans.size > fren * total;
  const out = { ok: true, mod: write ? 'YAZ' : 'GOLGE', ean: total, degisecek_ean: eans.size, fren: brake, wb: wbPlan, ozon: ozPlan, sayim: snap.counts };
  if (write && !brake) {
    for (let i = 0; i < wbPlan.length; i += 1000) {
      await core.http(`${core.WB_MP}/api/v3/stocks/${WB_WH}`, { method: 'PUT', headers: H_WB, body: JSON.stringify({ stocks: wbPlan.slice(i, i + 1000).map((p) => ({ sku: p.sku, amount: p.yeni })) }) });
    }
    const H_OZ_W = core.ozonHeaders(env.OZON_WRITE_ID, env.OZON_WRITE_KEY);
    const ozRes = [];
    for (let i = 0; i < ozPlan.length; i += 100) {
      const r = await core.http(`${core.OZON}/v2/products/stocks`, { method: 'POST', headers: H_OZ_W, body: JSON.stringify({ stocks: ozPlan.slice(i, i + 100).map((p) => ({ offer_id: p.offer_id, stock: p.yeni, warehouse_id: OZON_WH })) }) });
      ozRes.push(r);
    }
    out.yazim_sonuc = { ozon_hata: ozRes.flatMap((r) => (r.result || []).filter((x) => x.errors && x.errors.length)).length };
  }
  return out;
}

module.exports = { runSync };
