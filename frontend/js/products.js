/**
 * products.js — Product listing page controller (used by main.js on index.html)
 *
 * Responsibilities:
 *   • Fetch products via api.getProducts() in offset mode (?page=N)
 *   • Render cards by cloning #product-card-template (no innerHTML with user data)
 *   • Show 8 skeleton cards while loading; replace on completion
 *   • Display error/empty states in #listing-status aria-live region
 *   • Wire prev/next pagination, scroll-to-top, URL search-param sync
 *   • Debounced search input (300 ms) and category filter
 */

import api from './api.js';
import { debounce, lazyLoadImages } from './utils.js';
import { addItem } from './cartState.js';

// ── DOM refs ───────────────────────────────────────────────────────────────

const grid           = document.getElementById('product-grid');
const template       = document.getElementById('product-card-template');
const statusEl       = document.getElementById('listing-status');
const prevBtn        = document.getElementById('prev-page');
const nextBtn        = document.getElementById('next-page');
const pageInfoEl     = document.getElementById('page-info');
const searchInput    = document.getElementById('search-input');
const categoryFilter = document.getElementById('category-filter');

// ── State ──────────────────────────────────────────────────────────────────

let currentPage     = 1;
let currentSearch   = '';
let currentCategory = '';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Currency formatter (GBP). Swap 'GBP'/'en-GB' to localise. */
const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

function formatPrice(value) {
  return currency.format(Number(value));
}

// ── ARIA live region ───────────────────────────────────────────────────────

function announce(message) {
  // Remove sr-only while there is content so sighted users also see errors
  if (message) {
    statusEl.classList.remove('sr-only');
  } else {
    statusEl.classList.add('sr-only');
  }
  statusEl.textContent = message;
}

// ── Skeleton cards ─────────────────────────────────────────────────────────

function createSkeletonCard() {
  const li = document.createElement('li');
  li.className = 'product-card-wrapper';
  li.setAttribute('aria-hidden', 'true'); // decorative placeholder

  const card = document.createElement('div');
  card.className = 'product-card skeleton-card';

  const imgWrap = document.createElement('div');
  imgWrap.className = 'product-card__image-wrap skeleton-card__image skeleton';

  const body = document.createElement('div');
  body.className = 'product-card__body skeleton-card__body';

  // Three text-line placeholders with varying widths to look natural
  [
    'skeleton-text skeleton-text--lg skeleton-text--w75',
    'skeleton-text skeleton-text--sm skeleton-text--w50',
    'skeleton-text skeleton-text--w33',
  ].forEach((cls) => {
    const div = document.createElement('div');
    div.className = `skeleton ${cls}`;
    body.appendChild(div);
  });

  card.appendChild(imgWrap);
  card.appendChild(body);
  li.appendChild(card);
  return li;
}

function showSkeletons(count = 8) {
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) frag.appendChild(createSkeletonCard());
  grid.appendChild(frag);
  announce('Loading products…');
}

// ── Error / empty states ───────────────────────────────────────────────────

function showError(message) {
  grid.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'error-message';
  div.textContent = message; // textContent — never innerHTML
  grid.appendChild(div);
  announce(`Error: ${message}`);
}

function showEmptyState() {
  const li = document.createElement('li');
  li.style.gridColumn = '1 / -1'; // span full grid width

  const section = document.createElement('section');
  section.className = 'empty-state';

  const icon = document.createElement('div');
  icon.className = 'empty-state__icon';
  icon.setAttribute('data-icon', '🔍');
  icon.setAttribute('aria-hidden', 'true');

  const title = document.createElement('p');
  title.className = 'empty-state__title';
  title.textContent = 'No products found';

  const msg = document.createElement('p');
  msg.className = 'empty-state__message';
  msg.textContent = 'Try adjusting your search or removing the category filter.';

  section.appendChild(icon);
  section.appendChild(title);
  section.appendChild(msg);
  li.appendChild(section);
  grid.appendChild(li);

  announce('No products found.');
}

// ── Card rendering ─────────────────────────────────────────────────────────

/**
 * Clones the product card template and fills in product data.
 * All user-supplied values are written via .textContent or attribute setters —
 * never via innerHTML — to prevent XSS.
 *
 * @param {object} product - Product document from the API
 * @returns {DocumentFragment}
 */
function renderCard(product) {
  const frag    = template.content.cloneNode(true);
  const article = frag.querySelector('.product-card');
  const img     = frag.querySelector('img');
  const nameEl  = frag.querySelector('.product-card__name');
  const catEl   = frag.querySelector('.product-card__category');
  const priceEl = frag.querySelector('.product-card__price');
  const link    = frag.querySelector('.product-card__details-link');
  const addBtn  = frag.querySelector('.add-to-cart-btn');

  // Identifiers used by event delegation (add-to-cart wired in cartState)
  article.dataset.productId = product._id;
  addBtn.dataset.productId  = product._id;

  // Image — safe attribute assignment.
  // data-src withholds the real URL from the browser until lazyLoadImages()
  // promotes it (either immediately for native-lazy browsers, or via
  // IntersectionObserver for older Safari / non-supporting environments).
  img.alt      = product.name;   // set alt before src to avoid screen-reader flash
  img.loading  = 'lazy';         // native hint; also signals Tier 1 in lazyLoadImages
  img.decoding = 'async';        // decode off the main thread
  const imgUrl = product.imageUrl || '';
  img.setAttribute('data-src',    imgUrl);
  img.setAttribute('data-srcset', `${imgUrl} 400w, ${imgUrl} 800w`);
  img.setAttribute('sizes',       '(max-width: 600px) 100vw, 300px');
  // Add .loaded once the image has painted so CSS can transition the blur out
  img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
  if (img.complete && img.naturalWidth) img.classList.add('loaded'); // already cached

  // Text content — textContent prevents any HTML injection
  nameEl.textContent  = product.name;
  catEl.textContent   = product.category;
  priceEl.textContent = formatPrice(product.price);

  // Links & accessible label
  link.href = `product.html?id=${encodeURIComponent(product._id)}`;
  addBtn.setAttribute('aria-label', `Add ${product.name} to cart`);

  return frag;
}

// ── Pagination UI ──────────────────────────────────────────────────────────

function setPaginationDisabled(disabled) {
  prevBtn.disabled = disabled;
  nextBtn.disabled = disabled;
}

function updatePagination(pagination) {
  if (!pagination || pagination.total === 0) {
    setPaginationDisabled(true);
    pageInfoEl.textContent = '';
    return;
  }
  prevBtn.disabled  = !pagination.hasPrevPage;
  nextBtn.disabled  = !pagination.hasNextPage;
  pageInfoEl.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;
}

// ── URL synchronisation ────────────────────────────────────────────────────

function syncUrl() {
  const url = new URL(window.location.href);
  currentPage > 1
    ? url.searchParams.set('page', currentPage)
    : url.searchParams.delete('page');
  currentSearch
    ? url.searchParams.set('search', currentSearch)
    : url.searchParams.delete('search');
  currentCategory
    ? url.searchParams.set('category', currentCategory)
    : url.searchParams.delete('category');
  // pushState so browser back/forward navigation works
  window.history.pushState({ page: currentPage, search: currentSearch, category: currentCategory }, '', url.toString());
}

function readUrlParams() {
  const params    = new URLSearchParams(window.location.search);
  currentPage     = parseInt(params.get('page'), 10) || 1;
  currentSearch   = params.get('search')   ?? '';
  currentCategory = params.get('category') ?? '';

  // Reflect URL state into the filter controls
  if (searchInput)    searchInput.value    = currentSearch;
  if (categoryFilter) categoryFilter.value = currentCategory;
}

// ── Fetch & render ─────────────────────────────────────────────────────────

async function fetchAndRender() {
  showSkeletons(8);
  setPaginationDisabled(true);

  try {
    const params = { page: currentPage, limit: 12 };
    if (currentSearch)   params.search   = currentSearch;
    if (currentCategory) params.category = currentCategory;

    const result   = await api.getProducts(params);
    const products = result.data ?? [];

    grid.innerHTML = ''; // clear skeletons

    if (products.length === 0) {
      showEmptyState();
      updatePagination(null);
    } else {
      const frag = document.createDocumentFragment();
      products.forEach((p) => frag.appendChild(renderCard(p)));
      grid.appendChild(frag);
      lazyLoadImages(grid); // promote data-src → src (deferred via IO for older Safari)
      updatePagination(result.pagination);
      announce(''); // clear status — content is now visible
    }

    syncUrl();
  } catch (err) {
    showError(err.message || 'Failed to load products. Please try again.');
    setPaginationDisabled(true);
  }
}

// ── Event wiring ───────────────────────────────────────────────────────────

function wirePagination() {
  prevBtn.addEventListener('click', () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    fetchAndRender();
  });

  nextBtn.addEventListener('click', () => {
    currentPage += 1;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    fetchAndRender();
  });
}

function wireSearch() {
  // ── Clear (×) button ────────────────────────────────────────────
  const clearBtn = document.createElement('button');
  clearBtn.type      = 'button';
  clearBtn.className = 'btn btn-secondary search-clear-btn';
  clearBtn.setAttribute('aria-label', 'Clear search');
  clearBtn.textContent = '×'; // × multiplication sign — visually an ×
  clearBtn.hidden = !searchInput.value; // pre-show if URL already has a query
  searchInput.insertAdjacentElement('afterend', clearBtn);

  function updateClearVisibility() {
    clearBtn.hidden = !searchInput.value;
  }

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.hidden   = true;
    currentSearch     = '';
    currentPage       = 1;
    fetchAndRender();
    searchInput.focus(); // return focus to the input for keyboard users
  });

  // ── Debounced search handler ─────────────────────────────────
  const debouncedFetch = debounce((value) => {
    const trimmed = value.trim();
    // Require at least 2 chars to trigger a search; 0 chars clears the search
    if (trimmed.length === 1) return; // wait for more input
    currentSearch = trimmed;
    currentPage   = 1;
    fetchAndRender();
  }, 300);

  searchInput.addEventListener('input', (e) => {
    updateClearVisibility();
    debouncedFetch(e.target.value);
  });
}

function wireCategory() {
  categoryFilter.addEventListener('change', (e) => {
    currentCategory = e.target.value;
    currentPage     = 1; // reset to page 1 on filter change
    fetchAndRender();
  });
}

// ── Public init ────────────────────────────────────────────────────────────

// ── Add to cart (event delegation on the grid) ────────────────────────────

function wireAddToCart() {
  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('.add-to-cart-btn');
    if (!btn) return;

    const { productId } = btn.dataset;
    if (!productId) return;

    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Adding…';

    try {
      await addItem(productId);
      btn.textContent = 'Added ✓';
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
      }, 1500);
    } catch {
      btn.textContent = 'Error';
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
      }, 1500);
    }
  });
}

export function initProductListing() {
  // Guard: only run on pages that have the product grid
  if (!grid || !template) return;

  readUrlParams();
  wirePagination();
  wireSearch();
  wireCategory();
  wireAddToCart();

  // Restore state on browser back/forward navigation
  window.addEventListener('popstate', () => {
    readUrlParams();
    fetchAndRender();
  });

  fetchAndRender();
}
