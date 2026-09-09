import brands from './data/brands.json';
import taxonomy from './data/taxonomy.json';
import products from './data/products.json';
import innovations from './data/innovations.json';
import { state } from './js/state.js';
import { filterProducts } from './js/filters.js';
import {
  renderBrandTabs,
  renderCategoryFilter,
  renderLineFilter,
  renderSkinTypeFilter,
  renderProducts,
  renderComingSoon,
  openProductModal,
  closeProductModal,
  renderInnovations,
} from './js/render.js';

const els = {
  brandTabs: document.getElementById('brand-tabs'),
  categoryFilter: document.getElementById('category-filter'),
  lineFilter: document.getElementById('line-filter'),
  skinTypeFilter: document.getElementById('skintype-filter'),
  searchInput: document.getElementById('search-input'),
  filtersPanel: document.getElementById('filters-panel'),
  productGrid: document.getElementById('product-grid'),
  comingSoon: document.getElementById('coming-soon'),
  modal: document.getElementById('product-modal'),
  modalClose: document.getElementById('modal-close'),
  innovationsList: document.getElementById('innovations-list'),
};

const categoryLabels = Object.fromEntries(taxonomy.categories.map((c) => [c.id, c.label]));
const skinTypeLabels = Object.fromEntries(taxonomy.skinTypes.map((s) => [s.id, s.label]));
const lineLabels = Object.fromEntries(taxonomy.lines.map((l) => [l.id, l.label]));

renderInnovations(els.innovationsList, innovations);

function update() {
  renderBrandTabs(els.brandTabs, brands, state, (brandId) => {
    state.brand = brandId;
    update();
  });

  const activeBrand = brands.find((b) => b.id === state.brand);

  if (activeBrand.status !== 'active') {
    els.filtersPanel.classList.add('hidden');
    els.productGrid.classList.add('hidden');
    els.comingSoon.classList.remove('hidden');
    renderComingSoon(els.comingSoon, activeBrand);
    return;
  }

  els.filtersPanel.classList.remove('hidden');
  els.productGrid.classList.remove('hidden');
  els.comingSoon.classList.add('hidden');

  renderCategoryFilter(els.categoryFilter, taxonomy.categories, state, update);
  renderLineFilter(els.lineFilter, taxonomy.lines, state, update);
  renderSkinTypeFilter(els.skinTypeFilter, taxonomy.skinTypes, state, update);

  const filtered = filterProducts(products, state);
  renderProducts(els.productGrid, filtered, categoryLabels, skinTypeLabels, lineLabels, (product) => {
    openProductModal(els.modal, product, categoryLabels, skinTypeLabels, lineLabels);
  });
}

els.searchInput.addEventListener('input', (e) => {
  state.query = e.target.value;
  update();
});

els.modalClose.addEventListener('click', () => closeProductModal(els.modal));
els.modal.addEventListener('click', (e) => {
  if (e.target === els.modal) closeProductModal(els.modal);
});

update();
