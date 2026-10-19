# -*- coding: utf-8 -*-
"""19.10.2026 — Kaspi RAKİP İZLEME (GitHub Actions `kaspi-izle`, saatte bir). FİYATA DOKUNMAZ, sadece kaydeder.
Amaç: mavi tikli (isBrandOfficialPartner) rakiplerden hangisi bot kullanıyor, bizim 18:00 gece indirimimize / 07:00 dönüşümüze
ne kadar hızlı ve kaç ₸ ile cevap veriyor — gece botunun kurallarını gerçek veriyle koymak için (kullanıcı kararı 19.10).
Kayıt: izle.json.gz → workflow artifact (repoya commit YOK, Vercel deploy tetiklenmez). Repo public: loga sadece sayılar.
Analiz yerelde: gh run download ile tüm artifact'lar indirilir."""
import datetime, gzip, http.cookiejar, json, os, sys, time, urllib.request

BITIS = datetime.date(2026, 10, 24)   # 3–4 günlük izleme; sonrası çalışmaz
MID = '15383076'
SIMDI = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5)))   # Almatı
if SIMDI.date() > BITIS:
    print('izleme süresi bitti (', BITIS, ') — çalışmadı'); sys.exit(0)

FEED = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'api', '_kaspi', 'feed.json')
SKU_PID = {'182626': '112596890', '186622': '109450800'}   # kaspi_gece.py ile aynı
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept-Language': 'ru-RU,ru;q=0.9'}
OP = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
OP.open(urllib.request.Request('https://kaspi.kz/shop/', headers=UA), timeout=30).read()   # çerez: yoksa isBrandOfficialPartner gelmiyor

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

feed = json.load(open(FEED, encoding='utf-8'))
kartlar = {}
for it in feed['items']:
    pid = SKU_PID.get(it['sku'], it['sku'].split('_')[0])
    if pid.isdigit(): kartlar.setdefault(pid, it['model'])

kayit, hata, resmi_say = {}, 0, 0
for pid, ad in kartlar.items():
    try: offs = offers(pid)
    except Exception as e: hata += 1; print('HATA kart', pid, type(e).__name__); continue
    # mavi tikliler + biz (fiyat, satıcı); resmi olmayanlardan sadece sayı ve en ucuz fiyat
    resmi = [{'m': str(o.get('merchantId')), 'ad': o.get('merchantName'), 'p': o.get('price')}
             for o in offs if o.get('isBrandOfficialPartner') or str(o.get('merchantId')) == MID]
    diger = [o.get('price') for o in offs if not o.get('isBrandOfficialPartner') and str(o.get('merchantId')) != MID and o.get('price')]
    kayit[pid] = {'ad': ad, 'resmi': resmi, 'diger_n': len(diger), 'diger_min': min(diger) if diger else None}
    resmi_say += sum(1 for r in resmi if r['m'] != MID)
    time.sleep(0.3)

out = {'zaman': SIMDI.isoformat(timespec='minutes'), 'kartlar': kayit}
with gzip.open('izle.json.gz', 'wt', encoding='utf-8') as f: json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
print(f'{SIMDI:%d.%m %H:%M} Almatı | {len(kayit)}/{len(kartlar)} kart okundu, {hata} hata, {resmi_say} mavi tikli rakip teklifi kaydedildi')
if hata > len(kartlar) * 0.3: sys.exit('ÇOK FAZLA HATA')
