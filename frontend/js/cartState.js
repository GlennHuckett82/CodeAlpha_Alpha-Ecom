/**
 * cartState.js — Cart state manager
 *
 * Single source of truth for all cart operations.
 * Keeps a localStorage cache so pages stay responsive; every mutation
 * syncs to the backend and dispatches a 'cart:updated' CustomEvent on
 * `document` so any listener (e.g. header badge, cart page) can react.
 *
 * LocalStorage keys:
 *   alpha_session_id   — persistent anonymous session UUID
 *   alpha_cart_cache   — last-known cart JSON from the API
 */

import api from './api.js';

const SESSION_KEY = 'alpha_session_id';
const CART_KEY    = 'alpha_cart_cache';

// ── Session ID ─────────────────────────────────────────────────────────────

/**
 * Returns the persisted session UUID, generating and storing one if absent.
 * Uses crypto.randomUUID() — available in all modern browsers and secure contexts.
 * @returns {string}
 */
export function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

// ── Cache helpers ──────────────────────────────────────────────────────────

function readCache() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Corrupt JSON — treat as empty
    return null;
  }
}

function writeCache(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    // localStorage quota exceeded or unavailable — fail silently
  }
}

function clearCacheEntry() {
  localStorage.removeItem(CART_KEY);
}

// ── Event dispatch ─────────────────────────────────────────────────────────

/**
 * Fires a 'cart:updated' CustomEvent carrying the latest cart object.
 * Listeners receive the cart via e.detail:
 *   document.addEventListener('cart:updated', (e) => console.log(e.detail))
 * @param {{ items: Array }} cart
 */
function dispatch(cart) {
  document.dispatchEvent(
    new CustomEvent('cart:updated', { bubbles: false, detail: cart }),
  );
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns the cart from localStorage cache when available,
 * falling back to a live API call on first load or cache miss.
 * Never throws for an empty / non-existent cart — returns { items: [] }.
 * @returns {Promise<{ items: Array }>}
 */
export async function getCart() {
  const cached = readCache();
  if (cached) return cached;

  try {
    const result = await api.getCart(getSessionId());
    const cart   = result.data ?? result;
    writeCache(cart);
    return cart;
  } catch (err) {
    if (err.status === 404) {
      const empty = { items: [] };
      writeCache(empty);
      return empty;
    }
    throw err;
  }
}

/**
 * Adds `quantity` of `productId` to the cart (or increments if already present).
 * @param {string} productId
 * @param {number} [quantity=1]
 * @returns {Promise<{ items: Array }>}
 */
export async function addItem(productId, quantity = 1) {
  const result = await api.addToCart({
    sessionId: getSessionId(),
    productId,
    quantity,
  });
  const cart = result.data ?? result;
  writeCache(cart);
  dispatch(cart);
  return cart;
}

/**
 * Sets the quantity of an existing cart item.
 * Delegates to removeItem() when quantity <= 0.
 * @param {string} productId
 * @param {number} quantity
 * @returns {Promise<{ items: Array }>}
 */
export async function updateItem(productId, quantity) {
  if (quantity <= 0) return removeItem(productId);
  const result = await api.updateCartItem({
    sessionId: getSessionId(),
    productId,
    quantity,
  });
  const cart = result.data ?? result;
  writeCache(cart);
  dispatch(cart);
  return cart;
}

/**
 * Removes a single product from the cart entirely.
 * @param {string} productId
 * @returns {Promise<{ items: Array }>}
 */
export async function removeItem(productId) {
  const result = await api.removeCartItem({
    sessionId: getSessionId(),
    productId,
  });
  const cart = result.data ?? result;
  writeCache(cart);
  dispatch(cart);
  return cart;
}

/**
 * Deletes the entire cart for this session.
 * @returns {Promise<{ items: [] }>}
 */
export async function clearCart() {
  await api.clearCart(getSessionId());
  clearCacheEntry();
  const empty = { items: [] };
  dispatch(empty);
  return empty;
}

/**
 * Returns the total number of items (sum of all quantities) from the cache.
 * Synchronous — reads only from localStorage, never touches the network.
 * @returns {number}
 */
export function getItemCount() {
  const cart = readCache();
  if (!cart?.items?.length) return 0;
  return cart.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
}
