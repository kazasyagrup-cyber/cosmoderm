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

function truncate(str, max) {
  if (!str) return "";
  const clean = str.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1).trim() + "…" : clean;
}

function main() {
  const data = loadCatalog();
  const brandById = Object.fromEntries(data.brands.map((b) => [b.id, b]));
  const catById = Object.fromEntries(data.categories.map((c) => [c.id, c]));

  const products = data.products.map((p) => {
    const brand = brandById[p.brand];
    const imagePath = path.join(ROOT, p.image || "");
    const hasImage = !!p.image && fs.existsSync(imagePath);
    return {
      id: p.id,
      url: `${SITE_URL}/#${p.id}`,
      brand: brand ? brand.name : p.brand,
      line: p.line,
      category: catById[p.category] ? catById[p.category].label : { ru: p.category, kz: p.category },
      volume: p.volume || null,
      price_kzt: typeof p.price === "number" ? p.price : null,
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
        "Профессиональный интернет-магазин дермокосметики ведущих мировых брендов. Розничная и оптовая продажа только оригинальной продукции.",
      currency: "KZT",
      languages: ["ru", "kz"],
      how_to_order: "WhatsApp: https://wa.me/77087685329 (добавить товары в корзину на сайте и оформить заказ)",
      brands: data.brands.filter((b) => b.status === "active").map((b) => b.name),
    },
    products,
  };

  fs.writeFileSync(path.join(ROOT, "products.json"), JSON.stringify(feed, null, 2) + "\n", "utf8");

  // --- JSON-LD (index.html'e gomulecek, kompakt - RU odakli, Google/AI rich-result icin) ---
  const org = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "CosmoDerm",
    url: SITE_URL,
    logo: `${SITE_URL}/assets/logo-icon.png`,
    description:
      "Официальный дилер дермокосметики ведущих мировых брендов в Казахстане. Розничная и оптовая продажа только оригинальной продукции.",
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
    const node = {
      "@type": "Product",
      "@id": `${SITE_URL}/#${p.id}`,
      sku: p.id,
      name: p.name,
      brand: { "@type": "Brand", name: p.brand },
      category: p.category && p.category.ru,
      url: p.url,
      description: truncate(p.description && p.description.ru, 300),
    };
    if (p.image) node.image = p.image;
    if (p.price_kzt) {
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
