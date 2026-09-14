#!/usr/bin/env node
/**
 * assets/data.js'ten (tek kaynak) SEO/AEO icin makine-okunur ciktilar uretir:
 *  - products.json          : tum katalog, duz JSON (AI ajanlari/entegrasyonlar icin)
 *  - assets/product-ld.json : index.html'e gomulen JSON-LD @graph'in govdesi
 *
 * Ne zaman calistirilir: assets/data.js'te urun/marka/fiyat degisikligi
 * yapildiktan SONRA, elle: `node scripts/generate-seo-feed.js`
 * Bu proje "zero-build" kalir (bu script deploy'da calismiyor, Vercel sadece
 * static dosyalari sunuyor) - bu sadece icerik degisince manuel calistirilan
 * bir yardimci script, npm/build sistemi degil.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE_URL = "https://www.cosmoderm.kz";

function loadCatalog() {
  const sandbox = { window: {} };
  const code = fs.readFileSync(path.join(ROOT, "assets/data.js"), "utf8");
  new Function("window", code)(sandbox.window);
  return sandbox.window.CATALOG_DATA;
}

// app.js'teki "const ACTIVE_PROMO = {...};" blogunu (tek dogru kaynak - kullanici
// bunu orada guncelliyor) guvenli sekilde disari cikarir, feed'i onunla ayni tutar.
// app.js'in geri kalani document/window kullandigi icin tumunu eval etmiyoruz.
function loadActivePromo() {
  const appJs = fs.readFileSync(path.join(ROOT, "assets/app.js"), "utf8");
  const m = appJs.match(/const ACTIVE_PROMO = (\{[\s\S]*?\});/);
  if (!m) {
    console.error("UYARI: app.js'te ACTIVE_PROMO bulunamadi, promosyonsuz devam ediliyor.");
    return null;
  }
  return new Function(`return ${m[1]};`)();
}

function truncate(str, max) {
  if (!str) return "";
  const clean = str.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trim() + "…" : clean;
}

function main() {
  const data = loadCatalog();
  const promo = loadActivePromo();
  const brandById = Object.fromEntries(data.brands.map((b) => [b.id, b]));
  const catById = Object.fromEntries(data.categories.map((c) => [c.id, c]));
  const promoBrandName = promo && brandById[promo.brand] ? brandById[promo.brand].name : promo && promo.brand;

  const products = data.products.map((p) => {
    const brand = brandById[p.brand];
    const imagePath = path.join(ROOT, p.image || "");
    const hasImage = !!p.image && fs.existsSync(imagePath);
    const basePrice = typeof p.price === "number" ? p.price : null;
    const promoApplies = !!(promo && basePrice != null && p.brand === promo.brand);
    const promoPrice = promoApplies ? Math.round((basePrice * (100 - promo.discountPercent)) / 100) : null;
    return {
      id: p.id,
      url: `${SITE_URL}/#${p.id}`,
      brand: brand ? brand.name : p.brand,
      line: p.line,
      category: catById[p.category] ? catById[p.category].label : { ru: p.category, kz: p.category },
      volume: p.volume || null,
      // price_kzt HER ZAMAN "su an bu urun icin odenecek gercek fiyat" -
      // promosyon aktifse bu ZATEN indirimli fiyat (AI ajanlari/agentlar
      // genelde sadece bu tek alana bakiyor, ayri bir "price_with_promo"
      // alanini atlayabiliyor - 2026-09-14'te canli test edildi, bir AI
      // ajani indirimi kacirdi). Karsilastirma/seffaflik icin list_price_kzt
      // = promosyonsuz orijinal fiyat, sadece promosyon aktifken dolu.
      price_kzt: promoApplies ? promoPrice : basePrice,
      list_price_kzt: promoApplies ? basePrice : null,
      promo_code: promoApplies ? promo.code : null,
      promo_discount_percent: promoApplies ? promo.discountPercent : null,
      promo_note: promoApplies
        ? `price_kzt (${promoPrice} KZT) уже включает скидку ${promo.discountPercent}% по общедоступному промокоду ${promo.code}. Обычная цена без промокода: ${basePrice} KZT (list_price_kzt).`
        : null,
      skin_types: p.skinTypes || [],
      name: p.name,
      description: p.description || null,
      active_ingredients: p.activeIngredients || null,
      usage_steps: p.usageSteps || null,
      efficacy: p.efficacy || null,
      skin_type_note: p.skinTypeNote || null,
      image: hasImage ? `${SITE_URL}${p.image}` : null,
    };
  });

  const feed = {
    generated_at: new Date().toISOString(),
    store: {
      name: "CosmoDerm",
      url: SITE_URL,
      description:
        "Профессиональный интернет-магазин дермокосметики. Официальный дилер, розничная и оптовая продажа только оригинальной продукции ведущих мировых брендов.",
      type: "Онлайн-магазин (не информационный каталог)",
      location: "Алматы, Казахстан",
      shipping: "Доставка по всему Казахстану",
      currency: "KZT",
      languages: ["ru", "kz"],
      how_to_order: "WhatsApp: https://wa.me/77087685329 (добавить товары в корзину на сайте и оформить заказ)",
      brands: data.brands.filter((b) => b.status === "active").map((b) => b.name),
    },
    // Su an aktif olan, herkese acik (giris/uyelik gerektirmeyen) promosyon
    // kodu/kodlari - zaman zaman degisir (bkz. assets/app.js -> ACTIVE_PROMO).
    active_promotions: promo
      ? [
          {
            code: promo.code,
            discount_percent: promo.discountPercent,
            applies_to_brand: promoBrandName,
            how_to_use: `Введите промокод "${promo.code}" в корзине на сайте, скидка ${promo.discountPercent}% на товары бренда ${promoBrandName} применится автоматически. Код общедоступен, без регистрации/условий.`,
          },
        ]
      : [],
    products,
  };

  fs.writeFileSync(path.join(ROOT, "products.json"), JSON.stringify(feed, null, 2) + "\n", "utf8");

  // --- JSON-LD (index.html'e gomulecek, kompakt - RU odakli, Google/AI rich-result icin) ---
  // "OnlineStore" (Store/LocalBusiness -> Organization alt tipi) kullaniyoruz -
  // sadece "Organization" degil, acikca bir SATIS noktasi oldugumuzu belirtsin
  // diye (bkz. 2026-09-14: bir AI ajani siteyi "bilgi kataloğu" sanip yanlis
  // tanitmisti - bu yanlis algiyi duzeltmek icin hem burada hem gorunur
  // metinde/llms.txt'te acikca "online magaza" vurgusu tekrarlaniyor).
  const org = {
    "@type": "OnlineStore",
    "@id": `${SITE_URL}/#organization`,
    name: "CosmoDerm",
    url: SITE_URL,
    logo: `${SITE_URL}/assets/logo-icon.png`,
    description:
      "Официальный дилер дермокосметики ведущих мировых брендов в Казахстане. Розничная и оптовая продажа только оригинальной продукции. НЕ информационный каталог - действующий интернет-магазин с корзиной и оформлением заказа.",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Алматы",
      addressCountry: "KZ",
    },
    areaServed: {
      "@type": "Country",
      name: "Kazakhstan",
    },
    sameAs: [
      "https://kaspi.kz/shop/p/bioderma-krem-hydrabio-dlja-litsa-50-ml-17600051/?c=750000000",
      "https://www.wildberries.ru/seller/727302",
      "https://ozon.kz/brand/bioderma-27367890/",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      url: "https://wa.me/77087685329",
      availableLanguage: ["ru", "kz"],
    },
  };

  const itemListElements = products.map((p, idx) => {
    const hasPromo = !!p.list_price_kzt;
    let description = truncate(p.description && p.description.ru, 300);
    if (hasPromo) {
      // p.price_kzt HER ZAMAN gercek/gecerli fiyat (promosyon varsa zaten
      // indirimli) - baz fiyat + kod ayrica metinde de geciyor ki JS
      // calistirmayan/sadece metni okuyan bir ajan da anlayabilsin.
      description += ` Цена ${p.price_kzt} ₸ уже включает скидку ${p.promo_discount_percent}% по промокоду ${p.promo_code} (обычная цена без промокода: ${p.list_price_kzt} ₸, код общедоступен, без условий).`;
    }
    const node = {
      "@type": "Product",
      "@id": `${SITE_URL}/#${p.id}`,
      sku: p.id,
      name: p.name,
      brand: { "@type": "Brand", name: p.brand },
      category: p.category && p.category.ru,
      url: p.url,
      description,
    };
    if (p.image) node.image = p.image;
    if (p.price_kzt) {
      // price_kzt = su an gercekten odenecek en dusuk fiyat (aktif, herkese
      // acik promosyon varsa zaten dahil) - kiyaslama yapan ajanlar Offer.price
      // olarak bunu gormeli. Liste fiyati description'da ayrica aciklaniyor.
      node.offers = {
        "@type": "Offer",
        url: p.url,
        priceCurrency: "KZT",
        price: p.price_kzt,
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@id": `${SITE_URL}/#organization` },
      };
    }
    return { "@type": "ListItem", position: idx + 1, item: node };
  });

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      org,
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "CosmoDerm",
        publisher: { "@id": `${SITE_URL}/#organization` },
        inLanguage: ["ru", "kk"],
      },
      {
        "@type": "ItemList",
        "@id": `${SITE_URL}/#catalog`,
        name: "CosmoDerm - каталог дермокосметики",
        numberOfItems: itemListElements.length,
        itemListElement: itemListElements,
      },
    ],
  };

  const ldJson = JSON.stringify(graph);
  fs.writeFileSync(path.join(ROOT, "assets/product-ld.json"), ldJson + "\n", "utf8");

  // --- index.html'deki PRODUCT_LD blogunu gomulu JSON-LD ile degistir ---
  const indexPath = path.join(ROOT, "index.html");
  const indexHtml = fs.readFileSync(indexPath, "utf8");
  const startMarker = "<!-- PRODUCT_LD_START - assets/product-ld.json icerigi buraya gomulur, elle duzenleme - `node scripts/generate-seo-feed.js` calistir -->";
  const endMarker = "<!-- PRODUCT_LD_END -->";
  const startIdx = indexHtml.indexOf(startMarker);
  const endIdx = indexHtml.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    console.error("UYARI: index.html'de PRODUCT_LD_START/END isaretleri bulunamadi, JSON-LD gomulmedi.");
  } else {
    const block =
      startMarker +
      "\n    <script type=\"application/ld+json\">" +
      ldJson +
      "</script>\n    ";
    const newHtml = indexHtml.slice(0, startIdx) + block + indexHtml.slice(endIdx);
    fs.writeFileSync(indexPath, newHtml, "utf8");
    console.log("index.html icindeki JSON-LD blogu guncellendi.");
  }

  console.log(`products.json yazildi (${products.length} urun).`);
  console.log(`assets/product-ld.json yazildi (JSON-LD govdesi, ${itemListElements.length} Product node).`);
}

main();
