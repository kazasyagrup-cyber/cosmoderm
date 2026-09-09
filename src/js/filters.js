export function filterProducts(products, state) {
  const query = state.query.trim().toLowerCase();

  return products.filter((product) => {
    if (product.brand !== state.brand) return false;
    if (state.category !== 'all' && product.category !== state.category) return false;
    if (state.line !== 'all' && product.line !== state.line) return false;
    if (state.skinType !== 'all' && !product.skinTypes.includes(state.skinType)) return false;
    if (query) {
      const haystack = `${product.name} ${product.description}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}
