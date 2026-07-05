/**
 * order-confirmation.js — Order confirmation page controller (order-confirmation.html)
 *
 * Reads ?orderId= from the URL, fetches the order, and populates the page.
 * Redirects to index.html immediately if no orderId is present.
 */

import api from './api.js';
import './header.js';

// ── DOM refs ───────────────────────────────────────────────────────────────

const statusEl    = document.getElementById('confirmation-status');
const orderIdEl   = document.getElementById('order-id');
const summaryEl   = document.getElementById('order-summary');

// ── Currency formatter ────────────────────────────────────────────────────

const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

// ── Helpers ─────────────────────────────────────────────────────────────

function announce(msg) {
  if (statusEl) statusEl.textContent = msg;
}

/**
 * Builds the order summary table from the order's items array.
 * All user data via textContent — no innerHTML.
 */
function renderSummary(order) {
  const items  = order.items ?? [];
  const total  = order.totalPrice ?? order.total ?? null;

  if (!items.length) {
    summaryEl.textContent = 'No items found.';
    return;
  }

  const table = document.createElement('table');
  table.className = 'order-summary-table';
  table.setAttribute('aria-label', 'Order items');

  // Header
  const thead = document.createElement('thead');
  const hRow  = document.createElement('tr');
  ['Product', 'Qty', 'Price'].forEach((label) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    hRow.appendChild(th);
  });
  thead.appendChild(hRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  items.forEach((item) => {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = item.name ?? item.productId ?? '—';

    const qtyTd = document.createElement('td');
    qtyTd.textContent = String(item.quantity ?? 1);

    const priceTd = document.createElement('td');
    priceTd.textContent = currency.format(Number(item.price ?? 0) * (item.quantity ?? 1));

    tr.appendChild(nameTd);
    tr.appendChild(qtyTd);
    tr.appendChild(priceTd);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  // Total row
  if (total !== null) {
    const tfoot = document.createElement('tfoot');
    const fRow  = document.createElement('tr');
    const labelTd = document.createElement('td');
    labelTd.setAttribute('colspan', '2');
    labelTd.textContent = 'Total';
    const totalTd = document.createElement('td');
    totalTd.textContent = currency.format(Number(total));
    fRow.appendChild(labelTd);
    fRow.appendChild(totalTd);
    tfoot.appendChild(fRow);
    table.appendChild(tfoot);
  }

  summaryEl.appendChild(table);
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

async function init() {
  const params  = new URLSearchParams(window.location.search);
  const orderId = params.get('orderId');

  if (!orderId) {
    // No orderId — user arrived here directly; send them to the shop
    window.location.replace('index.html');
    return;
  }

  announce('Loading your order…');

  try {
    const result = await api.getOrder(orderId);
    const order  = result.data ?? result;

    // Populate order ID (textContent — safe)
    orderIdEl.textContent = order._id ?? orderId;
    document.title = `Order ${order._id ?? orderId} — Alpha Store`;

    renderSummary(order);
    announce(''); // clear status once content is visible
  } catch (err) {
    const message = err.status === 404
      ? 'Order not found.'
      : err.message || 'Failed to load order details.';

    announce(message);
    orderIdEl.textContent = orderId; // still show the ID they arrived with

    const errDiv = document.createElement('div');
    errDiv.className   = 'error-message';
    errDiv.textContent = message;
    summaryEl.appendChild(errDiv);
  }
}

init();
