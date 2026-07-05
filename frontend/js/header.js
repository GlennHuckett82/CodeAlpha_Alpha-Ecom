/**
 * header.js — Shared header cart-badge manager
 *
 * Import this module as a side-effect in every page entry point so the
 * cart badge initialises from cache and stays in sync with cart mutations:
 *
 *   import './header.js';
 *
 * The badge reads from the localStorage cache synchronously on load (no
 * network request needed), then updates whenever any cartState operation
 * fires the 'cart:updated' CustomEvent on document.
 */

import { getItemCount } from './cartState.js';

// ── DOM ref ────────────────────────────────────────────────────────────────

const cartBadge = document.getElementById('cart-badge');

// ── Badge updater ──────────────────────────────────────────────────────────

/**
 * Sets the visible badge count and updates the accessible aria-label
 * on the cart link so screen readers announce the correct item count.
 * The CSS rule `.cart-badge:empty { display: none }` hides it when n = 0.
 *
 * @param {number} count  Total item quantity across all cart rows
 */
function updateBadge(count) {
  if (!cartBadge) return; // not present on every page (e.g. order-confirmation)
  const n = Math.max(0, count);
  cartBadge.textContent   = n > 0 ? String(n) : '';
  cartBadge.dataset.count = String(n);
  // Update the accessible label on the parent <a> if it carries one,
  // otherwise update the badge span's own label
  const cartLink = cartBadge.closest('.cart-link') ?? cartBadge;
  cartLink.setAttribute(
    'aria-label',
    `Shopping cart, ${n} item${n !== 1 ? 's' : ''}`,
  );
}

// ── Initialise from cache (synchronous, no network) ───────────────────────

updateBadge(getItemCount());

// ── React to cart mutations from any page ─────────────────────────────────

document.addEventListener('cart:updated', (e) => {
  const items = e.detail?.items ?? [];
  const count = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  updateBadge(count);
});
