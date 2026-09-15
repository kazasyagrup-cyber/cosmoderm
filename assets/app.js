// cache-bust: 2026-09-14-2
(function () {
  const { brands, categories, skinTypes, lines, products, innovations } = window.CATALOG_DATA;
  const I18N = window.UI_I18N;

  const lineAccents = {
    sebium: { bg: "#dcfce7", fg: "#16a34a" }, sensibio: { bg: "#ffe4e9", fg: "#be123c" },
    hydrabio: { bg: "#e0f7fa", fg: "#0e7490" }, atoderm: { bg: "#dbeafe", fg: "#1d4ed8" },
    photoderm: { bg: "#fef9e2", fg: "#a16207" }, cicabio: { bg: "#f1e9ff", fg: "#6d28d9" },
    pigmentbio: { bg: "#fce7fa", fg: "#a21caf" }, node: { bg: "#e6e8ff", fg: "#4338ca" },
    abcderm: { bg: "#fff1e6", fg: "#c2410c" }, matricium: { bg: "#eafbe7", fg: "#166534" },
    cleanance: { bg: "#e6f4ea", fg: "#15803d" }, "tolerance-extreme": { bg: "#fef2f2", fg: "#b91c1c" },
    hydrance: { bg: "#e0f7fa", fg: "#0e7490" }, "cicalfate-plus": { bg: "#f1e9ff", fg: "#6d28d9" },
    antirougeurs: { bg: "#ffe4e9", fg: "#be123c" }, effaclar: { bg: "#fef3e2", fg: "#b45309" },
    cicaplast: { bg: "#f1e9ff", fg: "#6d28d9" }, anthelios: { bg: "#fef9e2", fg: "#a16207" },
    toleriane: { bg: "#fef2f2", fg: "#b91c1c" }, lipikar: { bg: "#e3f8f2", fg: "#0f766e" },
    bariederm: { bg: "#f1e9ff", fg: "#6d28d9" }, xemose: { bg: "#e3f8f2", fg: "#0f766e" },
    "ds-laboratoire": { bg: "#fce7fa", fg: "#a21caf" }, "eau-thermale-uriage": { bg: "#e0f7fa", fg: "#0e7490" },
    hyseac: { bg: "#fef3e2", fg: "#b45309" }, "mineral-89": { bg: "#e0f7fa", fg: "#0e7490" },
    liftactiv: { bg: "#fce7fa", fg: "#a21caf" }, normaderm: { bg: "#fef3e2", fg: "#b45309" },
    "aqualia-thermal": { bg: "#e0f7fa", fg: "#0e7490" }, "capital-soleil": { bg: "#fef9e2", fg: "#a16207" },
    anaphase: { bg: "#e6e8ff", fg: "#4338ca" }, kelual: { bg: "#e6e8ff", fg: "#4338ca" }, squanorm: { bg: "#e6e8ff", fg: "#4338ca" },
    "huile-prodigieuse": { bg: "#fef9e2", fg: "#a16207" }, "reve-de-miel": { bg: "#fef3e2", fg: "#b45309" },
    sebiaclear: { bg: "#e6f4ea", fg: "#15803d" }, topialyse: { bg: "#e3f8f2", fg: "#0f766e" },
    "premium-lierac": { bg: "#fce7fa", fg: "#a21caf" }, diopti: { bg: "#e0f7fa", fg: "#0e7490" },
    "lait-creme-concentre": { bg: "#fef3e2", fg: "#b45309" },
    "cerave-moisturizers": { bg: "#e3f8f2", fg: "#0f766e" }, "cerave-cleansers": { bg: "#e6f4ea", fg: "#15803d" }, "cerave-sa": { bg: "#e3f8f2", fg: "#0f766e" },
    "sc-antioxidants": { bg: "#fef9e2", fg: "#a16207" }, "sc-hydrating": { bg: "#e0f7fa", fg: "#0e7490" },
    "mustela-bebe": { bg: "#e0e7ff", fg: "#1e3a8a" }, "mustela-stelatopia": { bg: "#cffafe", fg: "#0891b2" },
    "mustela-maternite": { bg: "#fce7f3", fg: "#db2777" }, "mustela-soleil": { bg: "#fef9c3", fg: "#ca8a04" }
  };

  const NAV_CATEGORIES = ["cleansing", "moisturizing", "sun-protection", "body-care", "hair-care"];

  const brandLogos = {
    bioderma: "bioderma.png",
    avene: "avene.png",
    "la-roche-posay": "la-roche-posay.svg",
    uriage: "uriage.svg",
    vichy: "vichy.jpg",
    ducray: "ducray.png",
    nuxe: "nuxe.svg",
    svr: "svr.png",
    lierac: "lierac.svg",
    embryolisse: "embryolisse.png",
    cerave: "cerave.png",
    mustela: "mustela.png"
  };

  const brandRingColors = {
    bioderma: "#dc2626",
    avene: "#db2777",
    "la-roche-posay": "#2563eb",
    uriage: "#0d9488",
    vichy: "#7c3aed",
    ducray: "#ea580c",
    nuxe: "#16a34a",
    svr: "#0891b2",
    lierac: "#9333ea",
    embryolisse: "#ca8a04",
    cerave: "#4f46e5",
    skinceuticals: "#57534e",
    mustela: "#0284c7"
  };

  function lineAccent(lineId) {
    return lineAccents[lineId] || { bg: "#f7f2ea", fg: "#9c6b30" };
  }

  function normalizeText(s) {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  const MISSING_PHOTOS = new Set([
    "tolerance-extreme-creme-riche.webp",
    "anthelios-dermo-kids.webp",
    "eau-thermale-lingettes.webp",
    "liftactiv-peptide-c.webp",
    "aqualia-thermal-riche.webp",
    "topialyse-cica-plus.webp",
    "diopti-ice-effect.webp",
    "lait-creme-mist.webp"
  ]);
  const promoProducts = products.filter((p) => !MISSING_PHOTOS.has(p.image.split("/").pop()));
  let promoIndex = 0;
  let promoTimer = null;

  const state = {
    lang: localStorage.getItem("cosmoderm-lang") || "ru",
    brand: "all",
    category: "all",
    query: ""
  };

  // Aktif indirim kodu - zaman zaman degisecek/yenilenecek, sadece bu blogu
  // guncelle (brand: data.js -> brands id'si, hangi markaya indirim uygulanacak).
  const ACTIVE_PROMO = {
    code: "NAOS",
    discountPercent: 20,
    brand: "bioderma"
  };

  const CART_KEY = "cosmoderm-cart";
  const CART_UPDATED_KEY = "cosmoderm-cart-updated";
  const CART_EXPIRY_MS = 2 * 60 * 1000; // 2 dakika hareketsizlikten sonra sepet otomatik bosalir
  let cart = {};
  // Promosyon kodu BILEREK kalici tutulmuyor (localStorage'a yazilmiyor) -
  // musteri her ziyarette/sayfa yenilemesinde kodu yeniden yazmali, sepete
  // urun eklemek tek basina indirim getirmemeli.
  let appliedPromoCode = "";

  function normalizePromoCode(value) {
    return (value || "").trim().toUpperCase();
  }

  function isPromoActive() {
    return normalizePromoCode(appliedPromoCode) === normalizePromoCode(ACTIVE_PROMO.code);
  }

  function productDiscountPercent(product) {
    return isPromoActive() && product.brand === ACTIVE_PROMO.brand ? ACTIVE_PROMO.discountPercent : 0;
  }

  function discountedPrice(product) {
    const percent = productDiscountPercent(product);
    if (!percent || !product.price) return product.price;
    return Math.round((product.price * (100 - percent)) / 100);
  }

  function applyPromoCode(rawValue) {
    const normalized = normalizePromoCode(rawValue);
    if (!normalized) {
      // Kutu bosaltilip "Uygula"ya basilmasi = aktif indirimi bilerek kaldirma.
      appliedPromoCode = "";
      return "empty";
    }
    if (normalized !== normalizePromoCode(ACTIVE_PROMO.code)) return "invalid";
    appliedPromoCode = normalized;
    return "applied";
  }

  function loadCart() {
    try {
      const updatedAt = parseInt(localStorage.getItem(CART_UPDATED_KEY) || "0", 10);
      if (updatedAt && Date.now() - updatedAt > CART_EXPIRY_MS) {
        cart = {};
        localStorage.removeItem(CART_KEY);
        localStorage.removeItem(CART_UPDATED_KEY);
        return;
      }
      const raw = localStorage.getItem(CART_KEY);
      cart = raw ? JSON.parse(raw) : {};
    } catch (e) {
      cart = {};
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      localStorage.setItem(CART_UPDATED_KEY, String(Date.now()));
    } catch (e) {}
  }

  function cartQty(id) {
    return cart[id] || 0;
  }

  function getCartItems() {
    return Object.keys(cart)
      .map((id) => ({ product: products.find((p) => p.id === id), qty: cart[id] }))
      .filter((item) => item.product && item.qty > 0);
  }

  function cartCount() {
    return getCartItems().reduce((sum, item) => sum + item.qty, 0);
  }

  function cartTotal() {
    return getCartItems().reduce((sum, item) => sum + (discountedPrice(item.product) || 0) * item.qty, 0);
  }

  function changeCartQty(id, delta) {
    const next = Math.max(0, cartQty(id) + delta);
    if (next === 0) delete cart[id];
    else cart[id] = next;
    saveCart();
    syncCartUI();
  }

  const el = {
    langButtons: document.querySelectorAll("[data-lang-btn]"),
    navQuick: document.getElementById("nav-quick"),
    searchInput: document.getElementById("search-input"),
    searchResults: document.getElementById("search-results"),
    productGrid: document.getElementById("product-grid"),
    modal: document.getElementById("product-modal"),
    modalClose: document.getElementById("modal-close"),
    innovationsList: document.getElementById("innovations-list"),
    brandStripList: document.getElementById("brand-strip-list"),
    promoViewport: document.getElementById("promo-viewport"),
    promoSlide: document.getElementById("promo-slide"),
    promoPrev: document.querySelector(".promo-arrow-prev"),
    promoNext: document.querySelector(".promo-arrow-next"),
    cartToggle: document.getElementById("cart-toggle"),
    cartCount: document.getElementById("cart-count"),
    cartHeaderTotal: document.getElementById("cart-header-total"),
    cartDrawer: document.getElementById("cart-drawer"),
    cartDrawerBackdrop: document.getElementById("cart-drawer-backdrop"),
    cartDrawerClose: document.getElementById("cart-drawer-close"),
    cartItems: document.getElementById("cart-items"),
    cartTotalValue: document.getElementById("cart-total-value"),
    cartWhatsappBtn: document.getElementById("cart-whatsapp-btn"),
    cartClearBtn: document.getElementById("cart-clear-btn"),
    promoInput: document.getElementById("promo-code-input"),
    promoApplyBtn: document.getElementById("promo-code-apply"),
    promoMessage: document.getElementById("promo-code-message")
  };

  function t(key) {
    return (I18N[state.lang] && I18N[state.lang][key]) || I18N.ru[key] || key;
  }

  function tr(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    return v[state.lang] || v.ru || Object.values(v)[0] || "";
  }

  function trList(v) {
    if (v == null) return [];
    if (Array.isArray(v)) return v;
    return v[state.lang] || v.ru || [];
  }

  function categoryLabel(id) {
    const c = categories.find((c) => c.id === id);
    return c ? tr(c.label) : id;
  }
  function skinLabel(id) {
    const s = skinTypes.find((s) => s.id === id);
    return s ? tr(s.label) : id;
  }
  function lineLabel(id) {
    const l = lines.find((l) => l.id === id);
    return l ? l.label : id;
  }
  function brandName(id) {
    const b = brands.find((b) => b.id === id);
    return b ? b.name : id;
  }

  function monogram(lineId) {
    return lineLabel(lineId).slice(0, 2).toUpperCase();
  }

  function applyI18n() {
    document.documentElement.lang = state.lang === "kz" ? "kk" : "ru";
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      node.setAttribute("placeholder", t(node.getAttribute("data-i18n-placeholder")));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((node) => {
      node.setAttribute("aria-label", t(node.getAttribute("data-i18n-aria")));
    });
    const titleEl = document.querySelector("title");
    if (titleEl) titleEl.textContent = t("meta.title");
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", t("meta.description"));
    el.langButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-lang-btn") === state.lang);
    });
  }

  function setLang(lang) {
    if (lang === state.lang) return;
    state.lang = lang;
    localStorage.setItem("cosmoderm-lang", lang);
    applyI18n();
    renderPromoSlide();
    render();
    updateCartBadge();
    if (el.cartDrawer && !el.cartDrawer.hidden) renderCartDrawer();
  }

  function filterProducts() {
    const query = normalizeText(state.query.trim());
    return products.filter((p) => {
      if (state.brand !== "all" && p.brand !== state.brand) return false;
      if (state.category !== "all" && p.category !== state.category) return false;
      if (query && !normalizeText(`${p.name} ${lineLabel(p.line)} ${brandName(p.brand)} ${tr(p.description)}`).includes(query)) return false;
      return true;
    });
  }

  function renderSearchResults(rawQuery) {
    if (!el.searchResults) return;
    const query = normalizeText(rawQuery.trim());
    if (!query) {
      el.searchResults.hidden = true;
      el.searchResults.innerHTML = "";
      return;
    }
    const matches = products
      .filter((p) => normalizeText(`${p.name} ${lineLabel(p.line)} ${brandName(p.brand)}`).includes(query))
      .slice(0, 8);

    if (matches.length === 0) {
      el.searchResults.innerHTML = `<p class="search-result-empty">${t("catalog.empty")}</p>`;
      el.searchResults.hidden = false;
      return;
    }

    el.searchResults.innerHTML = matches
      .map((p, i) => {
        const accent = lineAccent(p.line);
        return `
      <button type="button" class="search-result-item" data-index="${i}">
        <span class="result-brand" style="color:${accent.fg}">${brandName(p.brand)} · ${lineLabel(p.line)}</span>
        <span class="result-name">${p.name}</span>
      </button>
    `;
      })
      .join("");
    el.searchResults.querySelectorAll(".search-result-item").forEach((btn, i) => {
      btn.addEventListener("click", () => {
        openModal(matches[i]);
        el.searchResults.hidden = true;
        el.searchResults.innerHTML = "";
        el.searchInput.value = "";
        state.query = "";
        render();
      });
    });
    el.searchResults.hidden = false;
  }

  function renderNavQuick() {
    el.navQuick.innerHTML = "";
    const allLink = document.createElement("a");
    allLink.href = "#catalog";
    allLink.textContent = t("nav.all");
    allLink.className = state.category === "all" ? "is-active" : "";
    allLink.addEventListener("click", () => {
      state.category = "all";
      state.brand = "all";
      render();
    });
    el.navQuick.appendChild(allLink);

    NAV_CATEGORIES.forEach((catId) => {
      const a = document.createElement("a");
      a.href = "#catalog";
      a.textContent = categoryLabel(catId);
      a.className = state.category === catId ? "is-active" : "";
      a.addEventListener("click", () => {
        state.category = catId;
        state.brand = "all";
        render();
      });
      el.navQuick.appendChild(a);
    });

    const brandsLink = document.createElement("a");
    brandsLink.href = "#brand-strip";
    brandsLink.textContent = t("nav.brands");
    el.navQuick.appendChild(brandsLink);
  }

  function renderTags(typeIds) {
    return typeIds.map((id) => `<span class="tag">${skinLabel(id)}</span>`).join("");
  }

  function formatPrice(value) {
    return value.toLocaleString("ru-RU") + " ₸";
  }

  function priceMarkup(product) {
    if (!product.price) return "";
    const vol = product.volume ? `<span class="product-volume">${product.volume}</span>` : "";
    const percent = productDiscountPercent(product);
    if (!percent) return `<div class="product-price">${formatPrice(product.price)}${vol}</div>`;
    return `<div class="product-price product-price-discounted">
      <span class="product-price-old">${formatPrice(product.price)}</span>
      <span class="product-price-new">${formatPrice(discountedPrice(product))}</span>
      <span class="product-price-promo-tag">-${percent}%</span>
      ${vol}
    </div>`;
  }

  function cartStepperMarkup(product) {
    const qty = cartQty(product.id);
    return `
      <div class="cart-stepper${qty > 0 ? " has-qty" : ""}" data-product-id="${product.id}">
        <button type="button" class="stepper-btn stepper-minus" aria-label="-">−</button>
        <span class="stepper-qty">${qty}</span>
        <button type="button" class="stepper-btn stepper-plus" aria-label="+">+<span class="stepper-add-label">${t("cart.add")}</span></button>
      </div>
    `;
  }

  function photoMarkup(product) {
    const accent = lineAccent(product.line);
    return `
      <div class="product-photo">
        <img data-src="${product.image}" alt="${product.name}" hidden />
        <div class="photo-fallback" style="background:${accent.bg};color:${accent.fg}">
          <span class="monogram" style="color:${accent.fg}">${monogram(product.line)}</span>
          <span class="soon-badge" style="color:${accent.fg}">${t("photo.soon")}</span>
        </div>
      </div>
    `;
  }

  // Grid photos start as <img data-src> (no fetch) and only get a real `src`
  // once the card nears the viewport - a plain `loading="lazy"` doesn't work
  // here because the img stays `hidden` (display:none) until it has loaded,
  // and browsers never lazy-load an element with no layout box.
  let gridPhotoObserver = null;
  function getGridPhotoObserver() {
    if (gridPhotoObserver || typeof IntersectionObserver === "undefined") return gridPhotoObserver;
    gridPhotoObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const container = entry.target;
          observer.unobserve(container);
          const img = container.querySelector("img");
          if (img && img.dataset.src) img.src = img.dataset.src;
        });
      },
      { rootMargin: "400px 0px" }
    );
    return gridPhotoObserver;
  }

  function wirePhoto(container) {
    const img = container.querySelector("img");
    img.addEventListener("load", () => {
      img.hidden = false;
      const fallback = container.querySelector(".photo-fallback");
      if (fallback) fallback.style.display = "none";
    });
    img.addEventListener("error", () => {
      img.hidden = true;
    });
    // observe the (visible) photo container, not the hidden <img> itself -
    // an element with no layout box never intersects.
    const observer = getGridPhotoObserver();
    if (observer) observer.observe(container);
    else if (img.dataset.src) img.src = img.dataset.src;
  }

  function renderProductGrid(list) {
    el.productGrid.innerHTML = "";
    if (list.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = t("catalog.empty");
      el.productGrid.appendChild(empty);
      return;
    }
    const groups = [];
    const groupIndexByLine = new Map();
    list.forEach((product) => {
      if (!groupIndexByLine.has(product.line)) {
        groupIndexByLine.set(product.line, groups.length);
        groups.push({ line: product.line, brand: product.brand, items: [] });
      }
      groups[groupIndexByLine.get(product.line)].items.push(product);
    });

    let previousBrand = null;
    groups.forEach((group, groupIndex) => {
      const isFirstGroup = groupIndex === 0;
      if (group.brand !== previousBrand) {
        if (!isFirstGroup) {
          const brandHeading = document.createElement("div");
          brandHeading.className = "brand-group-heading";
          brandHeading.textContent = brandName(group.brand);
          el.productGrid.appendChild(brandHeading);
        }
        previousBrand = group.brand;
      }

      const section = document.createElement("div");
      section.className = "line-group";

      if (!isFirstGroup) {
        const heading = document.createElement("div");
        heading.className = "line-group-heading";
        heading.innerHTML = `<h3>${lineLabel(group.line)}</h3><span class="line-count">${group.items.length}</span>`;
        section.appendChild(heading);
      }

      const grid = document.createElement("div");
      grid.className = "line-group-grid";
      group.items.forEach((product) => {
        const accent = lineAccent(product.line);
        const card = document.createElement("article");
        card.className = "product-card";
        card.style.setProperty("--card-accent", accent.fg);
        card.innerHTML = `
          ${photoMarkup(product)}
          <div class="product-body">
            <div class="eyebrow-row">
              <span class="brand-eyebrow">${brandName(product.brand)}</span>
              <span class="line" style="color:${accent.fg}">· ${lineLabel(product.line)}</span>
            </div>
            <button type="button" class="product-name">${product.name}</button>
            ${priceMarkup(product)}
            <div class="tag-row">${renderTags(product.skinTypes)}</div>
            ${product.price ? cartStepperMarkup(product) : ""}
          </div>
        `;
        wirePhoto(card);
        card.addEventListener("click", (e) => {
          if (e.target.closest(".cart-stepper")) return;
          openModal(product);
        });
        grid.appendChild(card);
      });
      section.appendChild(grid);
      el.productGrid.appendChild(section);
    });
  }

  function renderBrandStrip() {
    if (!el.brandStripList) return;
    el.brandStripList.innerHTML = "";
    const makeCircle = (brand) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "brand-circle" + (state.brand === brand.id ? " is-active" : "");
      const logo = brandLogos[brand.id];
      const ring = brandRingColors[brand.id] || "#9ca3af";
      btn.style.setProperty("--ring-color", ring);
      btn.innerHTML = `
        <span class="circle-frame">
          ${logo ? `<img src="/assets/brands/${logo}" alt="${brand.name}" loading="lazy" />` : `<span>${brand.name.slice(0, 2).toUpperCase()}</span>`}
        </span>
        <span>${brand.name}</span>
      `;
      btn.addEventListener("click", () => {
        state.brand = brand.id;
        state.category = "all";
        render();
        document.getElementById("catalog").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return btn;
    };
    // render the brand list twice back-to-back so the CSS marquee can loop seamlessly at -50%
    brands.forEach((brand) => el.brandStripList.appendChild(makeCircle(brand)));
    brands.forEach((brand) => el.brandStripList.appendChild(makeCircle(brand)));
  }

  function renderPromoSlide() {
    if (!el.promoSlide || promoProducts.length === 0) return;
    const product = promoProducts[promoIndex];
    const accent = lineAccent(product.line);
    const showPromoRibbon = product.brand === ACTIVE_PROMO.brand;
    el.promoSlide.style.background = `linear-gradient(120deg, ${accent.bg}, #ffffff 70%)`;
    el.promoSlide.innerHTML = `
      <div class="promo-info">
        ${
          showPromoRibbon
            ? `<div class="promo-discount-ribbon"><img class="promo-ribbon-icon" src="/assets/naos-icon.png" alt="" /> ${t("promo.discountRibbon").replace(
                "{percent}",
                ACTIVE_PROMO.discountPercent
              )} <span class="promo-ribbon-code">${ACTIVE_PROMO.code}</span></div>`
            : ""
        }
        <span class="promo-brand">
          <span class="promo-brand-name">${brandName(product.brand)}</span>
          <span class="promo-line" style="color:${accent.fg}">${lineLabel(product.line)}</span>
        </span>
        <h2 class="promo-name">${product.name} ${product.volume ? `<span class="promo-name-volume">${product.volume}</span>` : ""}</h2>
        <p class="promo-desc">${tr(product.description)}</p>
        ${product.efficacy ? `<p class="promo-efficacy" style="color:${accent.fg}">${tr(product.efficacy)}</p>` : ""}
        <div class="tag-row">${renderTags(product.skinTypes)}</div>
        <div class="promo-actions">
          ${
            product.price
              ? showPromoRibbon
                ? `<div class="promo-price-box promo-price-box-discounted"><span class="promo-price-old">${formatPrice(product.price)}</span><span class="promo-price-new">${formatPrice(Math.round((product.price * (100 - ACTIVE_PROMO.discountPercent)) / 100))}</span></div>`
                : `<div class="promo-price-box">${formatPrice(product.price)}</div>`
              : ""
          }
          <button type="button" class="btn btn-primary promo-cta">${t("product.detailsBtn")}</button>
        </div>
      </div>
      <div class="promo-photo">
        <img src="${product.image}" alt="${product.name}" />
      </div>
    `;
    el.promoSlide.classList.remove("is-visible");
    void el.promoSlide.offsetWidth;
    el.promoSlide.classList.add("is-visible");
    el.promoSlide.querySelector(".promo-cta").addEventListener("click", () => openModal(product));
  }

  function goToPromoSlide(index) {
    if (promoProducts.length === 0) return;
    promoIndex = (index + promoProducts.length) % promoProducts.length;
    renderPromoSlide();
  }

  function startPromoAutoplay() {
    stopPromoAutoplay();
    promoTimer = setInterval(() => goToPromoSlide(promoIndex + 1), 4500);
  }

  function stopPromoAutoplay() {
    if (promoTimer) {
      clearInterval(promoTimer);
      promoTimer = null;
    }
  }

  function openModal(product) {
    if (location.hash.slice(1) !== product.id) {
      history.pushState(null, "", "#" + product.id);
    }
    const steps = trList(product.usageSteps).map((step) => `<li>${step}</li>`).join("");
    const modalAccent = lineAccent(product.line);
    document.getElementById("modal-content").innerHTML = `
      <div class="eyebrow-row">
        <span class="brand-eyebrow">${brandName(product.brand)}</span>
        <span class="line" style="color:${modalAccent.fg}">· ${lineLabel(product.line)}</span>
      </div>
      <h2>${product.name}</h2>
      ${priceMarkup(product)}
      ${product.price ? `<div class="modal-cart-row">${cartStepperMarkup(product)}</div>` : ""}
      ${photoMarkupModal(product)}
      <div class="info-block">
        <h4>${t("modal.description")}</h4>
        <p>${tr(product.description)}</p>
      </div>
      ${
        product.skinTypeNote
          ? `<div class="note-block"><h4>${t("modal.suitableFor")}</h4><p>${tr(product.skinTypeNote)}</p></div>`
          : ""
      }
      <div class="info-block">
        <h4>${t("modal.activeIngredients")}</h4>
        <p>${tr(product.activeIngredients)}</p>
      </div>
      <div class="info-block">
        <h4>${t("modal.usage")}</h4>
        <ol>${steps}</ol>
      </div>
      <div class="info-block">
        <h4>${t("modal.efficacy")}</h4>
        <p>${tr(product.efficacy)}</p>
      </div>
      <div class="tag-row">${renderTags(product.skinTypes)}</div>
    `;
    const photoContainer = document.querySelector("#modal-content .modal-photo-wrap");
    if (photoContainer) wirePhoto(photoContainer);
    el.modal.hidden = false;
  }

  function photoMarkupModal(product) {
    const accent = lineAccents[product.line] || { bg: "#f7f2ea", fg: "#9c6b30" };
    return `
      <div class="modal-photo modal-photo-wrap">
        <img src="${product.image}" alt="${product.name}" hidden />
        <div class="photo-fallback" style="background:${accent.bg};color:${accent.fg}">
          <span class="monogram" style="color:${accent.fg}">${monogram(product.line)}</span>
          <span class="soon-badge" style="color:${accent.fg}">${t("photo.soon")}</span>
        </div>
      </div>
    `;
  }

  function closeModal() {
    el.modal.hidden = true;
    if (location.hash && products.some((p) => p.id === location.hash.slice(1))) {
      history.pushState(null, "", location.pathname + location.search);
    }
  }

  function openProductFromHash() {
    const id = location.hash.slice(1);
    if (!id) return;
    const product = products.find((p) => p.id === id);
    if (product) openModal(product);
  }

  function updateCartBadge() {
    const count = cartCount();
    if (el.cartCount) {
      el.cartCount.textContent = count;
      el.cartCount.hidden = count === 0;
    }
    if (el.cartHeaderTotal) {
      el.cartHeaderTotal.textContent = formatPrice(cartTotal());
      el.cartHeaderTotal.hidden = count === 0;
    }
  }

  function renderCartDrawer() {
    if (!el.cartItems) return;
    const items = getCartItems();
    if (items.length === 0) {
      el.cartItems.innerHTML = `<p class="cart-empty">${t("cart.empty")}</p>`;
    } else {
      el.cartItems.innerHTML = items
        .map((item) => {
          const accent = lineAccent(item.product.line);
          const percent = productDiscountPercent(item.product);
          const unitLabel = item.qty > 1 ? `<span class="cart-line-qty-label">${item.qty} × </span>` : "";
          const priceCell = percent
            ? `<span class="cart-line-price cart-line-price-discounted">
                 ${unitLabel}
                 <span class="cart-line-price-old">${formatPrice(item.product.price * item.qty)}</span>
                 <span class="cart-line-price-new">${formatPrice(discountedPrice(item.product) * item.qty)}</span>
                 <span class="cart-line-promo-tag">-${percent}%</span>
               </span>`
            : `<span class="cart-line-price">${unitLabel}${formatPrice(item.product.price * item.qty)}</span>`;
          return `
            <div class="cart-line">
              <div class="cart-line-photo" style="background:${accent.bg}">
                <img src="${item.product.image}" alt="${item.product.name}" />
              </div>
              <div class="cart-line-body">
                <span class="cart-line-name">${item.product.name}</span>
                ${priceCell}
                <div class="cart-stepper has-qty" data-product-id="${item.product.id}">
                  <button type="button" class="stepper-btn stepper-minus" aria-label="-">−</button>
                  <span class="stepper-qty">${item.qty}</span>
                  <button type="button" class="stepper-btn stepper-plus" aria-label="+">+</button>
                </div>
              </div>
              <button type="button" class="cart-line-remove" data-remove-id="${item.product.id}" aria-label="${t("cart.remove")}">✕</button>
            </div>
          `;
        })
        .join("");
    }
    if (el.cartTotalValue) el.cartTotalValue.textContent = formatPrice(cartTotal());
    if (el.cartWhatsappBtn) el.cartWhatsappBtn.disabled = items.length === 0;
    if (el.promoInput && !el.promoInput.value && isPromoActive()) el.promoInput.value = appliedPromoCode;
    updatePromoMessage(isPromoActive() ? "applied" : null);
  }

  function updatePromoMessage(status) {
    if (!el.promoMessage) return;
    if (status === "applied") {
      el.promoMessage.textContent = t("cart.promoApplied").replace("{percent}", ACTIVE_PROMO.discountPercent).replace("{brand}", brandName(ACTIVE_PROMO.brand));
      el.promoMessage.className = "promo-code-message promo-code-message-ok";
      el.promoMessage.hidden = false;
    } else if (status === "invalid") {
      el.promoMessage.textContent = t("cart.promoInvalid");
      el.promoMessage.className = "promo-code-message promo-code-message-error";
      el.promoMessage.hidden = false;
    } else {
      el.promoMessage.hidden = true;
    }
  }

  function syncCartUI() {
    updateCartBadge();
    document.querySelectorAll(".cart-stepper[data-product-id]").forEach((node) => {
      const id = node.getAttribute("data-product-id");
      const qty = cartQty(id);
      node.classList.toggle("has-qty", qty > 0);
      const qtyEl = node.querySelector(".stepper-qty");
      if (qtyEl) qtyEl.textContent = qty;
    });
    if (el.cartDrawer && !el.cartDrawer.hidden) renderCartDrawer();
  }

  function openCartDrawer() {
    renderCartDrawer();
    el.cartDrawer.hidden = false;
    el.cartToggle.setAttribute("aria-expanded", "true");
  }

  function closeCartDrawer() {
    el.cartDrawer.hidden = true;
    el.cartToggle.setAttribute("aria-expanded", "false");
  }

  function buildWhatsAppMessage() {
    const items = getCartItems();
    const lines = items.map((item, i) => {
      const volume = item.product.volume ? ` (${item.product.volume})` : "";
      const percent = productDiscountPercent(item.product);
      const discountNote = percent ? ` (-${percent}%)` : "";
      return `${i + 1}. ${brandName(item.product.brand)} · ${item.product.name}${volume} x${item.qty} = ${formatPrice(discountedPrice(item.product) * item.qty)}${discountNote}`;
    });
    const promoLine = isPromoActive() ? [`${t("cart.promoLabel")}: ${appliedPromoCode} (-${ACTIVE_PROMO.discountPercent}% ${brandName(ACTIVE_PROMO.brand)})`, ""] : [];
    return [t("cart.waHeader"), "", ...lines, "", ...promoLine, `${t("cart.waTotal")}: ${formatPrice(cartTotal())}`].join("\n");
  }

  function renderInnovations() {
    el.innovationsList.innerHTML = innovations
      .map(
        (item) => `
      <div class="innovation-card">
        <h3>${tr(item.name)}</h3>
        ${item.fullName ? `<p class="fullname">${item.fullName}</p>` : ""}
        <p class="desc">${tr(item.description)}</p>
      </div>
    `
      )
      .join("");
  }

  function render() {
    renderNavQuick();
    renderBrandStrip();
    renderProductGrid(filterProducts());
  }

  el.searchInput.addEventListener("input", (e) => {
    state.query = e.target.value;
    render();
    renderSearchResults(e.target.value);
  });
  el.searchInput.addEventListener("focus", (e) => {
    if (e.target.value.trim()) renderSearchResults(e.target.value);
  });
  document.addEventListener("click", (e) => {
    if (el.searchResults && !el.searchResults.hidden && !e.target.closest(".header-search")) {
      el.searchResults.hidden = true;
    }
  });
  el.modalClose.addEventListener("click", closeModal);
  el.modal.addEventListener("click", (e) => {
    if (e.target === el.modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.modal.hidden) closeModal();
    if (e.key === "Escape" && el.searchResults && !el.searchResults.hidden) {
      el.searchResults.hidden = true;
    }
    if (e.key === "Escape" && el.cartDrawer && !el.cartDrawer.hidden) closeCartDrawer();
  });
  el.langButtons.forEach((btn) => {
    btn.addEventListener("click", () => setLang(btn.getAttribute("data-lang-btn")));
  });

  document.addEventListener("click", (e) => {
    const plusBtn = e.target.closest(".stepper-plus");
    const minusBtn = e.target.closest(".stepper-minus");
    if (plusBtn || minusBtn) {
      const wrap = e.target.closest(".cart-stepper");
      const id = wrap && wrap.getAttribute("data-product-id");
      if (id) changeCartQty(id, plusBtn ? 1 : -1);
      return;
    }
    const removeBtn = e.target.closest(".cart-line-remove");
    if (removeBtn) {
      const id = removeBtn.getAttribute("data-remove-id");
      delete cart[id];
      saveCart();
      syncCartUI();
    }
  });

  if (el.cartToggle) {
    el.cartToggle.addEventListener("click", () => {
      if (el.cartDrawer.hidden) openCartDrawer();
      else closeCartDrawer();
    });
  }
  if (el.cartDrawerBackdrop) el.cartDrawerBackdrop.addEventListener("click", closeCartDrawer);
  if (el.cartDrawerClose) el.cartDrawerClose.addEventListener("click", closeCartDrawer);
  if (el.cartClearBtn) {
    el.cartClearBtn.addEventListener("click", () => {
      cart = {};
      saveCart();
      syncCartUI();
    });
  }
  if (el.cartWhatsappBtn) {
    el.cartWhatsappBtn.addEventListener("click", () => {
      if (getCartItems().length === 0) return;
      const msg = encodeURIComponent(buildWhatsAppMessage());
      window.open(`https://wa.me/77087685329?text=${msg}`, "_blank", "noopener");
    });
  }
  if (el.promoApplyBtn) {
    el.promoApplyBtn.addEventListener("click", () => {
      const result = applyPromoCode(el.promoInput ? el.promoInput.value : "");
      updatePromoMessage(result === "applied" ? "applied" : result === "invalid" ? "invalid" : null);
      if (result === "applied" || result === "empty") {
        renderCartDrawer();
        updateCartBadge();
      }
    });
  }
  if (el.promoInput) {
    el.promoInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") el.promoApplyBtn && el.promoApplyBtn.click();
    });
  }

  if (el.promoPrev) {
    el.promoPrev.addEventListener("click", () => {
      goToPromoSlide(promoIndex - 1);
      startPromoAutoplay();
    });
  }
  if (el.promoNext) {
    el.promoNext.addEventListener("click", () => {
      goToPromoSlide(promoIndex + 1);
      startPromoAutoplay();
    });
  }
  if (el.promoViewport) {
    el.promoViewport.addEventListener("mouseenter", stopPromoAutoplay);
    el.promoViewport.addEventListener("mouseleave", startPromoAutoplay);
  }

  window.addEventListener("popstate", openProductFromHash);
  window.addEventListener("hashchange", openProductFromHash);

  loadCart();
  applyI18n();
  renderInnovations();
  renderPromoSlide();
  startPromoAutoplay();
  render();
  updateCartBadge();
  openProductFromHash();
})();
