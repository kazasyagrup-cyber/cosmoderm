export function renderBrandTabs(container, brands, state, onSelect) {
  container.innerHTML = '';
  brands.forEach((brand) => {
    const isActive = brand.id === state.brand;
    const isComingSoon = brand.status !== 'active';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = isComingSoon ? `${brand.name} · Скоро в продаже` : brand.name;
    btn.className = [
      'px-4 py-2 rounded-full text-sm font-medium border transition whitespace-nowrap shrink-0',
      isActive
        ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
        : isComingSoon
          ? 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
          : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-600',
    ].join(' ');
    btn.addEventListener('click', () => onSelect(brand.id));
    container.appendChild(btn);
  });
}

function renderChipGroup(container, options, state, stateKey, onChange) {
  container.innerHTML = '';
  options.forEach((opt) => {
    const isActive = state[stateKey] === opt.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.label;
    btn.className = [
      'px-3 py-1.5 rounded-lg text-sm border transition',
      isActive
        ? 'bg-emerald-500 text-white border-emerald-500'
        : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300',
    ].join(' ');
    btn.addEventListener('click', () => {
      state[stateKey] = opt.id;
      onChange();
    });
    container.appendChild(btn);
  });
}

export function renderCategoryFilter(container, categories, state, onChange) {
  renderChipGroup(container, [{ id: 'all', label: 'Все' }, ...categories], state, 'category', onChange);
}

export function renderLineFilter(container, lines, state, onChange) {
  renderChipGroup(container, [{ id: 'all', label: 'Все' }, ...lines], state, 'line', onChange);
}

export function renderSkinTypeFilter(container, skinTypes, state, onChange) {
  renderChipGroup(container, [{ id: 'all', label: 'Все' }, ...skinTypes], state, 'skinType', onChange);
}

function skinTypeChips(skinTypes, skinTypeLabels) {
  return skinTypes
    .map(
      (id) =>
        `<span class="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100">${skinTypeLabels[id] ?? id}</span>`,
    )
    .join('');
}

export function renderProducts(container, products, categoryLabels, skinTypeLabels, lineLabels, onOpenDetails) {
  container.innerHTML = '';

  if (products.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'col-span-full text-center text-slate-400 py-16';
    empty.textContent = 'По заданным критериям товары не найдены.';
    container.appendChild(empty);
    return;
  }

  products.forEach((product) => {
    const card = document.createElement('article');
    card.className =
      'bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition overflow-hidden flex flex-col';
    card.innerHTML = `
      <div class="h-44 bg-gradient-to-br from-sky-50 to-emerald-50 flex items-center justify-center">
        <img src="${product.image}" alt="${product.name}" class="max-h-32 object-contain"
             onerror="this.onerror=null;this.src='/placeholder.svg'" />
      </div>
      <div class="p-4 flex flex-col gap-2 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-emerald-600 uppercase tracking-wide">${categoryLabels[product.category] ?? product.category}</span>
          <span class="text-[11px] text-slate-400">· ${lineLabels[product.line] ?? product.line}</span>
        </div>
        <h3 class="font-semibold text-slate-800 leading-snug">${product.name}</h3>
        <p class="text-sm text-slate-500 line-clamp-3">${product.description}</p>
        <div class="flex flex-wrap gap-1 mt-1">${skinTypeChips(product.skinTypes, skinTypeLabels)}</div>
        <button type="button" class="details-btn mt-auto pt-3 text-sm font-medium text-sky-600 hover:text-sky-700 text-left">
          Подробнее →
        </button>
      </div>
    `;
    card.querySelector('.details-btn').addEventListener('click', () => onOpenDetails(product));
    container.appendChild(card);
  });
}

export function renderComingSoon(container, brand) {
  container.innerHTML = `
    <div class="flex flex-col items-center justify-center text-center py-24 px-6">
      <div class="w-16 h-16 rounded-full bg-sky-50 text-sky-500 flex items-center justify-center text-2xl mb-4">✦</div>
      <h2 class="text-xl font-semibold text-slate-800 mb-2">${brand.name} · Скоро в продаже</h2>
      <p class="text-slate-500 max-w-md mx-auto">Мы готовим каталог товаров ${brand.name}. Пока доступны только товары Bioderma.</p>
    </div>
  `;
}

export function openProductModal(modalEl, product, categoryLabels, skinTypeLabels, lineLabels) {
  const usageList = (product.usageSteps ?? [])
    .map((step) => `<li>${step}</li>`)
    .join('');

  modalEl.querySelector('#modal-content').innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-xs font-semibold text-emerald-600 uppercase tracking-wide">${categoryLabels[product.category] ?? product.category}</span>
      <span class="text-xs text-slate-400">· ${lineLabels[product.line] ?? product.line}</span>
    </div>
    <h2 class="text-xl font-semibold text-slate-800 mt-1 mb-4">${product.name}</h2>
    <div class="h-40 bg-gradient-to-br from-sky-50 to-emerald-50 rounded-xl flex items-center justify-center mb-4">
      <img src="${product.image}" alt="${product.name}" class="max-h-28 object-contain"
           onerror="this.onerror=null;this.src='/placeholder.svg'" />
    </div>
    <div class="space-y-3 text-sm text-slate-600">
      <div>
        <h4 class="font-semibold text-slate-700 mb-1">Описание</h4>
        <p>${product.description}</p>
      </div>
      ${
        product.skinTypeNote
          ? `<div class="bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
        <h4 class="font-semibold text-slate-700 mb-1">Кому подходит</h4>
        <p>${product.skinTypeNote}</p>
      </div>`
          : ''
      }
      <div>
        <h4 class="font-semibold text-slate-700 mb-1">Активные компоненты и патенты</h4>
        <p>${product.activeIngredients}</p>
      </div>
      <div>
        <h4 class="font-semibold text-slate-700 mb-1">Способ применения</h4>
        <ol class="list-decimal list-inside space-y-0.5">${usageList}</ol>
      </div>
      <div>
        <h4 class="font-semibold text-slate-700 mb-1">Результаты исследований / Эффективность</h4>
        <p>${product.efficacy}</p>
      </div>
      <div class="flex flex-wrap gap-1 pt-2">${skinTypeChips(product.skinTypes, skinTypeLabels)}</div>
    </div>
  `;
  modalEl.classList.remove('hidden');
}

export function closeProductModal(modalEl) {
  modalEl.classList.add('hidden');
}

export function renderInnovations(container, innovations) {
  container.innerHTML = innovations
    .map(
      (item) => `
      <div class="bg-white border border-slate-200 rounded-2xl p-5">
        <h3 class="font-semibold text-slate-800">${item.name}</h3>
        ${item.fullName ? `<p class="text-xs text-slate-400 mb-2">${item.fullName}</p>` : ''}
        <p class="text-sm text-slate-500">${item.description}</p>
      </div>
    `,
    )
    .join('');
}
