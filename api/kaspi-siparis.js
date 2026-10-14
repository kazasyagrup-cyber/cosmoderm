// Kaspi son siparişler (SALT OKUMA, gizli anahtarlı): yerel bilgisayardan kaspi.kz'ye ulaşılamadığında siparişleri (saat, ürün, adet) Vercel üzerinden görmek için.
// Kullanım: /api/kaspi-siparis?key=<STOK_SYNC_KEY>&days=3&q=ultra   (days en çok 7; q: ürün adı veya sku içinde aranır, isteğe bağlı)
const API = 'https://kaspi.kz/shop/api/v2';
const STATES = ['NEW', 'SIGN_REQUIRED', 'PICKUP', 'DELIVERY', 'KASPI_DELIVERY', 'ARCHIVE'];

async function kaspi(path, token) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(API + path, { headers: { 'X-Auth-Token': token, Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json' } });
      if (r.ok) return r.json();
      last = new Error('kaspi ' + r.status);
      if (r.status < 500 && r.status !== 429) break;
    } catch (e) { last = e; }
    await new Promise((ok) => setTimeout(ok, [400, 1200, 0][i]));
  }
  throw last;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const key = process.env.STOK_SYNC_KEY;
  if (!key || String((req.query && req.query.key) || '').trim() !== key.trim()) { res.statusCode = 404; res.end('Not found'); return; }
  if (!process.env.KASPI_TOKEN) { res.statusCode = 503; res.end(JSON.stringify({ ok: false, error: 'KASPI_TOKEN yok' })); return; }
  const days = Math.min(7, Math.max(1, parseInt((req.query && req.query.days) || '3', 10) || 3));
  const q = String((req.query && req.query.q) || '').trim().toLowerCase();
  const to = Date.now(), since = to - days * 86400000;
  try {
    const listState = async (state) => {
      const out = [];
      for (let page = 0; page < 10; page++) {
        const o = await kaspi(`/orders?page[number]=${page}&page[size]=100&filter[orders][creationDate][$ge]=${since}&filter[orders][creationDate][$le]=${to}&filter[orders][state]=${state}`, process.env.KASPI_TOKEN);
        out.push(...(o.data || []));
        if (!o.meta || page + 1 >= o.meta.pageCount) break;
      }
      return out;
    };
    const orders = (await Promise.all(STATES.map(listState))).flat();
    const rows = await Promise.all(orders.map(async (od) => {
      const e = await kaspi(`/orders/${od.id}/entries`, process.env.KASPI_TOKEN);
      const a = od.attributes || {};
      return {
        siparis: a.code || od.id, tarih_almati: new Date((a.creationDate || 0) + 5 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' '), ms: a.creationDate,
        durum: a.state, statu: a.status, toplam: a.totalPrice,
        kalemler: (e.data || []).map((en) => ({ sku: en.attributes.offer && en.attributes.offer.code, ad: en.attributes.offer && en.attributes.offer.name, adet: en.attributes.quantity, fiyat: en.attributes.basePrice })),
      };
    }));
    const out = rows.filter((r) => !q || r.kalemler.some((k) => String(k.ad || '').toLowerCase().includes(q) || String(k.sku || '').toLowerCase().includes(q))).sort((x, y) => y.ms - x.ms);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, gun: days, adet: out.length, siparisler: out }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: String(e && e.message || e).slice(0, 200) })); }
};
