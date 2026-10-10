// Stok durumu (salt okuma, gizli anahtarlı): EAN başına B, platform satışları, kalan R, 14 gün satış hızı. stok_alarm.py (yerel) okur.
const core = require('./_stok/core');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const key = process.env.STOK_SYNC_KEY;
  if (!key || String((req.query && req.query.key) || '').trim() !== key.trim()) { res.statusCode = 404; res.end('Not found'); return; }
  try {
    const snap = await core.snapshot(process.env);
    const items = Object.entries(core.MAP.items).map(([ean, s]) => {
      const t = (snap.sold[ean] || { kaspi: 0, wb: 0, ozon: 0 });
      return { ean, ad: s.ad, B: s.B, kaspi: t.kaspi, wb: t.wb, ozon: t.ozon, R: snap.R[ean], satis14: snap.v14[ean] || 0, ilan: { kaspi: s.kaspi.length, wb: s.wb.length, ozon: s.ozon.length } };
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const setler = (core.MAP.setler || []).map((st) => ({ platform: st.platform, key: st.key, ad: st.ad, acik: st.acik, kapasite: snap.S[st.platform + ':' + st.key], bilesen: st.bilesen }));
    res.end(JSON.stringify({ ok: !snap.errors.length, hatalar: snap.errors, baseline_ms: core.MAP.baseline_ms, sayim: snap.counts, items, setler }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: String(e && e.message || e).slice(0, 200) })); }
};
