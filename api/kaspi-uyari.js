// Kaspi UYARILI KART siparişleri (26.10.2026, gizli anahtarlı): görseli/hacmi gerçek ürünle tutmayan kartlardaki ilanlarımızdan (api/_kaspi/uyari.json)
// gelen açık siparişleri listeler; her sipariş için müşteriye hazır bilgilendirme mesajı + «Mesajı kopyala» düğmesi verir.
// 26.10: Kaspi API müşteri telefonunu gizliyor (0000000…) → kullanıcı mesajı Kaspi kabinetindeki sohbetten, sipariş numarasıyla bulup gönderir.
// Kullanım: /api/kaspi-uyari?key=<STOK_SYNC_KEY>&days=3   ·   ya da ?t=<sayfa kodu> (= sha256(STOK_SYNC_KEY + ':kaspi-uyari') ilk 32 hane; Worker'ın mailindeki bağlantı — ana anahtarı açığa çıkarmaz)   ·   &json=1 → yalnız sipariş kodları (Worker'ın yeni sipariş maili için; telefon/isim YOK)
const crypto = require('crypto');
const U = require('./_kaspi/uyari.json');
const API = 'https://kaspi.kz/shop/api/v2';
const STATES = ['NEW', 'SIGN_REQUIRED', 'PICKUP', 'DELIVERY', 'KASPI_DELIVERY'];   // açık siparişler (ARCHIVE = teslim/iptal, mesaj için geç)

// 28.10: Kaspi'ye aynı anda en fazla 8 istek (yüzlerce paralel /entries isteği soğuk başlangıçta 429 → feed 503 veriyordu)
async function sinirli(list, fn, n = 8) {
  const out = new Array(list.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); } }));
  return out;
}
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

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function telefon(t) {   // Kaspi 10 hane (7071234567) verir → wa.me 11 hane (77071234567). 26.10: API numarayı gizliyor (0000000…) → null
  const d = String(t || '').replace(/\D/g, '');
  if (!d || /^0+$/.test(d.slice(0, 7))) return null;
  if (d.length === 10) return '7' + d;
  if (d.length === 11 && (d[0] === '8' || d[0] === '7')) return '7' + d.slice(1);
  return d;
}
function mesaj(s) {
  const urun = s.kalemler.map((k) => `${k.ad}${k.adet > 1 ? ` × ${k.adet}` : ''}`).join(', ');
  const fark = [...new Set(s.kalemler.map((k) => k.fark))].join('\n');
  const alt = [...new Set(s.kalemler.map((k) => k.alternatif).filter(Boolean))].map((a) => '\n\n' + a).join('');   // 26.10: pompalı ürün bizim ilanımızdan (ek satış, sipariş iptal ettirilmez)
  return U.sablon.replace('{isim}', s.isim ? ', ' + s.isim : '').replace('{kod}', s.kod).replace('{urun}', urun).replace('{fark}', fark + alt);
}

function sayfa(list, days) {
  const kart = list.map((s, i) => {
    const m = mesaj(s), tel = telefon(s.tel);
        return `<div class="k"><div class="b"><b>№ ${esc(s.kod)}</b><span>${esc(s.tarih)} · ${esc(s.durum)}</span></div>
<div>${s.kalemler.map((k) => `${esc(k.ad)} × ${k.adet}`).join('<br>')}</div>
<div class="m">Müşteri / Покупатель: ${esc(s.isim || '—')}${tel ? ' · +' + esc(tel) : ''}</div>
<textarea id="m${i}" hidden>${esc(m)}</textarea>
<button class="c" data-kod="${esc(s.kod)}" onclick="kopyala(${i},this)">Mesajı kopyala / Скопировать</button>
${tel ? `<a class="w" href="https://wa.me/${tel}?text=${encodeURIComponent(m)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
<details><summary>Mesajı gör / Показать текст</summary><pre>${esc(m)}</pre></details></div>`;
  }).join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Kaspi uyarı mesajları</title>
<style>body{font-family:system-ui,Arial,sans-serif;background:#f6f3ee;color:#222;margin:0;padding:16px;max-width:640px;margin:auto}h1{font-size:20px}.k{background:#fff;border-radius:12px;padding:14px;margin:12px 0;box-shadow:0 1px 3px #0002}.b{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px}.b span,.m{color:#666;font-size:14px}.m{margin:6px 0}button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:12px;cursor:pointer}.c{display:block;width:100%;background:#2b4c7e;color:#fff;margin:10px 0 6px}.w{display:block;text-align:center;text-decoration:none;font-weight:600;padding:12px;border-radius:10px;background:#25d366;color:#fff}.k.ok{opacity:.55}pre{white-space:pre-wrap;font-family:inherit;font-size:14px;background:#faf8f5;padding:10px;border-radius:8px}</style></head>
<body><h1>Uyarılı kart siparişleri / Заказы из карточек с неверным фото</h1><p class="m">Son ${days} gün, açık siparişler: <b>${list.length}</b>. «Mesajı kopyala» → Kaspi kabinetinde siparişi numarasıyla açın → müşteri sohbetine yapıştırıp gönderin. Kopyalanan sipariş soluklaşır (bu cihazda hatırlanır).</p>
<p class="m">За ${days} дн., открытых заказов: <b>${list.length}</b>. «Скопировать» → откройте заказ по номеру в кабинете Kaspi → вставьте сообщение в чат с покупателем и отправьте. Скопированный заказ становится бледным (запоминается на этом устройстве).</p>${kart || '<p>Şu an uyarı gerektiren açık sipariş yok. / Сейчас таких заказов нет.</p>'}
<script>
function kopyala(i,b){const t=document.getElementById('m'+i).value;const ok=()=>{b.textContent='Kopyalandı / Скопировано ✓';b.closest('.k').classList.add('ok');try{localStorage.setItem('kopya-'+b.dataset.kod,'1')}catch(e){}setTimeout(()=>b.textContent='Mesajı kopyala / Скопировать',2000)};if(navigator.clipboard)navigator.clipboard.writeText(t).then(ok,()=>{});else{const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();ok()}}
document.querySelectorAll('.c').forEach(b=>{try{if(localStorage.getItem('kopya-'+b.dataset.kod))b.closest('.k').classList.add('ok')}catch(e){}});
</script></body></html>`;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const key = process.env.STOK_SYNC_KEY;
  const sayfaKodu = key && crypto.createHash('sha256').update(key.trim() + ':kaspi-uyari').digest('hex').slice(0, 32);
  const q = req.query || {};
  if (!key || (String(q.key || '').trim() !== key.trim() && String(q.t || '') !== sayfaKodu)) { res.statusCode = 404; res.end('Not found'); return; }
  if (!process.env.KASPI_TOKEN) { res.statusCode = 503; res.end(JSON.stringify({ ok: false, error: 'KASPI_TOKEN yok' })); return; }
  const days = Math.min(14, Math.max(1, parseInt((req.query && req.query.days) || '3', 10) || 3));
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
    const tekil = new Map();   // Kaspi aynı siparişi DELIVERY ve KASPI_DELIVERY listesinde iki kez döndürebiliyor (22.10 dersi)
    for (const od of (await Promise.all(STATES.map(listState))).flat()) tekil.set(od.id, od);
    const rows = await sinirli([...tekil.values()], async (od) => {
      const e = await kaspi(`/orders/${od.id}/entries`, process.env.KASPI_TOKEN);
      const kalemler = (e.data || []).map((en) => {
        const sku = en.attributes.offer && en.attributes.offer.code, u = U.ilanlar[sku];
        return u ? { sku, ad: u.ad, fark: u.fark, alternatif: u.alternatif, adet: en.attributes.quantity } : null;
      }).filter(Boolean);
      if (!kalemler.length) return null;
      const a = od.attributes || {}, c = a.customer || {};
      return { kod: a.code || od.id, ms: a.creationDate, tarih: new Date((a.creationDate || 0) + 5 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' '),
        durum: a.state, isim: (c.firstName || c.name || '').trim(), tel: c.cellPhone, kalemler };
    });
    const list = rows.filter(Boolean).sort((x, y) => y.ms - x.ms);
    if (req.query && req.query.json) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, adet: list.length, siparisler: list.map((s) => ({ kod: s.kod, tarih: s.tarih, urun: s.kalemler.map((k) => k.ad + ' × ' + k.adet).join(', ') })) }));
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(sayfa(list, days));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: String(e && e.message || e).slice(0, 200) })); }
};
