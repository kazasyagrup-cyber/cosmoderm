// Ortak stok senkronu (10.10.2026): Kaspi+WB+Ozon siparişlerinden EAN başına kalan stok R → WB ve Ozon'daki stoğu R'ye DÜŞÜRÜR (mantık: ./_stok/sync.js).
// Tetikleyiciler (17.10): Cloudflare Worker "cosmoderm-stok-cron" her 5 dk (ana), GitHub Actions (yedek, düzensiz), kaspi-feed.js (Kaspi her okuduğunda).
// /api/stok-sync?key=<STOK_SYNC_KEY>. Varsayılan GÖLGE MOD (yazmaz): yazmak için Vercel env STOK_YAZ=1; ?dry=1 her zaman gölge.
// Kaspi stoğu bu fonksiyona bağlı değil: kaspi-feed.js her okumada canlı hesaplar.
const { runSync } = require('./_stok/sync');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const key = process.env.STOK_SYNC_KEY;
  if (!key || String((req.query && req.query.key) || '').trim() !== key.trim()) { res.statusCode = 404; res.end('Not found'); return; }
  const write = process.env.STOK_YAZ === '1' && !(req.query && req.query.dry === '1');
  const artir = !!(req.query && req.query.artir === '1');   // 23.10: Worker günde bir (03:00 Almatı) → eksik kalan WB/Ozon stoğunu R'ye yükselt
  try {
    const out = await runSync(process.env, { write, artir });
    if (!out.ok) { res.statusCode = 503; res.end(JSON.stringify(out)); return; }
    console.log('stok-sync', JSON.stringify({ mod: out.mod, ean: out.ean, degisecek: out.degisecek_ean, wb: out.wb.length, ozon: out.ozon.length, fren: out.fren, sayim: out.sayim, ua: req.headers['user-agent'] || '' }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(out));
  } catch (e) {
    console.log('stok-sync HATA', String(e && e.message || e));
    res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: String(e && e.message || e).slice(0, 200) }));
  }
};
