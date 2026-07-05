// @ts-check
'use strict';

const { test, expect } = require('@playwright/test');

/**
 * E2E: Error states
 *
 * Covers two failure scenarios:
 *  1. Navigating to a product that does not exist → "not found" UI state
 *  2. Submitting the order form with empty fields → inline validation errors
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Uses Playwright's built-in API client to add a product to a cart session,
 * so the cart page has an item and the "Proceed to Checkout" button is active.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} sessionId
 */
async function seedCart(request, sessionId) {
  // Fetch the first available product from the seeded catalogue
  const productsRes = await request.get('/api/products?page=1&limit=1');
  expect(productsRes.ok()).toBeTruthy();
  const { data } = await productsRes.json();
  const productId = data[0]._id;

  // Add one unit to the test session's cart
  const addRes = await request.post('/api/cart', {
    data: { sessionId, productId, quantity: 1 },
  });
  expect(addRes.ok()).toBeTruthy();
}

// ── Test 1: product not found ──────────────────────────────────────────────────

test.describe('Error state: product not found', () => {
  test('navigating to a non-existent product ID shows a "not found" message', async ({ page }) => {
    // Use a syntactically valid ObjectId that will never exist in the test DB
    await page.goto('/product.html?id=000000000000000000000001');

    // The page should render an error / empty-state section
    const errorSection = page.locator('.empty-state');
    await expect(errorSection).toBeVisible({ timeout: 10_000 });

    // The message should indicate the product could not be found
    await expect(errorSection).toContainText(/not found/i);

    // The article (product content) should be hidden
    await expect(page.locator('#product-detail-content')).toBeHidden();

    // A link back to the listing should be present
    await expect(errorSection.locator('a[href="index.html"]')).toBeVisible();
  });
});

// ── Test 2: order form validation ─────────────────────────────────────────────

test.describe('Error state: order form validation', () => {
  const SESSION_ID = 'e2e-form-validation-session';

  test.beforeEach(async ({ page, request }) => {
    // Pre-create a cart item via the API so the cart page has something to show
    await seedCart(request, SESSION_ID);

    // Inject the session ID into localStorage BEFORE the page scripts run
    // so cart.js picks up the pre-seeded cart on first load
    await page.addInitScript((id) => {
      localStorage.setItem('alpha_session_id', id);
    }, SESSION_ID);
  });

  test('submitting the empty order form shows inline errors on all required fields', async ({ page }) => {
    await page.goto('/cart.html');

    // Cart item must be visible before we can proceed to checkout
    await expect(page.locator('.cart-item')).toHaveCount(1, { timeout: 10_000 });

    // Open the checkout form
    await page.locator('#checkout-btn').click();
    await expect(page.locator('#order-form-container')).toBeVisible({ timeout: 5_000 });

    // Ensure all inputs are empty (they should be by default)
    await page.fill('#street',         '');
    await page.fill('#city',           '');
    await page.fill('#postcode',       '');
    await page.fill('#country',        '');
    await page.fill('#card-last-four', '');

    // Submit without filling anything
    await page.locator('#place-order-btn').click();

    // Inline error messages should appear next to each required field.
    // order.js calls setError() which writes to the *-error spans and adds
    // aria-invalid="true" to the inputs.
    await expect(page.locator('#street-error')).not.toBeEmpty({ timeout: 5_000 });
    await expect(page.locator('#city-error')).not.toBeEmpty();
    await expect(page.locator('#postcode-error')).not.toBeEmpty();
    await expect(page.locator('#country-error')).not.toBeEmpty();
    await expect(page.locator('#card-error')).not.toBeEmpty();

    // Inputs should be marked invalid for screen readers
    await expect(page.locator('#street')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#card-last-four')).toHaveAttribute('aria-invalid', 'true');

    // Page should NOT have navigated away
    await expect(page).toHaveURL(/cart\.html/);
  });

  test('correcting a field clears its error and adds the valid class', async ({ page }) => {
    await page.goto('/cart.html');
    await expect(page.locator('.cart-item')).toHaveCount(1, { timeout: 10_000 });

    await page.locator('#checkout-btn').click();
    await expect(page.locator('#order-form-container')).toBeVisible();

    // Submit empty to trigger all errors
    await page.locator('#place-order-btn').click();
    await expect(page.locator('#street-error')).not.toBeEmpty({ timeout: 5_000 });

    // Fix just the street field via blur event (order.js validates on blur)
    await page.fill('#street', '10 Fixed Street');
    await page.locator('#street').blur();

    // Street error should clear — confirmed by empty error span and aria-invalid="false"
    await expect(page.locator('#street-error')).toBeEmpty({ timeout: 5_000 });
    await expect(page.locator('#street')).toHaveAttribute('aria-invalid', 'false');
    // is-valid is added to the .form-group wrapper, not the input itself
    await expect(page.locator('#street').locator('xpath=ancestor::*[contains(@class,"form-group")]').first()).toHaveClass(/is-valid/);
  });
});
