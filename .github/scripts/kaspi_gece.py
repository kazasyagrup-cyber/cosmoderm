# -*- coding: utf-8 -*-
"""19.10.2026 — Kaspi GECE FİYATI günlük yenileme, BULUT sürümü (GitHub Actions `kaspi-gece`, her gün 17:00 Almatı).
Yerel naos-kz-rapor/kaspi_gece_guncelle.py ile AYNI kural (kullanıcı 12.10):
  gece fiyatı = o kartın EN UCUZ RESMİ satıcısının (isBrandOfficialPartner, biz hariç) 50 ₸ ALTI
  - en az %10 net kâr tabanı (taban = alış/0,6, 10'a yukarı yuvarlı); rakip tabanın altındaysa taban
  - asla gündüz fiyatından yüksek olmaz; resmi rakip yoksa / zaten en ucuzsak gece = gündüz
  - gündüz fiyatı (day) DEĞİŞMEZ
  - feed.json'da "sabit_gece": true olan ilanın gece fiyatına dokunulmaz (21.10)
  - 23.10 TESLİMAT EŞİĞİ (kullanıcı): Kaspi'nin satıcıdan kestiği teslimat sipariş TUTARINA göre kademeli (<3.000 173 · <5.000 231 ·
    <10.000 927 · ≥10.000 1.507). Gece fiyatı 9.990 / 4.990'ın hemen üstündeyse ve eşiğe inmek net kârı ARTIRIYORSA (ve kâr ≥%10) → eşiğe iner.
Alış fiyatları secret KASPI_ALIS'ta ({sku: alış}; yerelde kaspiapi/kaspi_alis_secret.json'dan yüklenir).
Repo PUBLIC: loga fiyat/alış YAZILMAZ, sadece sayılar. feed.json'u yazar; commit/push workflow'da.
  python .github/scripts/kaspi_gece.py            hesapla + feed.json yaz
  python .github/scripts/kaspi_gece.py --kuru     yalnız hesapla (deneme)"""
import hashlib, http.cookiejar, json, math, os, sys, time, urllib.request

MID = '15383076'; EXP = 0.30; MIN_KAR = 0.10; INDIRIM = 50
KOM, VERGI = 0.125, 0.03; ESIKLER = (9990, 4990)   # 23.10: teslimat eşiği kuralı (naos-kz-rapor/kaspi_karlilik_esik.py ile aynı varsayım)

def teslimat(p): return 173 if p < 3000 else 231 if p < 5000 else 927 if p < 10000 else 1507
def net(p, c): return p * (1 - KOM - VERGI) - teslimat(p) - c
KURU = '--kuru' in sys.argv
FEED = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'api', '_kaspi', 'feed.json')

ALIS = json.loads(os.environ.get('KASPI_ALIS') or '{}')
if len(ALIS) < 50:
    sys.exit('KASPI_ALIS secret boş/eksik — feed.json yazılmadı')

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept-Language': 'ru-RU,ru;q=0.9'}
OP = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
OP.open(urllib.request.Request('https://kaspi.kz/shop/', headers=UA), timeout=30).read()   # çerez al: yoksa Kaspi isBrandOfficialPartner alanını GÖNDERMİYOR

def offers(pid):
    out = []
    for page in range(5):
        body = json.dumps({'cityId': '750000000', 'id': pid, 'merchantUID': [], 'limit': 50, 'page': page, 'sortOption': 'PRICE', 'highRating': None,
                           'searchText': None, 'isExcellentMerchant': False, 'zoneId': ['Magnum_ZONE1'], 'installationId': '-1'}).encode()
        req = urllib.request.Request('https://kaspi.kz/yml/offer-view/offers/' + pid, data=body, headers={
            **UA, 'Content-Type': 'application/json; charset=UTF-8', 'Accept': 'application/json, text/*', 'X-KS-City': '750000000',
            'Referer': f'https://kaspi.kz/shop/p/-{pid}/'})
        j = None
        for deneme in range(3):
            try: j = json.load(OP.open(req, timeout=30)); break
            except Exception:
                if deneme == 2: raise
                time.sleep(2 * (deneme + 1))
        if page == 0 and j.get('offers') and 'isBrandOfficialPartner' not in j['offers'][0]:
            raise RuntimeError('resmi satıcı alanı gelmedi (çerez/oturum)')
        out += j.get('offers', [])
        if not j.get('offers') or len(out) >= (j.get('total') or 0): break
    return out

SKU_PID = {'182626': '112596890', '186622': '109450800'}   # standart dışı SKU → gerçek Kaspi kartı (kaspi_rakip.py ile aynı)

feed_txt = open(FEED, encoding='utf-8').read()
feed = json.loads(feed_txt)
items = feed['items']

cache, hata, degisen, nedenler = {}, 0, 0, {}
for it in items:
    sku = it['sku']; day = it['day']; old = it['night']
    pid = SKU_PID.get(sku, sku.split('_')[0])
    cost = ALIS.get(sku)
    yeni, neden = day, ''
    if it.get('sabit_gece'):   # 21.10 kullanıcı: elle sabitlenen gece fiyatı (Node A/G/P gündüz −%10, Atoderm Baume 45 2950) — görev DOKUNMAZ
        nedenler['elle sabit'] = nedenler.get('elle sabit', 0) + 1
        continue
    if not pid.isdigit() or not cost:
        yeni, neden = day, 'kart/alış bilinmiyor'
    else:
        if pid not in cache:
            try: cache[pid] = offers(pid)
            except Exception as e: cache[pid] = None; hata += 1; print('HATA kart', pid, type(e).__name__)
            time.sleep(0.3)
        offs = cache[pid]
        if offs is None:
            yeni, neden = day, 'teklifler okunamadı'
        else:
            resmi = [o['price'] for o in offs if o.get('isBrandOfficialPartner') and str(o.get('merchantId')) != MID and o.get('price')]
            if not resmi:
                yeni, neden = day, 'resmi rakip yok'
            else:
                best = min(resmi); hedef = round(best - INDIRIM)
                taban = math.ceil(cost / (1 - EXP - MIN_KAR) / 10) * 10
                if hedef >= day: yeni, neden = day, 'zaten en ucuz resmi'
                elif hedef >= taban: yeni, neden = hedef, 'resmi rakip − 50'
                elif taban < day: yeni, neden = taban, '%10 kâr tabanı'
                else: yeni, neden = day, 'taban ≥ gündüz'
    if cost:   # 23.10 teslimat eşiği: kademenin hemen üstündeki fiyat → eşiğe in (yalnız net kâr artıyorsa)
        for e in ESIKLER:
            if e < yeni and teslimat(e) < teslimat(yeni) and net(e, cost) >= net(yeni, cost) and net(e, cost) >= MIN_KAR * e:
                yeni, neden = e, 'teslimat eşiği'; break
    yeni = int(yeni)
    if yeni != old: degisen += 1
    nedenler[neden] = nedenler.get(neden, 0) + 1
    it['night'] = yeni

ind = [it for it in items if it['night'] < it['day']]
print(f'{len(items)} ilan, {len(cache)} kart okundu, {hata} hata, {degisen} gece fiyatı değişti')
print(f'gece inen ilan: {len(ind)} | ort. indirim %{(sum(1 - it["night"] / it["day"] for it in ind) / max(1, len(ind))) * 100:.1f}')
print('nedenler:', nedenler)
print('parmak izi:', hashlib.sha256(json.dumps([[it['sku'], it['night']] for it in items]).encode()).hexdigest()[:12])

if hata > len(cache) * 0.3:
    sys.exit('ÇOK FAZLA HATA — feed.json yazılmadı')
if KURU:
    print('kuru mod: yazılmadı'); sys.exit(0)
open(FEED, 'w', encoding='utf-8').write(json.dumps(feed, ensure_ascii=False, indent=0))
print('feed.json yazıldı')
