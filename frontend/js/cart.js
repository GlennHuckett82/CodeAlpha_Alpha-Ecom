/**
 * cart.js — Cart page controller (cart.html)
 *
 * Responsibilities:
 *   • Fetch cart via cartState.getCart(), render into #cart-items using template
 *   • Quantity input: debounced 400ms cartState.updateItem(), update totals in-place
 *   • Remove button: cartState.removeItem(), CSS slide-out, DOM removal
 *   • Running subtotal recalculated after every change
 *   • Empty-cart state with Continue Shopping link
 *   • Checkout button reveals hidden #order-form-container with smooth scroll
 *   • 'cart:updated' listener re-syncs if another tab mutates the cart
 */

import { getCart, updateItem, removeItem, getSessionId } from './cartState.js';
import './header.js'; // badge side-effect

// ── DOM refs ───────────────────────────────────────────────────────────────

const listEl      = document.getElementById('cart-items');
const template    = document.getElementById('cart-item-template');
const statusEl    = document.getElementById('cart-status');
const subtotalEl  = document.getElementById('cart-subtotal');
const checkoutBtn = document.getElementById('checkout-btn');
const formAside   = document.getElementById('order-form-container');
const summaryEl   = document.getElementById('cart-summary');

if (!listEl) throw new Error('cart.js loaded on wrong page');

// ── Helpers ─────────────────────────────────────────────────────────────

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function announce(msg) {
  statusEl.textContent = msg;
}

// ── Running total ───────────────────────────────────────────────────────────

/**
 * Reads current qty + unit price from every rendered row and updates
 * the subtotal display. Called after every mutation without re-rendering
 * the whole list, so focus is never lost.
 */
function recalcSubtotal() {
  let total = 0;
  listEl.querySelectorAll('.cart-item').forEach((li) => {
    const qty   = parseInt(li.querySelector('.cart-item__qty').value, 10) || 0;
    const price = parseFloat(li.dataset.unitPrice) || 0;
    const sub   = qty * price;
    total += sub;
    li.querySelector('.cart-item__subtotal').textContent = currency.format(sub);
  });
  subtotalEl.textContent = currency.format(total);
}

// ── Empty state ────────────────────────────────────────────────────────────

function showEmptyCart() {
  listEl.innerHTML = '';
  summaryEl.hidden = true;

  const section = document.createElement('section');
  section.className = 'empty-state';

  const icon = document.createElement('div');
  icon.className = 'empty-state__icon';
  icon.setAttribute('data-icon', '🛒');
  icon.setAttribute('aria-hidden', 'true');

  const title = document.createElement('p');
  title.className = 'empty-state__title';
  title.textContent = 'Your cart is empty';

  const link = document.createElement('a');
  link.href = 'index.html';
  link.className = 'btn btn-primary';
  link.textContent = 'Continue Shopping';

  section.appendChild(icon);
  section.appendChild(title);
  section.appendChild(link);
  listEl.appendChild(section);

  announce('Your cart is empty.');
}

// ── Item row rendering ──────────────────────────────────────────────────────────

/** Counter used to give each row's qty input a unique id for the label. */
let rowCounter = 0;

/**
 * Clones the template and fills one cart item row.
 * All user data written via textContent / attribute setters (no innerHTML).
 * @param {{ productId: string, name: string, price: number, quantity: number }} item
 * @returns {HTMLElement} The <li> element
 */
function buildRow(item) {
  const frag   = template.content.cloneNode(true);
  const li     = frag.querySelector('.cart-item');
  const nameEl = frag.querySelector('.cart-item__name');
  const label  = frag.querySelector('.cart-item__qty-label');
  const qtyEl  = frag.querySelector('.cart-item__qty');
  const unitEl = frag.querySelector('.cart-item__unit-price');
  const subEl  = frag.querySelector('.cart-item__subtotal');
  const removeBtn = frag.querySelector('.cart-item__remove');

  const uid = `cart-qty-${++rowCounter}`;

  // Store data on the row for recalcSubtotal
  li.dataset.productId = item.productId ?? item._id ?? '';
  li.dataset.unitPrice = String(item.price ?? 0);

  // Text — textContent only
  nameEl.textContent  = item.name;
  unitEl.textContent  = currency.format(Number(item.price));
  subEl.textContent   = currency.format(Number(item.price) * item.quantity);

  // Quantity input
  qtyEl.id    = uid;
  qtyEl.value = String(item.quantity);
  qtyEl.min   = '1';
  qtyEl.setAttribute('aria-label', `Quantity for ${item.name}`);

  // Wire the label's `for` to the input id
  label.setAttribute('for', uid);

  // Accessible remove button label includes product name
  removeBtn.setAttribute('aria-label', `Remove ${item.name}`);
  removeBtn.dataset.productId = li.dataset.productId;

  return li;
}

// ── Full list render ───────────────────────────────────────────────────────────

/**
 * Clears the list and renders all items from the cart.
 * Only called on initial load and full re-sync (other-tab update).
 * In-session mutations only update existing rows to preserve focus.
 */
function renderCart(cart) {
  const items = cart?.items ?? [];

  if (items.length === 0) {
    showEmptyCart();
    return;
  }

  summaryEl.hidden = false;
  listEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  items.forEach((item) => frag.appendChild(buildRow(item)));
  listEl.appendChild(frag);
  recalcSubtotal();
  announce('');
}

// ── Quantity update (debounced, in-place) ───────────────────────────────

const handleQtyChange = debounce(async (li, productId, newQty) => {
  const qtyEl = li.querySelector('.cart-item__qty');
  qtyEl.disabled = true;
  try {
    await updateItem(productId, newQty);
    // cartState fires 'cart:updated', but we update totals directly here
    // to avoid a full re-render that would reset focus.
    li.dataset.unitPrice = String(parseFloat(li.dataset.unitPrice));
    recalcSubtotal();
  } catch (err) {
    announce(`Could not update quantity: ${err.message}`);
    // Revert to last valid value stored in data attribute
    qtyEl.value = qtyEl.dataset.lastValid ?? qtyEl.value;
  } finally {
    qtyEl.disabled = false;
  }
}, 400);

// ── Remove item (animate then detach) ───────────────────────────────────

async function handleRemove(li, productId) {
  // Slide-out via CSS: add class, wait for transition, then remove from DOM
  li.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
  li.style.opacity    = '0';
  li.style.transform  = 'translateX(2rem)';

  // Disable button to prevent double-click
  const btn = li.querySelector('.cart-item__remove');
  if (btn) btn.disabled = true;

  try {
    await removeItem(productId);
  } catch (err) {
    // Restore row on failure
    li.style.opacity   = '1';
    li.style.transform = 'none';
    if (btn) btn.disabled = false;
    announce(`Could not remove item: ${err.message}`);
    return;
  }

  // Wait for CSS transition before removing from DOM
  li.addEventListener('transitionend', () => {
    li.remove();
    // Check if list is now empty
    if (listEl.querySelectorAll('.cart-item').length === 0) {
      showEmptyCart();
    } else {
      recalcSubtotal();
    }
  }, { once: true });
}

// ── Event delegation on #cart-items ─────────────────────────────────────

listEl.addEventListener('change', (e) => {
  const input = e.target.closest('.cart-item__qty');
  if (!input) return;
  const li        = input.closest('.cart-item');
  const productId = li?.dataset.productId;
  if (!productId) return;

  const newQty = parseInt(input.value, 10);
  if (!Number.isInteger(newQty) || newQty < 1) {
    input.value = input.dataset.lastValid ?? '1';
    return;
  }
  input.dataset.lastValid = String(newQty);
  handleQtyChange(li, productId, newQty);
});

listEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.cart-item__remove');
  if (!btn) return;
  const li        = btn.closest('.cart-item');
  const productId = btn.dataset.productId ?? li?.dataset.productId;
  if (li && productId) handleRemove(li, productId);
});

// ── Checkout button ───────────────────────────────────────────────────────────

checkoutBtn.addEventListener('click', () => {
  if (!formAside) return;
  formAside.hidden = false;
  formAside.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Move focus to the first input in the form for accessibility
  const firstInput = formAside.querySelector('input');
  if (firstInput) firstInput.focus();
});

// ── Cross-tab sync via 'cart:updated' ─────────────────────────────────────

// 'cart:updated' fires for mutations in THIS tab (from cartState.dispatch).
// We skip the full re-render for same-tab changes (handled in-place above)
// by using a flag set before each mutation.
let skipNextCartEvent = false;

document.addEventListener('cart:updated', (e) => {
  if (skipNextCartEvent) {
    skipNextCartEvent = false;
    return;
  }
  // Another tab updated the cart — full re-render to stay in sync
  renderCart(e.detail);
});

// Patch updateItem / removeItem calls to set the skip flag
const _updateItem = updateItem;
const _removeItem = removeItem;

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function init() {
  announce('Loading cart…');
  try {
    const cart = await getCart();
    renderCart(cart);
  } catch (err) {
    announce(`Failed to load cart: ${err.message}`);
  }
}

init();
