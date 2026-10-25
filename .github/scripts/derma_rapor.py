# 25.10.2026 kullanıcı: DERMA COSMETOLOGY ile ortak kartlarda 1 hafta gece indirimi yok (kaspi_gece.py) → her sabah bu kartların satış raporu maili.
# Karşılaştırma: deneme öncesi 14 gün (11–24.10) ve aynı dönemde diğer kartlar (kontrol grubu); DERMA'nın fiyat tepkisi (25.10 taramasına göre).
# Siparişler: cosmoderm.kz/api/kaspi-siparis (STOK_SYNC_KEY) · mail: Worker /belge (yalnız kazasyagrup@gmail.com) · nabız: Worker /nabiz 'derma-rapor'
import datetime, http.cookiejar, json, os, sys, time, urllib.request

KEY = os.environ['STOK_SYNC_KEY'].strip()
SITE, WORKER = 'https://www.cosmoderm.kz', 'https://cosmoderm-stok-cron.cosmoderm-kz.workers.dev'
DERMA, MID = '30348533', '15383076'
TZ = datetime.timezone(datetime.timedelta(hours=5))
KURU = '--kuru' in sys.argv
DO = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'derma_ortak.json'), encoding='utf-8'))
K = DO['kartlar']
BAS = datetime.datetime.fromisoformat(DO['bas'])
SKU_PID = {'182626': '112596890', '186622': '109450800'}   # kaspi_gece.py ile aynı
bugun = datetime.datetime.now(TZ).date()
dun = bugun - datetime.timedelta(days=1)
if dun > datetime.datetime.fromisoformat(DO['bit']).date():
    print('deneme bitti, rapor yok'); sys.exit(0)


def get(url, data=None, headers=None):
    for i in range(3):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers or {'User-Agent': 'cosmoderm-derma-rapor'}), timeout=180).read()
        except Exception:
            if i == 2: raise
            time.sleep(10)


def siparis(bas, bit):
    j = json.loads(get(f'{SITE}/api/kaspi-siparis?key={KEY}&from={bas}&to={bit}'))
    if not j.get('ok'): raise RuntimeError('kaspi-siparis: ' + str(j)[:200])
    out = []
    for o in j['siparisler']:
        if str(o.get('statu', '')).startswith('CANCEL') or o.get('statu') == 'RETURNED': continue
        t = datetime.datetime.fromtimestamp(o['ms'] / 1000, TZ)
        for k in o['kalemler']:
            pid = SKU_PID.get(str(k['sku']), str(k['sku']).split('_')[0])
            out.append({'t': t, 'pid': pid, 'ad': k['ad'], 'adet': k['adet'], 'fiyat': k['fiyat'], 'gece': t.hour >= 18 or t.hour < 7})
    return out


onceki = siparis('2026-10-11', '2026-10-24')                        # deneme öncesi 14 gün
donem = siparis(BAS.date().isoformat(), dun.isoformat()) if dun >= BAS.date() else []
donem = [x for x in donem if x['t'] >= BAS]                         # 25.10 18:00'den itibaren
dunL = [x for x in donem if x['t'].date() == dun]
gun_sayi = max(1e-9, (datetime.datetime.combine(bugun, datetime.time(), TZ) - BAS).total_seconds() / 86400)


def ozet(L, ortak):
    L = [x for x in L if (x['pid'] in K) == ortak]
    return {'adet': sum(x['adet'] for x in L), 'ciro': sum(x['adet'] * x['fiyat'] for x in L), 'gece': sum(x['adet'] for x in L if x['gece'])}


# DERMA fiyat tepkisi: 25.10 sabahına göre
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36', 'Accept-Language': 'ru-RU,ru;q=0.9'}
OP = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
OP.open(urllib.request.Request('https://kaspi.kz/shop/', headers=UA), timeout=30).read()


def offers(pid):
    body = json.dumps({'cityId': '750000000', 'id': pid, 'merchantUID': [], 'limit': 50, 'page': 0, 'sortOption': 'PRICE', 'highRating': None,
                       'searchText': None, 'isExcellentMerchant': False, 'zoneId': ['Magnum_ZONE1'], 'installationId': '-1'}).encode()
    req = urllib.request.Request('https://kaspi.kz/yml/offer-view/offers/' + pid, data=body, headers={
        **UA, 'Content-Type': 'application/json; charset=UTF-8', 'Accept': 'application/json, text/*', 'X-KS-City': '750000000', 'Referer': f'https://kaspi.kz/shop/p/-{pid}/'})
    for i in range(3):
        try: return json.load(OP.open(req, timeout=30)).get('offers', [])
        except Exception:
            if i == 2: return None
            time.sleep(3)


fiyat, okunamayan = {}, 0
for pid in K:
    O = offers(pid); time.sleep(0.3)
    if O is None: okunamayan += 1; continue
    f = {str(o.get('merchantId')): o.get('price') for o in O}
    fiyat[pid] = {'derma': f.get(DERMA), 'biz': f.get(MID), 'sira': next((i + 1 for i, o in enumerate(sorted(O, key=lambda o: o.get('price') or 9e9)) if str(o.get('merchantId')) == MID), None), 'n': len(O)}


def tl(v): return f'{int(round(v)):,}'.replace(',', ' ')


def yuzde(yeni, eski): return '—' if not eski else f'{(yeni / eski - 1) * 100:+.0f}%'


td = 'style="padding:6px 10px;border-bottom:1px solid #ddd"'
tdr = 'style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:right"'
th = 'style="padding:6px 10px;background:#DDEBF7;text-align:left"'
satir = []
for ad, ortak in (('DERMA ortak kartlar (gece indirimsiz)', True), ('Diğer kartlar (gece indirimi sürüyor)', False)):
    d, p, o = ozet(dunL, ortak), ozet(donem, ortak), ozet(onceki, ortak)
    gunl_p, gunl_o = p['adet'] / gun_sayi, o['adet'] / 14
    satir.append(f'<tr><td {td}><b>{ad}</b></td><td {tdr}>{d["adet"]}</td><td {tdr}>{tl(d["ciro"])} ₸</td><td {tdr}>{d["gece"]}</td>'
                 f'<td {tdr}>{gunl_p:.1f}</td><td {tdr}>{gunl_o:.1f}</td><td {tdr}><b>{yuzde(gunl_p, gunl_o)}</b></td>'
                 f'<td {tdr}>{(p["gece"] / p["adet"] * 100 if p["adet"] else 0):.0f}% / {(o["gece"] / o["adet"] * 100 if o["adet"] else 0):.0f}%</td></tr>')
ozet_tablo = (f'<table style="border-collapse:collapse;font-size:14px"><tr><th {th}></th><th {th}>Dün adet</th><th {th}>Dün ciro</th><th {th}>Dün gece (18–07) adet</th>'
              f'<th {th}>Deneme ort./gün</th><th {th}>Önceki 14 gün ort./gün</th><th {th}>Değişim</th><th {th}>Gece payı deneme / önce</th></tr>{"".join(satir)}</table>')

U = {}
for x in [x for x in dunL if x['pid'] in K]:
    u = U.setdefault(x['pid'], {'adet': 0, 'gece': 0, 'fiyat': set()}); u['adet'] += x['adet']; u['gece'] += x['adet'] if x['gece'] else 0; u['fiyat'].add(int(x['fiyat']))
urun = ''.join(f'<tr><td {td}><a href="https://kaspi.kz/shop/p/-{pid}/">{K[pid]["ad"][:70]}</a></td><td {tdr}>{u["adet"]}</td><td {tdr}>{u["gece"]}</td><td {tdr}>{" / ".join(tl(f) for f in sorted(u["fiyat"]))}</td>'
               f'<td {tdr}>{tl(fiyat[pid]["derma"]) if pid in fiyat and fiyat[pid]["derma"] else "yok"}</td></tr>' for pid, u in sorted(U.items(), key=lambda kv: -kv[1]['adet']))
urun_tablo = (f'<table style="border-collapse:collapse;font-size:14px"><tr><th {th}>Ürün (kart)</th><th {th}>Adet</th><th {th}>Gece</th><th {th}>Satış fiyatı</th><th {th}>DERMA şimdi</th></tr>{urun}</table>'
              if urun else '<p>Dün ortak kartlardan satış yok.</p>')

ucuz = sum(1 for v in fiyat.values() if v['derma'] and v['biz'] and v['derma'] < v['biz'])
esit = sum(1 for v in fiyat.values() if v['derma'] and v['biz'] and v['derma'] == v['biz'])
pahali = sum(1 for v in fiyat.values() if v['derma'] and v['biz'] and v['derma'] > v['biz'])
cikti = [pid for pid, v in fiyat.items() if not v['derma']]
degisen = sorted(((pid, K[pid]['derma_2510'], v['derma']) for pid, v in fiyat.items() if v['derma'] and int(v['derma']) != K[pid]['derma_2510']), key=lambda r: r[2] - r[1])
deg = ''.join(f'<tr><td {td}><a href="https://kaspi.kz/shop/p/-{pid}/">{K[pid]["ad"][:60]}</a></td><td {tdr}>{tl(e)}</td><td {tdr}>{tl(y)}</td><td {tdr}>{tl(y - e)}</td>'
              f'<td {tdr}>{tl(fiyat[pid]["biz"]) if fiyat[pid]["biz"] else "—"}</td></tr>' for pid, e, y in degisen[:40])
deg_tablo = (f'<table style="border-collapse:collapse;font-size:14px"><tr><th {th}>Kart</th><th {th}>DERMA 25.10</th><th {th}>DERMA şimdi</th><th {th}>Fark</th><th {th}>Biz şimdi</th></tr>{deg}</table>'
             if deg else '<p>DERMA 25.10 sabahından beri hiçbir ortak kartta fiyat değiştirmedi.</p>')

gun_no = (dun - BAS.date()).days
html = (f'<div style="font-family:Arial;max-width:900px"><h2 style="margin:0 0 4px">DERMA ortak kartlar — {dun.strftime("%d.%m.%Y")} satış raporu</h2>'
        f'<p style="margin:0 0 12px;color:#666">Deneme günü {gun_no}/7 · {len(K)} ortak kartta gece indirimi yok (gece = gündüz fiyatı), {DO["bas"][:10]} 18:00 → {DO["bit"][:10]} 07:00. '
        f'Diğer kartlarda gece botu normal çalışıyor (kontrol grubu).</p>'
        f'<h3>1. Özet</h3>{ozet_tablo}'
        f'<p style="font-size:12px;color:#666">"Deneme ort./gün": 25.10 18:00\'den bu sabaha ({gun_sayi:.1f} gün). "Önceki 14 gün": 11–24.10. İptal ve iadeler hariç.</p>'
        f'<h3>2. Dün satılan ortak kart ürünleri</h3>{urun_tablo}'
        f'<h3>3. DERMA\'nın tepkisi (fiyat)</h3><p>Şu an {len(fiyat)} kartta: DERMA bizden <b>ucuz {ucuz}</b> · <b>eşit {esit}</b> · <b>pahalı {pahali}</b>'
        f'{f" · DERMA kartta artık yok: {len(cikti)}" if cikti else ""}{f" · okunamayan kart: {okunamayan}" if okunamayan else ""}. '
        f'25.10 sabahından beri fiyat değiştirdiği kart: <b>{len(degisen)}</b>.</p>{deg_tablo}'
        f'<p style="color:#666;font-size:12px;margin-top:16px">Otomatik rapor (GitHub Actions derma-rapor, her sabah 09:15). Deneme 01.11 07:00\'de kendiliğinden biter; son rapor 02.11. '
        f'Claude Code\'a "kaspi" deyip bu maili gösterin.</p></div>')
d = ozet(dunL, True)
konu = f'DERMA ortak kartlar {dun.strftime("%d.%m")} — {d["adet"]} adet / {tl(d["ciro"])} ₸ (gün {gun_no}/7)'
print('rapor hazır:', dun, '— repo public: konu/ciro loga yazılmaz')
if KURU:
    open('derma_rapor.html', 'w', encoding='utf-8').write(html); print('kuru mod: mail yok → derma_rapor.html'); sys.exit(0)
print(get(f'{WORKER}/belge?key={KEY}', json.dumps({'konu': konu, 'html': html, 'alici': ['kazasyagrup@gmail.com']}).encode(), {'Content-Type': 'application/json', 'User-Agent': 'cosmoderm-derma-rapor'}).decode())
try: get(f'{WORKER}/nabiz?key={KEY}', json.dumps({'is': 'derma-rapor', 'ok': True, 'not': konu}).encode(), {'Content-Type': 'application/json', 'User-Agent': 'cosmoderm-derma-rapor'})
except Exception as e: print('nabız gönderilemedi', e)
