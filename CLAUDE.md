# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CosmoDerm (cosmoderm.kz) — a bilingual (RU/KZ) dermocosmetics product catalog/online store. It is a **zero-build, dependency-free static site**: plain HTML/CSS/vanilla JS, no `package.json`, no bundler, no framework. Deployed to Vercel as static files (`vercel.json` has no `buildCommand`/`framework` — it only sets security response headers).

## Running locally

There is no dev server or build step. Serve the directory as static files and open it, e.g.:

```
npx serve .
```

or simply open `index.html` directly in a browser. There is no test suite, linter, or build command in this repo — do not invent `npm run` commands.

## Architecture

Everything is wired together by plain `<script>` tags loaded in order in `index.html`:

1. **`assets/i18n.js`** — defines `window.UI_I18N`, a `{ ru: {...}, kz: {...} }` dictionary of UI strings keyed by dotted keys (e.g. `"cart.title"`). Static markup uses `data-i18n`, `data-i18n-placeholder`, `data-i18n-aria` attributes on elements; `app.js`'s `applyI18n()` walks the DOM and fills them in from this dictionary.
2. **`assets/data.js`** — defines `window.CATALOG_DATA`: `brands`, `categories`, `skinTypes`, `lines`, `products` (~215 entries), and `innovations` (patented ingredient/technology blurbs). Product copy fields (`name`/`description`/`activeIngredients`/`efficacy`/`skinTypeNote`/`usageSteps`) are bilingual objects `{ ru, kz }`; many `usageSteps` are deduplicated via the shared `S` map of reusable instruction sequences (e.g. `S.cleanseRinse`, `S.sunscreen`) defined at the top of the file. This file is large (~300KB+) — when editing, target the specific product/brand block with search rather than reading the whole file.
3. **`assets/app.js`** — a single IIFE holding all app state and rendering logic: filtering/search, product grid grouped by brand→line, the brand marquee strip, the autoplaying hero promo slider, the modal product detail view, and the cart. No virtual DOM — rendering functions rebuild `innerHTML` directly.

Key `app.js` concepts:
- `state` (lang/brand/category/query) and `cart` (`{ productId: qty }`) are the only mutable app state; `cart` and the chosen `lang` persist to `localStorage` (`cosmoderm-cart`, `cosmoderm-lang`).
- `tr(field)` / `trList(field)` resolve a bilingual data field to the current `state.lang` (falls back to `ru`).
- `lineAccents` and `brandRingColors`/`brandLogos` are presentation-only maps keyed by product-line/brand id — a new line or brand needs an entry here (or it falls back to a default tan accent / initials avatar) as well as a matching id in `CATALOG_DATA` in `data.js`.
- Product photos degrade gracefully: `photoMarkup()` renders both an `<img>` and a colored monogram fallback; `wirePhoto()` swaps to the real photo on `load` and keeps the fallback showing on `error`. `MISSING_PHOTOS` explicitly excludes specific products (by image filename) from the homepage promo rotation.
- Checkout is not transactional — "ordering" builds a formatted WhatsApp message from cart contents and opens `wa.me` with it (`buildWhatsAppMessage`, wired to the number in `cartWhatsappBtn`'s handler). There is no backend, payment processing, or order storage.

Every product has a deep link: `openModal()` pushes `#<product-id>` to the URL (`history.pushState`, no page reload); `closeModal()` clears it; on load and on `hashchange`/`popstate`, `openProductFromHash()` opens the matching product's modal if the hash matches a product id. This is what makes `https://www.cosmoderm.kz/#<id>` (used throughout `products.json` and the embedded JSON-LD) an actual working link rather than just the homepage.

## SEO / AEO (AI-agent discoverability)

- `scripts/generate-seo-feed.js` is the **single source of truth generator** — reads `assets/data.js` and produces `products.json` (full bilingual machine-readable catalog feed, at site root) and the embedded JSON-LD (`Organization` + `WebSite` + `ItemList` of `Product`/`Offer` nodes) that it splices into `index.html` between the `<!-- PRODUCT_LD_START -->` / `<!-- PRODUCT_LD_END -->` markers, plus a copy at `assets/product-ld.json`.
- **Run it manually after any product/price/brand change in `assets/data.js`**: `node scripts/generate-seo-feed.js`. This does not violate the zero-build rule — it's not part of serving/deploying the site (Vercel still just serves static files), it's a content-generation step you run once, the same way `data.js` itself is hand-maintained. Never hand-edit the JSON-LD block in `index.html` or `products.json`/`assets/product-ld.json` directly — edit `assets/data.js` and regenerate.
- `llms.txt` (site root) is a hand-written summary for LLMs/AI agents — update it if the brand list, order flow, or `products.json` shape changes. It correctly does NOT claim Korean cosmetics are in stock — the catalog is French/European pharmacy brands only (see `data.js` -> `brands`); a "Korean cosmetics coming soon" teaser exists only as UI copy (`trust.badge4` in `i18n.js`) and in `llms.txt`'s prose, explicitly marked as upcoming/no date — never add it to `products.json` or the JSON-LD `Product` list until real SKUs exist, since that would be fabricated commerce data.
- `robots.txt` explicitly allow-lists major AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.) in addition to the blanket `Allow: /`.
- There is no real agentic-checkout integration (e.g. OpenAI's Agentic Commerce Protocol) — that would require a real payment/order backend, which this static WhatsApp-order site doesn't have. The SEO/AEO work here maximizes being accurately found and cited by AI agents/shopping assistants, not autonomous checkout.

Product images live in `/products/*.jpg`; brand logos in `/assets/brands/*`. Referencing a product's `image` path that has no file on disk is expected to fall back to the monogram — it doesn't need to be treated as a bug.

## Content conventions

- All user-facing copy is bilingual: any new/edited product or UI string needs both `ru` and `kz` values. A code comment in `data.js` flags that the existing `kz` copy is first-pass and may need native-speaker review — don't treat differences in register between `ru` and `kz` text as bugs to silently "fix" by guessing.
- Product `id`s follow `brand-line-product-slug` (e.g. `bioderma-sebium-gel-moussant`); keep this pattern for new products since nothing enforces it programmatically.
- Prices are integers in KZT with no decimal places; `formatPrice()` renders them with `₸`.
