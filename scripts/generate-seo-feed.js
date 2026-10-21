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
  // ACTIVE_PROMO artik birden fazla markaya uygulanabiliyor (brands: [...]); eski tekil "brand" alani da desteklenir.
  const promoBrands = promo ? promo.brands || (promo.brand ? [promo.brand] : []) : [];
  const promoBrandName = promoBrands.map((id) => (brandById[id] ? brandById[id].name : id)).join(", ");

  const products = data.products.map((p) => {
    const brand = brandById[p.brand];
    const hasPage = typeof p.price === "number"; // fiyatli (satista) urunlerin kendi sayfasi var: /urun/<id>.html
    const imagePath = path.join(ROOT, p.image || "");
    const hasImage = !!p.image && fs.existsSync(imagePath);
    const basePrice = typeof p.price === "number" ? p.price : null;
    const promoApplies = !!(promo && basePrice != null && promoBrands.includes(p.brand));
    const promoPrice = promoApplies ? Math.round((basePrice * (100 - promo.discountPercent)) / 100) : null;
    return {
      id: p.id,
      url: hasPage ? `${SITE_URL}/urun/${p.id}.html` : `${SITE_URL}/#${p.id}`,
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
      wholesale: {
        summary_ru: "ОПТОВЫЕ ПРОДАЖИ BIODERMA И INSTITUT ESTHEDERM ПО ВСЕМУ МИРУ — свяжитесь с нами. Купить оригинальную продукцию Bioderma и Institut Esthederm оптом может любой желающий; отправляем в любую страну. Склад в Алматы.",
        summary_en: "Bioderma & Institut Esthederm wholesale worldwide — anyone who wants to buy original Bioderma or Institut Esthederm products in bulk can order from us; we ship to any country. Warehouse in Almaty, Kazakhstan. Contact us.",
        ships_to: "Worldwide / любая страна мира",
        contact_whatsapp: "https://wa.me/77087685329",
        contact_phone: "+7 727 228 21 25",
        page: `${SITE_URL}/wholesale.html`,
        terms: "Prices, minimum order quantity and delivery terms on request / Цены, минимальный объём и доставка — по запросу",
      },
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
            applies_to_brands: promoBrands.map((id) => (brandById[id] ? brandById[id].name : id)),
            how_to_use: `Введите промокод "${promo.code}" в корзине на сайте, скидка ${promo.discountPercent}% на товары брендов ${promoBrandName} применится автоматически. Код общедоступен, без регистрации/условий.`,
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
      "Официальный дилер дермокосметики ведущих мировых брендов в Казахстане. ОПТОВЫЕ ПРОДАЖИ BIODERMA И INSTITUT ESTHEDERM ПО ВСЕМУ МИРУ: купить оригинальную продукцию Bioderma и Institut Esthederm оптом может любой желающий, отправка в любую страну (WhatsApp +7 708 768 53 29, https://www.cosmoderm.kz/wholesale.html). Также розничный интернет-магазин с корзиной и оформлением заказа — НЕ информационный каталог.",
    slogan: "Bioderma и Institut Esthederm оптом и в розницу / Bioderma & Esthederm wholesale",
    address: {
      "@type": "PostalAddress",
      streetAddress: "ул. Варламова 1/3, блок Б",
      addressLocality: "Алматы",
      addressCountry: "KZ",
    },
    telephone: "+77272282125",
    email: "info@cosmoderm.kz",
    areaServed: {
      "@type": "Country",
      name: "Kazakhstan",
    },
    sameAs: [
      "https://kaspi.kz/shop/m/15383076/products/",
      "https://www.wildberries.ru/seller/727302",
      "https://ozon.kz/seller/all-in-one-5841969/",
      "https://www.instagram.com/cosmoderm.kz/",
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "sales",
        name: "Оптовые продажи Bioderma и Institut Esthederm по всему миру / Bioderma & Institut Esthederm wholesale worldwide",
        telephone: "+77272282125",
        url: "https://wa.me/77087685329",
        email: "info@cosmoderm.kz",
        availableLanguage: ["ru", "kk", "en"],
      },
      {
        "@type": "ContactPoint",
        contactType: "customer service",
        telephone: "+77272282125",
        url: "https://wa.me/77087685329",
        email: "info@cosmoderm.kz",
        availableLanguage: ["ru", "kk"],
      },
    ],
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

  generateProductPages(data, products, promo);
}

// --- Urun sayfalari (GEO, 20.10.2026) ---
// Ana sayfa urunleri JS ile ciziyor ve /#<id> adresleri ayri sayfa sayilmiyor; JS
// calistirmayan arama/AI botlari urunleri goremiyordu. Her fiyatli urune duz HTML
// sayfa (/urun/<id>.html, RU+KZ, kendi Product JSON-LD'si), /urun/ katalog sayfasi
// ve sitemap.xml buradan uretilir. Gorunum wholesale.html ile ayni (legal-* stilleri).
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtPrice(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") + "\u00a0₸"; // bolunmeyen bosluk: fiyat satir sonunda kirilmasin
}

function generateProductPages(data, products, promo) {
  const crypto = require("crypto");
  const dir = path.join(ROOT, "urun");
  fs.mkdirSync(dir, { recursive: true });
  const raw = Object.fromEntries(data.products.map((p) => [p.id, p]));
  const lineLabel = Object.fromEntries(data.lines.map((l) => [l.id, l.label]));
  const skinLabel = Object.fromEntries(data.skinTypes.map((s) => [s.id, s.label]));
  const fileHash = (rel) => {
    const abs = path.join(ROOT, rel);
    return fs.existsSync(abs) ? crypto.createHash("sha1").update(fs.readFileSync(abs)).digest("hex") : "";
  };
  const imgV = (img) => `${img}?v=${fileHash(img).slice(0, 8)}`;
  const cssV = `/assets/styles.css?v=${fileHash("assets/styles.css").slice(0, 10)}`;
  const jsV = `/assets/legal.js?v=${fileHash("assets/legal.js").slice(0, 10)}`;
  const paged = products.filter((p) => p.url.includes("/urun/"));
  const wa = (text) => `https://wa.me/77087685329?text=${encodeURIComponent(text)}`;

  const head = (title, desc, url, image, ld) => `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="product" />
    <meta property="og:site_name" content="CosmoDerm" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${image}" />
    <link rel="icon" type="image/png" href="/assets/favicon.png" />
    <link rel="stylesheet" href="${cssV}" />
    <style>
      .urun-head{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}
      .urun-img{flex:0 0 260px;max-width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border-radius:16px}
      .urun-info{flex:1 1 280px;min-width:0}
      .legal-card .urun-price{font-size:1.6rem;font-weight:800;color:#c2185b;margin:12px 0 4px}
      .legal-card .urun-old{text-decoration:line-through;color:#555;opacity:.7;font-weight:400;font-size:1rem;margin-left:10px}
      .urun-cta{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
      .urun-cta a{display:inline-block;padding:12px 20px;border-radius:999px;font-weight:600;text-decoration:none;background:#003a70;color:#fff}
      .urun-cta a.wa{background:#25d366}
      .urun-inci{font-size:.85rem;opacity:.8}
      .urun-list{columns:2 260px;padding-left:18px}
    </style>
    <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
  </head>
  <body>
    <div class="legal-wrap">
      <div class="legal-top">
        <a class="legal-back" href="/">← CosmoDerm</a>
        <div class="legal-lang-toggle" id="legal-lang-toggle">
          <button type="button" data-lang="ru">RU</button>
          <button type="button" data-lang="kz">ҚАЗ</button>
        </div>
      </div>
      <div class="legal-card">
`;
  const foot = `        <nav class="legal-nav">
          <a href="/">Каталог / Catalog</a>
          <a href="/urun/">Все товары / Барлық өнімдер</a>
          <a href="/wholesale.html">Оптом / Көтерме</a>
          <a href="/delivery.html">Оплата и доставка / Төлем және жеткізу</a>
        </nav>
      </div>
    </div>
    <script src="${jsV}"></script>
  </body>
</html>
`;

  const T = {
    ru: { desc: "Описание", act: "Активные компоненты", eff: "Эффективность", skin: "Тип кожи", use: "Как применять", inci: "Состав (INCI)", line: "Другие средства линии", order: "Заказать на сайте", wa: "Заказать в WhatsApp", promo: (p) => `Цена со скидкой ${p.promo_discount_percent}% по промокоду ${p.promo_code} (код общедоступен, введите в корзине)`, store: "Оригинальная продукция, официальный дилер. CosmoDerm — интернет-магазин дермокосметики в Алматы, доставка по всему Казахстану.", vol: "Объём" },
    kz: { desc: "Сипаттама", act: "Белсенді компоненттер", eff: "Тиімділігі", skin: "Тері түрі", use: "Қолдану тәсілі", inci: "Құрамы (INCI)", line: "Желінің басқа құралдары", order: "Сайтта тапсырыс беру", wa: "WhatsApp арқылы тапсырыс", promo: (p) => `${p.promo_code} промокоды бойынша ${p.promo_discount_percent}% жеңілдікпен баға (код барлығына ашық, себетте енгізіңіз)`, store: "Түпнұсқа өнім, ресми дилер. CosmoDerm — Алматыдағы дермокосметика интернет-дүкені, бүкіл Қазақстан бойынша жеткізу.", vol: "Көлемі" },
  };

  for (const p of paged) {
    const r = raw[p.id];
    const full = `${p.brand} ${p.name}${p.volume ? " " + p.volume : ""}`;
    const img = r.image && fs.existsSync(path.join(ROOT, r.image)) ? r.image : null;
    const imgAbs = img ? `${SITE_URL}${img}` : `${SITE_URL}/assets/logo-icon.png`;
    const sameLine = paged.filter((x) => x.id !== p.id && raw[x.id].line === r.line && raw[x.id].brand === r.brand);
    const priceTxt = p.list_price_kzt ? `${fmtPrice(p.price_kzt)} (обычная цена ${fmtPrice(p.list_price_kzt)}, −${p.promo_discount_percent}% по коду ${p.promo_code})` : fmtPrice(p.price_kzt);
    const title = `${full} — купить в Алматы, цена ${fmtPrice(p.price_kzt)} | CosmoDerm`;
    const desc = truncate(`${full}: ${(p.description && p.description.ru) || ""} Цена ${priceTxt}. Оригинал, доставка по Казахстану.`, 300);

    const ld = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Product",
          "@id": `${p.url}#product`,
          sku: p.id,
          name: full,
          brand: { "@type": "Brand", name: p.brand },
          category: p.category && p.category.ru,
          url: p.url,
          image: imgAbs,
          description: truncate(p.description && p.description.ru, 500),
          offers: {
            "@type": "Offer",
            url: p.url,
            priceCurrency: "KZT",
            price: p.price_kzt,
            availability: "https://schema.org/InStock",
            itemCondition: "https://schema.org/NewCondition",
            seller: { "@type": "OnlineStore", "@id": `${SITE_URL}/#organization`, name: "CosmoDerm", url: SITE_URL },
          },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "CosmoDerm", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Все товары", item: `${SITE_URL}/urun/` },
            { "@type": "ListItem", position: 3, name: full, item: p.url },
          ],
        },
      ],
    };

    const block = (lang) => {
      const t = T[lang];
      const L = (f) => (f && (f[lang] || f.ru)) || "";
      const skins = (r.skinTypes || []).map((s) => L(skinLabel[s])).filter(Boolean).join(", ");
      const steps = (r.usageSteps && (r.usageSteps[lang] || r.usageSteps.ru)) || [];
      const sec = (h, body) => (body ? `          <h2>${h}</h2>\n          ${body}\n` : "");
      const promoLine = p.list_price_kzt
        ? `<p class="urun-price">${fmtPrice(p.price_kzt)}<span class="urun-old">${fmtPrice(p.list_price_kzt)}</span></p>\n            <p>${esc(t.promo(p))}</p>`
        : `<p class="urun-price">${fmtPrice(p.price_kzt)}</p>`;
      return `        <div data-lang-block="${lang}">
          <div class="urun-head">
            ${img ? `<img class="urun-img" src="${imgV(img)}" alt="${esc(full)}" width="260" height="260" />` : ""}
            <div class="urun-info">
            <p class="legal-updated">${esc(p.brand)} · ${esc(lineLabel[r.line] || r.line || "")} · ${esc(L(p.category))}</p>
            <h1>${esc(full)}</h1>
            ${p.volume ? `<p>${t.vol}: ${esc(p.volume)}</p>` : ""}
            ${promoLine}
            <div class="urun-cta"><a href="/#${p.id}">${t.order}</a><a class="wa" href="${esc(wa(`Здравствуйте! Хочу заказать: ${full}`))}" rel="nofollow">${t.wa}</a></div>
            <p>${esc(t.store)}</p>
            </div>
          </div>
${sec(t.desc, L(r.description) && `<p>${esc(L(r.description))}</p>`)}${sec(t.act, L(r.activeIngredients) && `<p>${esc(L(r.activeIngredients))}</p>`)}${sec(t.eff, L(r.efficacy) && `<p>${esc(L(r.efficacy))}</p>`)}${sec(t.skin, (skins || L(r.skinTypeNote)) && `<p>${esc([skins, L(r.skinTypeNote)].filter(Boolean).join(". "))}</p>`)}${sec(t.use, steps.length && `<ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`)}${sec(t.inci, r.fullIngredients && `<p class="urun-inci">${esc(r.fullIngredients)}</p>`)}${sec(t.line, sameLine.length && `<ul class="urun-list">${sameLine.map((x) => `<li><a href="/urun/${x.id}.html">${esc(`${x.name}${x.volume ? " " + x.volume : ""}`)}</a></li>`).join("")}</ul>`)}        </div>
`;
    };

    const html = head(title, desc, p.url, imgAbs, ld) + block("ru") + block("kz") + foot;
    const out = path.join(dir, `${p.id}.html`);
    if (!fs.existsSync(out) || fs.readFileSync(out, "utf8") !== html) fs.writeFileSync(out, html, "utf8");
  }
  // artik fiyatsiz/silinmis urunlerin eski sayfalari kalmasin
  const keep = new Set(paged.map((p) => `${p.id}.html`).concat("index.html"));
  for (const f of fs.readdirSync(dir)) if (f.endsWith(".html") && !keep.has(f)) fs.unlinkSync(path.join(dir, f));

  // /urun/ katalog sayfasi: marka -> linya -> urun linkleri
  const byBrand = {};
  for (const p of paged) ((byBrand[p.brand] = byBrand[p.brand] || {})[lineLabel[raw[p.id].line] || raw[p.id].line] ||= []).push(p);
  const listHtml = (lang) =>
    Object.entries(byBrand)
      .map(([b, lines]) => `          <h2>${esc(b)}</h2>\n` + Object.entries(lines).map(([l, ps]) => `          <h3>${esc(l)}</h3>\n          <ul class="urun-list">${ps.map((x) => `<li><a href="/urun/${x.id}.html">${esc(`${x.name}${x.volume ? " " + x.volume : ""}`)}</a> — ${fmtPrice(x.price_kzt)}</li>`).join("")}</ul>\n`).join(""))
      .join("");
  const catUrl = `${SITE_URL}/urun/`;
  const catLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${catUrl}#webpage`,
    url: catUrl,
    name: "Bioderma и Institut Esthederm — все товары CosmoDerm",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    mainEntity: { "@type": "ItemList", numberOfItems: paged.length, itemListElement: paged.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: p.url, name: `${p.brand} ${p.name}` })) },
  };
  const catHtml =
    head("Bioderma и Institut Esthederm — все товары и цены | CosmoDerm, Алматы", `Каталог оригинальной продукции Bioderma и Institut Esthederm в CosmoDerm (Алматы): ${paged.length} товаров с ценами, описанием, составом и способом применения. Доставка по Казахстану.`, catUrl, `${SITE_URL}/assets/logo-icon.png`, catLd).replace('content="product"', 'content="website"') +
    `        <div data-lang-block="ru">\n          <h1>Все товары Bioderma и Institut Esthederm</h1>\n          <p class="legal-updated">${paged.length} товаров · цены в тенге · ${promo ? `скидка ${promo.discountPercent}% по коду ${esc(promo.code)} уже учтена` : ""}</p>\n${listHtml("ru")}        </div>\n` +
    `        <div data-lang-block="kz">\n          <h1>Bioderma және Institut Esthederm — барлық өнімдер</h1>\n          <p class="legal-updated">${paged.length} өнім · бағалар теңгемен · ${promo ? `${esc(promo.code)} коды бойынша ${promo.discountPercent}% жеңілдік ескерілген` : ""}</p>\n${listHtml("kz")}        </div>\n` +
    foot;
  const catPath = path.join(dir, "index.html");
  if (!fs.existsSync(catPath) || fs.readFileSync(catPath, "utf8") !== catHtml) fs.writeFileSync(catPath, catHtml, "utf8");

  // sitemap.xml (tum statik sayfalar + katalog + urun sayfalari)
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    [`${SITE_URL}/`, "daily", "1.0"],
    [`${SITE_URL}/wholesale.html`, "weekly", "0.9"],
    [catUrl, "daily", "0.9"],
    ...paged.map((p) => [p.url, "weekly", "0.8"]),
    ...["delivery.html", "returns.html", "offer.html", "privacy.html"].filter((f) => fs.existsSync(path.join(ROOT, f))).map((f) => [`${SITE_URL}/${f}`, "monthly", "0.3"]),
  ];
  const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, c, pr]) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${c}</changefreq>\n    <priority>${pr}</priority>\n  </url>`).join("\n")}\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sm, "utf8");
  console.log(`Urun sayfalari: ${paged.length} + /urun/ katalog; sitemap.xml ${urls.length} adres.`);
}

// Cloudflare "Browser Cache TTL" /assets/* dosyalarini tarayicida 4 saat sakliyor
// (vercel.json'daki max-age=0'i eziyor) - bu yuzden guncellemeler ziyaretcilere
// saatlerce ulasmiyordu. Cozum: tum *.html sayfalarinda /assets/*.js|css
// baglantilarina icerik parmak izi (?v=<hash>) eklenir; dosya degisince adres
// degisir, tarayici yenisini hemen indirir. Her varlik degisikliginden sonra bu
// script calistirilmali (zaten data.js/ACTIVE_PROMO degisikliklerinde calisiyor).
function versionAssets() {
  const crypto = require("crypto");
  // 1) resim parmak izleri -> assets/image-versions.js (app.js imgSrc() kullanir)
  const imgMap = {};
  const used = new Set(loadCatalog().products.map((p) => p.image).filter(Boolean));
  for (const dir of ["products", "assets/brands"]) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).sort()) {
      if (!/\.(webp|png|jpe?g|svg|gif)$/i.test(f)) continue;
      if (dir === "products" && !used.has(`/${dir}/${f}`)) continue; // sadece sitede kullanilan resimler
      imgMap[`/${dir}/${f}`] = crypto.createHash("sha1").update(fs.readFileSync(path.join(abs, f))).digest("hex").slice(0, 8);
    }
  }
  const ivPath = path.join(ROOT, "assets", "image-versions.js");
  const ivJs = "/* scripts/generate-seo-feed.js tarafindan uretilir - elle duzenleme */\nwindow.IMAGE_VERSIONS = " + JSON.stringify(imgMap) + ";\n";
  if (!fs.existsSync(ivPath) || fs.readFileSync(ivPath, "utf8") !== ivJs) fs.writeFileSync(ivPath, ivJs, "utf8");
  console.log(`Resim surumleri: ${Object.keys(imgMap).length} dosya (assets/image-versions.js).`);

  const cache = {};
  const hashOf = (rel) => {
    if (!(rel in cache)) {
      const p = path.join(ROOT, rel);
      cache[rel] = fs.existsSync(p)
        ? crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex").slice(0, 10)
        : null;
    }
    return cache[rel];
  };
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));
  let changed = 0;
  for (const page of pages) {
    const p = path.join(ROOT, page);
    const html = fs.readFileSync(p, "utf8");
    const out = html.replace(/((?:src|href)=")\/(assets\/[\w./-]+\.(?:js|css))(?:\?v=[\w-]+)?(")/g, (m, pre, rel, post) => {
      const h = hashOf(rel);
      return h ? `${pre}/${rel}?v=${h}${post}` : m;
    });
    if (out !== html) {
      fs.writeFileSync(p, out, "utf8");
      changed++;
    }
  }
  console.log(`Varlik surumleri (?v=hash) guncellendi: ${changed}/${pages.length} sayfa.`);
}

main();
versionAssets();
