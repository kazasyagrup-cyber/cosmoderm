# CosmoDerm — Dermokozmetik Ürün Kataloğu

`www.cosmoderm.kz` için ürün kataloğu/tanıtım sitesi. Stack: Vite + Tailwind CSS + Vanilla JavaScript
(framework yok, build aracı olarak sadece Vite kullanılıyor).

## Çalıştırma

```bash
npm install
npm run dev       # geliştirme sunucusu
npm run build     # dist/ altına production build
npm run preview   # production build'i yerelde önizle
```

## Mimari

```
cosmoderm/
├── index.html              # sayfa iskeleti (marka sekmeleri, filtre paneli, ürün grid'i, detay modalı)
├── public/
│   ├── placeholder.svg      # görseli henüz yüklenmemiş ürünler için otomatik yedek görsel
│   └── products/             # gerçek ürün fotoğrafları buraya eklenir (bkz. products/README.md)
└── src/
    ├── style.css             # Tailwind giriş noktası
    ├── main.js               # state + render fonksiyonlarını birbirine bağlar
    ├── data/
    │   ├── brands.json        # marka listesi + durum ("active" | "coming-soon")
    │   ├── taxonomy.json      # kategori ve cilt tipi sözlüğü (filtre etiketleri)
    │   └── products.json      # ürün verisi
    └── js/
        ├── state.js           # aktif marka/kategori/cilt tipi/arama durumu
        ├── filters.js         # ürün listesini state'e göre süzen saf fonksiyon
        └── render.js          # DOM render fonksiyonları (marka sekmeleri, filtreler, kartlar, modal)
```

## Yeni marka yayına almak

1. `src/data/brands.json` içinde ilgili markanın `status` alanını `"coming-soon"` → `"active"` yapın.
2. `src/data/products.json` içine o markanın ürünlerini aynı şemayla ekleyin (aşağıya bakın).
3. Gerekirse `src/data/taxonomy.json` içine yeni kategori/cilt tipi ekleyin — filtreler otomatik olarak
   bu dosyadan üretilir, kod değişikliği gerekmez.

Kod değişikliği gerekmeden sadece bu üç JSON dosyası düzenlenerek yeni marka/ürün yayına alınabilir.

## Ürün şeması (`products.json`)

```json
{
  "id": "bioderma-sensibio-h2o",
  "name": "Sensibio H2O",
  "brand": "bioderma",
  "category": "cilt-temizleme",
  "skinTypes": ["hassas", "kuru", "yagli", "normal"],
  "description": "...",
  "usage": "...",
  "ingredients": "...",
  "image": "/products/sensibio-h2o.jpg"
}
```

- `brand`: `brands.json`'daki bir `id` ile eşleşmeli.
- `category`: `taxonomy.json > categories`'deki bir `id` ile eşleşmeli.
- `skinTypes`: `taxonomy.json > skinTypes`'daki `id` değerlerinden oluşan bir dizi.
- `image`: `public/products/` altında bu isimde bir dosya yoksa arayüz otomatik olarak
  `/placeholder.svg` gösterir; gerçek görsel eklendiğinde otomatik devreye girer.

## "Pek Yakında" davranışı

Bir marka sekmesine tıklandığında `brands.json`'daki `status` alanı `"active"` değilse filtre paneli ve
ürün grid'i gizlenir, yerine "Pek Yakında" bilgilendirmesi gösterilir. Mantık `src/main.js` içindeki
`update()` fonksiyonunda; markaya özel kod içermez, tamamen veri güdümlüdür.
