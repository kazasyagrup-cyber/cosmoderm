# -*- coding: utf-8 -*-
"""29.10.2026 KASPI "YUKARI MERDİVEN" ÖLÇÜMÜ — GitHub Actions `kaspi-merdiven-testi` (kullanıcı onayı 28.10: "önerdiğin adımlar ok uygula").
Soru: takipçi botlar (ФАРМАКОМ 16484248, Raus 16035104) biz fiyatı YÜKSELTİNCE peşimizden çıkıyor mu, kaç dakikada, nereye kadar?
Çıkıyorsa gece/gündüz "aşağı merdiven" yerine "yukarı merdiven" kuralı kurulacak (fiyat seviyesi her döngüde yükselir).
28.10 kullanıcı: "hep GECE yapalım, gündüz yapmayalım, bu gece başlasın" → yalnız 3 kartta GECE fiyatı ('night'), test boyunca 'sabit_gece'
(kaspi_gece.py dokunmaz). Kaspi feed'i her saat :02'de okur, fiyat :52'de yazılır. Başlangıçtan sonraki ilk tam saatten itibaren 5 adım:
  YUKARI: şimdiki gece fiyatımız ×1,05 (en fazla РРЦ ×1,15)
  ALTINA GİR: hedef botun o anki fiyatı − 2 ₸; ama ASLA başlangıçtaki gece fiyatımızın altına inmez (bugünkünden fazla indirim yok)
  sırası: yukarı, alt, yukarı, alt, yukarı → son adımdan sonra :52'de GERİ (orijinal gece fiyatı, sabit_gece kaldırılır; gece botu :45'te devam eder)
Kartlar 1 dk'da bir okunur (kayıt artifact). Güvenlik: hata / iptal → orijinal fiyatlar geri yazılır (+ iş akışında "geri al" adımı).
Repo public: loga fiyat yazılmaz. Betik iskeleti: kaspi_bot_testi.py (26.10)."""
import datetime, json, os, subprocess, sys, time, urllib.request, http.cookiejar
TZ = datetime.timezone(datetime.timedelta(hours=5))   # Almatı
KOK = os.getcwd()
FEED = os.path.join(KOK, 'api', '_kaspi', 'feed.json')
CIKTI = os.path.join(KOK, 'merdiven_testi'); os.makedirs(CIKTI, exist_ok=True)
DURUM = os.path.join(CIKTI, 'durum.json')
FK = os.environ.get('KASPI_FEED_KEY', '').strip()
KURU, GERI = '--kuru' in sys.argv, '--geri' in sys.argv
KART = {   # kart: bizim sku, РРЦ (= orijinal gündüz), hedef bot (Kaspi merchantId)
    '141098322': {'sku': '141098322_15383076', 'ad': 'Sensibio Defensive Rich 40', 'rrc': 9400, 'hedef': ['16484248']},
    '116776903': {'sku': '116776903_15383076', 'ad': 'Sensibio H2O Eye 125', 'rrc': 8700, 'hedef': ['16484248']},
    '100918833': {'sku': '100918833_15383076', 'ad': 'Atoderm Creme Ultra 200', 'rrc': 8900, 'hedef': ['16035104']},
}
TIPLER = ['yukari', 'alt', 'yukari', 'alt', 'yukari']
YAZ_DK = 52
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36', 'Accept-Language': 'ru-RU,ru;q=0.9'}
LOG = open(os.path.join(CIKTI, 'log.txt'), 'a', encoding='utf-8')
KAYIT = open(os.path.join(CIKTI, 'kayit.jsonl'), 'a', encoding='utf-8')


def simdi(): return datetime.datetime.now(TZ)


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


def feed_yaz(fiyat, mesaj, geri=False):
    """fiyat: {sku: GECE fiyatı} → origin/master üzerine commit + push (test boyunca sabit_gece; geri=True → orijinal sabit_gece durumu), sonra canlı feed'de doğrula."""
    if KURU: log('KURU: feed yazılmadı —', mesaj); return True
    for deneme in range(4):
        git('fetch', '-q', 'origin', 'master'); git('checkout', '-q', '--detach', '--force', 'FETCH_HEAD')
        t = open(FEED, encoding='utf-8').read(); feed = json.loads(t)
        bulunan = 0
        for it in feed['items']:
            if it['sku'] in fiyat:
                it['night'] = int(fiyat[it['sku']]); bulunan += 1
                if geri and not durum_oku().get('sabit', {}).get(it['sku']): it.pop('sabit_gece', None)
                elif not geri: it['sabit_gece'] = True
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
        once, org = d['fiyat'].get(k['sku']) or d['orijinal'][k['sku']], d['orijinal'][k['sku']]
        if tip == 'geri': f[k['sku']] = org; continue
        if tip == 'yukari':
            yeni = min(round(once * 1.05 / 10) * 10, round(k['rrc'] * 1.15))
        else:   # alt: hedef botun şimdiki fiyatı − 2; РРЦ (orijinal) altına inmez
            hed = [p for m, p, _ in SON.get(pid, []) if m in k['hedef'] and p]
            yeni = max(org, int(min(hed)) - 2) if hed else org
        f[k['sku']] = int(yeni)
    return f


def geri_al(neden):
    d = durum_oku()
    if d.get('orijinal') and d.get('fiyat') != d['orijinal']:
        log('GERİ ALINIYOR:', neden)
        feed_yaz(d['orijinal'], f'Kaspi merdiven testi: gece fiyatlari ESKI haline donduruldu ({neden})', geri=True)
        d['fiyat'] = dict(d['orijinal']); durum_yaz(d)
    else: log('geri alma gerekmedi (fiyatlar zaten orijinal)')


def main():
    git('config', 'user.name', 'kaspi-merdiven-testi'); git('config', 'user.email', 'kazasyagrup@gmail.com')
    if GERI: geri_al('iş akışı hata/iptal'); return
    d = durum_oku()
    if not d.get('orijinal'):
        git('fetch', '-q', 'origin', 'master'); git('checkout', '-q', '--detach', '--force', 'FETCH_HEAD')
        items = {it['sku']: it for it in json.load(open(FEED, encoding='utf-8'))['items']}
        bas = simdi() + datetime.timedelta(minutes=8)   # ilk adım: başlangıçtan sonraki ilk :02 (yazma :52'de)
        ilk = (bas + datetime.timedelta(hours=1)).replace(minute=2, second=0, microsecond=0) if bas.minute >= YAZ_DK else bas.replace(minute=2, second=0, microsecond=0) + datetime.timedelta(hours=1)
        d = {'orijinal': {k['sku']: items[k['sku']]['night'] for k in KART.values()}, 'sabit': {k['sku']: bool(items[k['sku']].get('sabit_gece')) for k in KART.values()},
             'fiyat': {}, 'yapilan': [], 'plan': [((ilk + datetime.timedelta(hours=i)).isoformat(), t) for i, t in enumerate(TIPLER)]}
        d['fiyat'] = dict(d['orijinal']); durum_yaz(d)
        log('orijinal gece fiyatları kaydedildi (durum.json), plan:', [f"{x[0][11:16]} {x[1]}" for x in d['plan']])
    if KURU:
        for i in range(3):
            n = tur(); log(f'KURU tur {i + 1}: {n}/{len(KART)} kart okundu')
            time.sleep(20)
        for zaman, tip in d['plan']:
            f = adim_fiyat(d, tip); d['fiyat'] = f
            log(f'KURU adım {zaman[11:16]} {tip}:', {KART[p]['ad']: f[k['sku']] for p, k in KART.items()}, gizli=True)
        log('KURU deneme bitti — adımlar artifact log dosyasında'); return
    plan = [(datetime.datetime.fromisoformat(z), t) for z, t in d['plan']]
    bitis = plan[-1][0] - datetime.timedelta(minutes=10) + datetime.timedelta(hours=1)   # son adımdan sonraki :52 → geri
    log('merdiven testi başladı, geri dönüş', bitis.strftime('%d.%m %H:%M'))
    while simdi() < bitis:
        t0 = simdi()
        for zaman, tip in plan:
            anahtar = zaman.isoformat()
            if anahtar not in d['yapilan'] and zaman - datetime.timedelta(minutes=62 - YAZ_DK) <= t0 < zaman:
                tur()   # karar en taze fiyatla
                f = adim_fiyat(d, tip)
                log(f'ADIM {zaman:%H:%M} {tip}'); log(f'ADIM {zaman:%H:%M} {tip} fiyatlar:', {KART[p]['ad']: f[k['sku']] for p, k in KART.items()}, gizli=True)
                feed_yaz(f, f'Kaspi merdiven testi {zaman:%d.%m %H:%M} ({tip}) - 3 kartta gece fiyati, kullanici onayi 28.10')
                d['fiyat'] = f; d['yapilan'].append(anahtar); durum_yaz(d)
        tur()
        time.sleep(max(5, 60 - (simdi() - t0).total_seconds()))
    geri_al('test süresi bitti')
    son = bitis + datetime.timedelta(minutes=23)   # Kaspi geri fiyatı :02'de okur → botların tepkisi için +13 dk
    while simdi() < son:
        t0 = simdi(); tur(); time.sleep(max(5, 60 - (simdi() - t0).total_seconds()))
    log('merdiven testi bitti')


if __name__ == '__main__':
    try: main()
    except BaseException as e:   # iptal (KeyboardInterrupt/SIGTERM) dahil
        log('HATA/İPTAL:', type(e).__name__, str(e)[:300])
        try: geri_al('hata: ' + type(e).__name__)
        except BaseException as e2: log('!!! GERİ ALMA DA BAŞARISIZ:', type(e2).__name__, '— iş akışının "geri al" adımı deneyecek')
        raise
