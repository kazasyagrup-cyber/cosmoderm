# -*- coding: utf-8 -*-
"""26.10.2026 KASPI BOT TESTİ — GitHub Actions `kaspi-bot-testi` (kullanıcı onayı 25.10: 8 firmanın hepsi, bulutta çalışsın).
Amaç SATIŞ DEĞİL: ФАРМАКОМ, Raus, АлиС, DERMA, Grande, Cvetnaya, Зерде, MonAmie botlarının TABAN / TAVAN / TEPKİ SÜRESİ.
Yöntem: 5 kartta GÜNDÜZ fiyatımızı (feed.json 'day') saat saat değiştir → Kaspi :02'de okur → kartları 1 dk'da bir oku.
  08:02–13:02 iniş: ilk adım hedef firmaların en ucuzu ×0,97, sonra her saat ×0,95 — ASLA bizim başa başın altına inmez.
  14:02–15:02 tavan: РРЦ ×1,10.  16:02 geri: orijinal gündüz fiyatı (gece botu 16:45'te temiz feed ile çalışır).
İki parça (GitHub iş sınırı 6 saat): --parca 1 → 13:10'a kadar, --parca 2 → 16:40'a kadar; durum.json parçalar arasında artifact ile taşınır.
Güvenlik: hata / iptal → orijinal fiyatlar geri yazılır (ayrıca iş akışındaki "geri al" adımı --geri ile). --kuru: hiçbir şey yazmaz, 3 tur okur.
Repo public: loga fiyat yazılmaz (kayıtlar artifact'ta)."""
import datetime, json, os, subprocess, sys, time, urllib.request, http.cookiejar
TZ = datetime.timezone(datetime.timedelta(hours=5))   # Almatı
KOK = os.getcwd()
FEED = os.path.join(KOK, 'api', '_kaspi', 'feed.json')
CIKTI = os.path.join(KOK, 'bot_testi'); os.makedirs(CIKTI, exist_ok=True)
DURUM = os.path.join(CIKTI, 'durum.json')
FK = os.environ.get('KASPI_FEED_KEY', '').strip()
GUN = datetime.date(2026, 10, 26)
KURU, GERI = '--kuru' in sys.argv, '--geri' in sys.argv
PARCA = sys.argv[sys.argv.index('--parca') + 1] if '--parca' in sys.argv else '1'
KART = {   # kart: bizim sku, РРЦ, başa baş (alış + %15,5 Kaspi + teslimat), hedef firmalar (Kaspi merchantId)
    '17600092': {'sku': '17600092_15383076', 'ad': 'Sensibio DS+ krem 40', 'rrc': 8900, 'taban': 6600, 'hedef': ['16484248', 'Monamie', '15749337', '16431213']},
    '164128840': {'sku': '164128840_15383076', 'ad': 'Sebium jel 400', 'rrc': 14900, 'taban': 11000, 'hedef': ['16431213', '1119003', '16484248', '15749337']},
    '100918833': {'sku': '100918833_15383076', 'ad': 'Atoderm Creme Ultra 200', 'rrc': 8900, 'taban': 6600, 'hedef': ['16035104']},
    '17600095': {'sku': '17600095_15383076', 'ad': 'Sensibio Forte 40', 'rrc': 8900, 'taban': 6600, 'hedef': ['10723007', '16484248', 'Monamie', '15749337']},
    '141098324': {'sku': '141098324_15383076', 'ad': 'Hydrabio Creme 50 (2. kart)', 'rrc': 15400, 'taban': 11310, 'hedef': ['30348533']},
}
ADIM = [(8, 'in'), (9, 'in'), (10, 'in'), (11, 'in'), (12, 'in'), (13, 'in'), (14, 'tavan'), (15, 'tavan'), (16, 'geri')]
YAZ_DK = 40
BITIS = {'1': datetime.time(13, 10), '2': datetime.time(16, 40)}[PARCA]
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36', 'Accept-Language': 'ru-RU,ru;q=0.9'}
LOG = open(os.path.join(CIKTI, f'log_parca{PARCA}.txt'), 'a', encoding='utf-8')
KAYIT = open(os.path.join(CIKTI, f'kayit_parca{PARCA}.jsonl'), 'a', encoding='utf-8')


def simdi(): return datetime.datetime.now(TZ)
def saat(h, m): return datetime.datetime.combine(GUN, datetime.time(h, m), TZ)


def log(*a, gizli=False):   # gizli=True: yalnız artifact log dosyasına (repo public → konsola fiyat yok)
    s = simdi().strftime('%d.%m %H:%M:%S') + ' ' + ' '.join(str(x) for x in a)
    LOG.write(s + '\n'); LOG.flush()
    if not gizli: print(s, flush=True)


def git(*a, ok=True):
    r = subprocess.run(['git'] + list(a), capture_output=True, text=True)
    if ok and r.returncode: raise RuntimeError('git ' + ' '.join(a[:2]) + ': ' + r.stderr[-300:])
    return r


def durum_oku(): return json.load(open(DURUM, encoding='utf-8')) if os.path.exists(DURUM) else {}
def durum_yaz(d): json.dump(d, open(DURUM, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def feed_yaz(fiyat, mesaj):
    """fiyat: {sku: gündüz fiyatı} → origin/master üzerine commit + push, sonra canlı feed'de görünene kadar bekle."""
    if KURU: log('KURU: feed yazılmadı —', mesaj); return True
    for deneme in range(4):
        git('fetch', '-q', 'origin', 'master'); git('checkout', '-q', '--detach', '--force', 'FETCH_HEAD')
        t = open(FEED, encoding='utf-8').read(); feed = json.loads(t)
        bulunan = 0
        for it in feed['items']:
            if it['sku'] in fiyat: it['day'] = int(fiyat[it['sku']]); bulunan += 1
        if bulunan != len(fiyat): raise RuntimeError(f'feed.json içinde {len(fiyat)} sku bekleniyordu, {bulunan} bulundu')
        open(FEED, 'w', encoding='utf-8', newline='\n').write(json.dumps(feed, ensure_ascii=False, indent=0) + ('\n' if t.endswith('\n') else ''))
        git('add', 'api/_kaspi/feed.json')
        if git('diff', '--cached', '--quiet', ok=False).returncode == 0: log('feed zaten bu fiyatlarda'); return True
        git('commit', '-q', '-m', mesaj)
        if git('push', '-q', 'origin', 'HEAD:master', ok=False).returncode == 0:
            log('push tamam', git('rev-parse', '--short', 'HEAD').stdout.strip(), mesaj); break
        log('push reddedildi, yeniden deneniyor'); time.sleep(20)
    else: raise RuntimeError('push 4 denemede olmadı')
    for _ in range(40):   # canlı feed doğrulama (Vercel yayını ~1–2 dk)
        try:
            x = urllib.request.urlopen(urllib.request.Request(f'https://www.cosmoderm.kz/k/{FK}', headers={'User-Agent': 'cosmoderm-bot-testi'}), timeout=60).read().decode('utf-8')
            if all(f'<offer sku="{s}">' in x and f'<price>{int(v)}</price>' in x.split(f'<offer sku="{s}">', 1)[1].split('</offer>', 1)[0] for s, v in fiyat.items()):
                log('canlı feed doğrulandı'); return True
        except Exception as e: log('feed okunamadı', type(e).__name__)
        time.sleep(20)
    log('UYARI: canlı feed 13 dk içinde güncellenmedi'); return False


OP = None
def offers(pid):
    global OP
    if OP is None:
        OP = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        OP.open(urllib.request.Request('https://kaspi.kz/shop/', headers=UA), timeout=30).read()
    out = []
    for page in range(5):
        body = json.dumps({'cityId': '750000000', 'id': pid, 'merchantUID': [], 'limit': 50, 'page': page, 'sortOption': 'PRICE', 'highRating': None,
                           'searchText': None, 'isExcellentMerchant': False, 'zoneId': ['Magnum_ZONE1'], 'installationId': '-1'}).encode()
        req = urllib.request.Request('https://kaspi.kz/yml/offer-view/offers/' + pid, data=body, headers={**UA, 'Content-Type': 'application/json; charset=UTF-8',
                                     'Accept': 'application/json, text/*', 'X-KS-City': '750000000', 'Referer': f'https://kaspi.kz/shop/p/-{pid}/'})
        j = json.load(OP.open(req, timeout=30))
        out += j.get('offers', [])
        if not j.get('offers') or len(out) >= (j.get('total') or 0): break
    return [[str(o.get('merchantId')), o.get('price'), i + 1] for i, o in enumerate(out)]


SON = {}
def tur():
    ok = 0
    for pid in KART:
        try:
            L = offers(pid); SON[pid] = L; ok += 1
            KAYIT.write(json.dumps({'t': simdi().isoformat(timespec='seconds'), 'pid': pid, 'o': L}, separators=(',', ':')) + '\n')
        except Exception as e:
            globals()['OP'] = None; log('kart okunamadı', pid, type(e).__name__)
        time.sleep(0.5)
    KAYIT.flush(); return ok


def adim_fiyat(d, tip):
    f = {}
    for pid, k in KART.items():
        once, org = d['fiyat'].get(k['sku']), d['orijinal'][k['sku']]
        if tip == 'geri': f[k['sku']] = org; continue
        if tip == 'tavan': f[k['sku']] = round(k['rrc'] * 1.10); continue
        if once is None or once >= org:   # ilk iniş adımı: hedef firmaların şu anki en ucuzu ×0,97
            hed = [p for m, p, _ in SON.get(pid, []) if m in k['hedef'] and p]
            yeni = round(min(hed) * 0.97) if hed else round(org * 0.95)
        else:
            yeni = round(once * 0.95)
        f[k['sku']] = max(k['taban'], min(yeni, org))
    return f


def geri_al(neden):
    d = durum_oku()
    if d.get('orijinal') and d.get('fiyat') != d['orijinal']:
        log('GERİ ALINIYOR:', neden)
        feed_yaz(d['orijinal'], f'Kaspi bot testi: fiyatlar ESKI haline donduruldu ({neden})')
        d['fiyat'] = dict(d['orijinal']); durum_yaz(d)
    else: log('geri alma gerekmedi (fiyatlar zaten orijinal)')


def main():
    git('config', 'user.name', 'kaspi-bot-testi'); git('config', 'user.email', 'kazasyagrup@gmail.com')
    if GERI: geri_al('iş akışı hata/iptal'); return
    d = durum_oku()
    if not d.get('orijinal'):
        git('fetch', '-q', 'origin', 'master'); git('checkout', '-q', '--detach', '--force', 'FETCH_HEAD')
        items = {it['sku']: it for it in json.load(open(FEED, encoding='utf-8'))['items']}
        d = {'orijinal': {k['sku']: items[k['sku']]['day'] for k in KART.values()}, 'fiyat': {}, 'yapilan': []}
        d['fiyat'] = dict(d['orijinal']); durum_yaz(d)
        log('orijinal gündüz fiyatları kaydedildi (durum.json)')
    if KURU:
        for i in range(3):
            n = tur(); log(f'KURU tur {i + 1}: {n}/{len(KART)} kart okundu')
            time.sleep(20)
        for saat_, tip in ADIM:
            f = adim_fiyat(d, tip); d['fiyat'] = f
            log(f'KURU adım {saat_}:02 {tip}:', {KART[p]['ad']: f[k['sku']] for p, k in KART.items()}, gizli=True)
        log('KURU deneme bitti — adımlar artifact log dosyasında'); return
    log(f'parça {PARCA} başladı, bitiş {BITIS}')
    while simdi() < saat(BITIS.hour, BITIS.minute):
        t0 = simdi()
        for saat_, tip in ADIM:
            anahtar = f'{saat_}:{tip}'
            if anahtar not in d['yapilan'] and saat(saat_ - 1, YAZ_DK) <= t0 < saat(saat_, 0):
                f = adim_fiyat(d, tip)
                log(f'ADIM {saat_}:02 {tip}', gizli=False); log(f'ADIM {saat_}:02 {tip} fiyatlar:', {KART[p]['ad']: f[k['sku']] for p, k in KART.items()}, gizli=True)
                feed_yaz(f, f'Kaspi bot testi {saat_}:02 ({tip}) - 5 kartta gunduz fiyati, kullanici onayi 25.10')
                d['fiyat'] = f; d['yapilan'].append(anahtar); durum_yaz(d)
        if t0 >= saat(7, 30): tur()
        time.sleep(max(5, 60 - (simdi() - t0).total_seconds()))
    if PARCA == '2' or simdi() >= saat(16, 0): geri_al('test süresi bitti')
    log(f'parça {PARCA} bitti')


if __name__ == '__main__':
    try: main()
    except BaseException as e:   # iptal (KeyboardInterrupt/SIGTERM) dahil
        log('HATA/İPTAL:', type(e).__name__, str(e)[:300])
        try: geri_al('hata: ' + type(e).__name__)
        except BaseException as e2: log('!!! GERİ ALMA DA BAŞARISIZ:', type(e2).__name__, '— iş akışının "geri al" adımı deneyecek')
        raise
