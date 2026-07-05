/**
 * order.js — Order form validation and submission (used by cart.html via cart.js)
 *
 * Exported function:
 *   initOrderForm() — call once per page; no-ops if form is absent
 *
 * Validation rules:
 *   street, city, country — required, non-empty after trim
 *   postcode              — required + UK postcode pattern (configurable)
 *   cardLastFour          — exactly 4 digits
 *
 * Each field validates on blur (immediate feedback) and on submit (final gate).
 * Invalid fields get aria-describedby pointing to their error span, the parent
 * .form-group gets .has-error, and the span text is set via textContent.
 */

import api from './api.js';
import { getSessionId, clearCart } from './cartState.js';

// ── Validation rules ───────────────────────────────────────────────────────

const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;
const CARD_RE     = /^\d{4}$/;

const FIELDS = [
  {
    id:       'street',
    errorId:  'street-error',
    validate: (v) => v.trim() ? null : 'Street address is required.',
  },
  {
    id:       'city',
    errorId:  'city-error',
    validate: (v) => v.trim() ? null : 'City is required.',
  },
  {
    id:       'postcode',
    errorId:  'postcode-error',
    validate: (v) => {
      if (!v.trim()) return 'Postcode is required.';
      if (!POSTCODE_RE.test(v.trim())) return 'Enter a valid UK postcode (e.g. SW1A 2AA).';
      return null;
    },
  },
  {
    id:       'country',
    errorId:  'country-error',
    validate: (v) => v.trim() ? null : 'Country is required.',
  },
  {
    id:       'card-last-four',
    errorId:  'card-error',
    validate: (v) => {
      if (!v.trim()) return 'Card last 4 digits are required.';
      if (!CARD_RE.test(v.trim())) return 'Enter exactly 4 digits.';
      return null;
    },
  },
];

// ── Toast helper (minimal, self-contained) ─────────────────────────────────

function showToast(message, isError = false) {
  // Remove any existing toast so we never stack them
  document.querySelector('.toast')?.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'toast--error' : 'toast--success'}`;
  toast.textContent = message; // textContent — never innerHTML with user data
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  document.body.appendChild(toast);

  // Remove after animation completes (slide-in 0.3s + visible ~4.6s + slide-out 0.4s)
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 5000 : 5300;
  setTimeout(() => toast.remove(), duration);
}

// ── Field-level helpers ────────────────────────────────────────────────────

function getFormGroup(input) {
  return input.closest('.form-group');
}

function setError(input, errorSpan, message) {
  getFormGroup(input)?.classList.add('has-error');
  getFormGroup(input)?.classList.remove('is-valid');
  errorSpan.textContent = message; // textContent — safe
  input.setAttribute('aria-describedby', errorSpan.id);
  input.setAttribute('aria-invalid', 'true');
}

function clearError(input, errorSpan) {
  getFormGroup(input)?.classList.remove('has-error');
  getFormGroup(input)?.classList.add('is-valid');
  errorSpan.textContent = '';
  input.removeAttribute('aria-describedby');
  input.setAttribute('aria-invalid', 'false');
}

// ── Validate one field — returns error string or null ──────────────────────

function validateField({ id, errorId, validate }, form) {
  const input     = form.querySelector(`#${id}`);
  const errorSpan = form.querySelector(`#${errorId}`);
  if (!input || !errorSpan) return null;

  const error = validate(input.value);
  if (error) {
    setError(input, errorSpan, error);
  } else {
    clearError(input, errorSpan);
  }
  return error;
}

// ── Validate all fields — returns true if all pass ─────────────────────────

function validateAll(form) {
  const errors = FIELDS.map((rule) => validateField(rule, form));
  return errors.every((e) => e === null);
}

// ── Announce to screen readers ─────────────────────────────────────────────

function announceError(statusEl, message) {
  // Using a polite region so it doesn't interrupt mid-sentence announcements
  if (statusEl) statusEl.textContent = message;
}

// ── Main init ──────────────────────────────────────────────────────────────

export function initOrderForm() {
  const form      = document.getElementById('order-form');
  const submitBtn = document.getElementById('place-order-btn');
  const statusEl  = document.getElementById('cart-status');

  if (!form || !submitBtn) return; // Not on cart page — exit cleanly

  // ── Blur validation (per field, immediate feedback) ──────────────────────

  FIELDS.forEach((rule) => {
    const input = form.querySelector(`#${rule.id}`);
    if (!input) return;
    input.addEventListener('blur', () => validateField(rule, form));
    // Also re-validate on input after an error is shown (clears as user types)
    input.addEventListener('input', () => {
      if (getFormGroup(input)?.classList.contains('has-error')) {
        validateField(rule, form);
      }
    });
  });

  // ── Submit handler ────────────────────────────────────────────────────────

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const valid = validateAll(form);
    if (!valid) {
      announceError(statusEl, 'Please fix the errors above before placing your order.');
      // Move focus to first invalid field
      const firstBad = form.querySelector('[aria-invalid="true"]');
      firstBad?.focus();
      return;
    }

    // Collect values (all trimmed, never interpolated into HTML)
    const street      = form.querySelector('#street').value.trim();
    const city        = form.querySelector('#city').value.trim();
    const postcode    = form.querySelector('#postcode').value.trim().toUpperCase();
    const country     = form.querySelector('#country').value.trim();
    const cardLastFour = form.querySelector('#card-last-four').value.trim();

    // Disable button and show loading state
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Placing order…';
    if (statusEl) statusEl.textContent = '';

    try {
      const result = await api.createOrder({
        sessionId: getSessionId(),
        shippingAddress: { street, city, postcode, country },
        cardLastFour,
      });

      const orderId = result.data?._id ?? result._id ?? result.data?.id ?? result.id;

      // Clear cart cache and dispatch cart:updated
      await clearCart();

      // Redirect to confirmation page
      window.location.href = `order-confirmation.html?orderId=${encodeURIComponent(orderId)}`;
    } catch (err) {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Place Order';
      showToast(err.message || 'Failed to place order. Please try again.', true);
      if (statusEl) statusEl.textContent = err.message || 'Order failed.';
    }
  });
}
