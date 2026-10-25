# -*- coding: utf-8 -*-
"""25.10.2026 — Kaspi SIK RAKİP TAKİBİ (GitHub Actions `kaspi-takip`). FİYATA DOKUNMAZ, sadece kaydeder.
Amaç: büyük satıcıların (Cvetnaya, MonAmie, Grande Pharm, Зерде-Фарма) ve botların (ФАРМАКОМ, Raus Pharm, АлиС Фарм, DERMA)
fiyat mantığını çözmek: ne zaman, ne sıklıkla, kime göre, kaç dakikada tepki veriyorlar. kaspi-izle saatlikti ama GitHub
zamanlayıcısı gecikti (5 günde 29 kayıt) → bu betik tek iş içinde döngü kurar: ~5,5 saat boyunca 10 dakikada bir ölçüm.
Her ölçümde ilanımız olan kartlardaki TÜM satıcılar (resmi olmayanlar dahil). Kayıt: takip.jsonl.gz → artifact (commit yok).
Repo public: loga sadece sayılar. Analiz yerelde: gh run download -p "takip-*"."""
import datetime, gzip, http.cookiejar, json, os, sys, time, urllib.request

BITIS = datetime.datetime(2026, 10, 29, 23, 59, tzinfo=datetime.timezone(datetime.timedelta(hours=5)))
ARALIK = 600                      # saniye: ölçüm aralığı
SURE = 5.5 * 3600                 # bir iş en fazla bu kadar döner (GitHub iş sınırı 6 saat)
MID = '15383076'
TZ = datetime.timezone(datetime.timedelta(hours=5))   # Almatı
FEED = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'api', '_kaspi', 'feed.json')
SKU_PID = {'182626': '112596890', '186622': '109450800'}   # kaspi_gece.py ile aynı
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Accept-Language': 'ru-RU,ru;q=0.9'}

if datetime.datetime.now(TZ) > BITIS:
    print('takip süresi bitti (', BITIS.date(), ') — çalışmadı'); sys.exit(0)


def oturum():
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    op.open(urllib.request.Request('https://kaspi.kz/shop/', headers=UA), timeout=30).read()   # çerez: yoksa isBrandOfficialPartner gelmiyor
    return op


def offers(op, pid):
    out = []
    for page in range(5):
        body = json.dumps({'cityId': '750000000', 'id': pid, 'merchantUID': [], 'limit': 50, 'page': page, 'sortOption': 'PRICE', 'highRating': None,
                           'searchText': None, 'isExcellentMerchant': False, 'zoneId': ['Magnum_ZONE1'], 'installationId': '-1'}).encode()
        req = urllib.request.Request('https://kaspi.kz/yml/offer-view/offers/' + pid, data=body, headers={
            **UA, 'Content-Type': 'application/json; charset=UTF-8', 'Accept': 'application/json, text/*', 'X-KS-City': '750000000',
            'Referer': f'https://kaspi.kz/shop/p/-{pid}/'})
        j = None
        for deneme in range(3):
            try: j = json.load(op.open(req, timeout=30)); break
            except Exception:
                if deneme == 2: raise
                time.sleep(2 * (deneme + 1))
        out += j.get('offers', [])
        if not j.get('offers') or len(out) >= (j.get('total') or 0): break
    return out


kartlar = {}
for it in json.load(open(FEED, encoding='utf-8'))['items']:
    pid = SKU_PID.get(it['sku'], it['sku'].split('_')[0])
    if pid.isdigit(): kartlar.setdefault(pid, it['model'])

bas = time.time(); tur = 0
with gzip.open('takip.jsonl.gz', 'at', encoding='utf-8') as f:
    while time.time() - bas < SURE and datetime.datetime.now(TZ) <= BITIS:
        t0 = time.time(); tur += 1
        try: op = oturum()
        except Exception as e: print('oturum hatası', type(e).__name__); time.sleep(60); continue
        kayit, hata = {}, 0
        for pid in kartlar:
            try: offs = offers(op, pid)
            except Exception: hata += 1; continue
            # her satıcı: m=kimlik, p=fiyat, r=resmi partner (1/0); sıra = Kaspi'nin gösterdiği fiyat sırası
            kayit[pid] = [[str(o.get('merchantId')), o.get('price'), 1 if o.get('isBrandOfficialPartner') else 0] for o in offs]
            time.sleep(0.25)
        f.write(json.dumps({'z': datetime.datetime.now(TZ).isoformat(timespec='minutes'), 'k': kayit}, separators=(',', ':')) + '\n'); f.flush()
        print(f'tur {tur}: {len(kayit)}/{len(kartlar)} kart, {hata} hata, {int(time.time() - t0)} sn', flush=True)
        time.sleep(max(30, ARALIK - (time.time() - t0)))
# satıcı adları (bir kez): kimlik → ad
adlar = {}
try:
    op = oturum()
    for pid in list(kartlar)[:400]:
        for o in offers(op, pid): adlar[str(o.get('merchantId'))] = o.get('merchantName')
        time.sleep(0.2)
except Exception: pass
json.dump(adlar, open('takip_adlar.json', 'w', encoding='utf-8'), ensure_ascii=False)
