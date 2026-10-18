// Bağsız ilan denetimi (18.10.2026): Kaspi/WB/Ozon'da STOKU OLAN ama map.json'a (ortak stok) bağlı olmayan ilanları bulur.
// Sebep: Ozon'da sonradan açılan / eski EAN'lı ilanlar eşleştirmede sessizce atlanmıştı → satışları ortak stoktan düşülmüyordu.
// Bilerek dışarıda tutulan ilanlar: ./haric.json (başka işin ürünleri vb.) + Kaspi hobi setleri (HOBBY).
const core = require('./core');
const HARIC = require('./haric.json');
const FEED = require('../_kaspi/feed.json');

const WB_CONTENT = 'https://content-api.wildberries.ru';
const WB_WH = 778307;
const HOBBY = /набор|сумочка|сделай сам|рукоделья|творчества|квиллинг/i;

async function denetim(env) {
  const bagsiz = [];
  const haric = (plat, k) => (HARIC[plat] || []).includes(String(k));
  const setli = (plat, k) => !!core.SETIDX[plat][String(k)];

  // OZON: tüm ilanların FBS stoğu
  if (env.OZON_READ_ID && env.OZON_READ_KEY) {
    const H = core.ozonHeaders(env.OZON_READ_ID, env.OZON_READ_KEY);
    const adaylar = [];
    let cursor = '';
    for (let i = 0; i < 20; i++) {
      const d = await core.http(`${core.OZON}/v4/product/info/stocks`, { method: 'POST', headers: H, body: JSON.stringify({ filter: { visibility: 'ALL' }, limit: 1000, cursor }) });
      for (const it of d.items || []) {
        const f = (it.stocks || []).filter((s) => s.type === 'fbs');
        const stok = f.reduce((t, s) => t + (s.present || 0), 0), rezerv = f.reduce((t, s) => t + (s.reserved || 0), 0);
        const o = it.offer_id;
        if ((stok > 0 || rezerv > 0) && !core.IDX.ozon[o] && !setli('ozon', o) && !haric('ozon', o)) adaylar.push({ platform: 'ozon', kod: o, stok, rezerv, ad: '' });
      }
      cursor = d.cursor;
      if (!cursor || !(d.items || []).length) break;
    }
    for (let i = 0; i < adaylar.length; i += 100) {
      const d = await core.http(`${core.OZON}/v3/product/info/list`, { method: 'POST', headers: H, body: JSON.stringify({ offer_id: adaylar.slice(i, i + 100).map((x) => x.kod) }) });
      for (const p of d.items || []) { const a = adaylar.find((x) => x.kod === p.offer_id); if (a) a.ad = p.name; }
    }
    bagsiz.push(...adaylar);
  }

  // WB: tüm kartların barkodları + FBS deposundaki stok
  if (env.WB_TOKEN) {
    const H = { Authorization: env.WB_TOKEN, 'Content-Type': 'application/json' };
    const satir = [];
    let cursor = { limit: 100 };
    for (let i = 0; i < 50; i++) {
      const d = await core.http(`${WB_CONTENT}/content/v2/get/cards/list`, { method: 'POST', headers: H, body: JSON.stringify({ settings: { cursor, filter: { withPhoto: -1 } } }) });
      for (const c of d.cards || []) for (const z of c.sizes || []) for (const s of z.skus || []) satir.push({ sku: s, nm: c.nmID, ad: c.title || '' });
      const c = d.cursor || {};
      if (!c.total || c.total < 100) break;
      cursor = { limit: 100, updatedAt: c.updatedAt, nmID: c.nmID };
    }
    const amt = {};
    for (let i = 0; i < satir.length; i += 1000) {
      const d = await core.http(`${core.WB_MP}/api/v3/stocks/${WB_WH}`, { method: 'POST', headers: H, body: JSON.stringify({ skus: satir.slice(i, i + 1000).map((x) => x.sku) }) });
      for (const x of d.stocks || []) amt[x.sku] = x.amount;
    }
    for (const x of satir) {
      const stok = amt[x.sku] || 0;
      if (stok > 0 && !core.IDX.wb[x.sku] && !setli('wb', x.nm) && !setli('wb', x.sku) && !haric('wb', x.sku)) bagsiz.push({ platform: 'wb', kod: x.sku, nm: x.nm, stok, ad: x.ad });
    }
  }

  // KASPI: feed.json ilanları (bağlı olanların stoğu zaten R'den gelir)
  for (const it of FEED.items || []) {
    const stok = parseInt(it.stock, 10) || 0;
    if (stok > 0 && !core.IDX.kaspi[it.sku] && !setli('kaspi', it.sku) && !haric('kaspi', it.sku) && !HOBBY.test(it.model || '')) bagsiz.push({ platform: 'kaspi', kod: it.sku, stok, ad: it.model || '' });
  }
  return bagsiz;
}

module.exports = { denetim };
