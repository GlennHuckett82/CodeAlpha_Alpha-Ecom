// @ts-check
'use strict';

const { test, expect } = require('@playwright/test');
const { checkA11y }    = require('./a11y-helper');

/**
 * E2E: Full shopping journey (happy path) + WCAG 2.1 AA accessibility audit.
 *
 * Covers the complete user flow from product listing → detail page →
 * add to cart → cart review → checkout → order confirmation.
 * checkA11y() is called after each page reaches its stable, fully-rendered
 * state so axe audits real content, not loading skeletons.
 *
 * Auth: POST /api/orders requires a JWT.  server.e2e.js pins JWT_SECRET to
 * 'e2e-test-jwt-secret'.  The token below was signed with that secret and
 * expires in 2035 — regenerate with:
 *   node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({id:'000000000000000000000000',email:'e2e@test.com'},'e2e-test-jwt-secret',{expiresIn:'3650d'}))"
 *
 * Playwright's extraHTTPHeaders forwards this to all browser-side fetch() calls.
 */
// pre-generated; valid until ~2035
const E2E_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIsImVtYWlsIjoiZTJlQHRlc3QuY29tIiwiaWF0IjoxNzgzMjY5NzIyLCJleHAiOjIwOTg2Mjk3MjJ9.GXxWR0sbwjRW_RB-0U-FfS38BZCEtGJf3Fz-VVYBzzo';

test.describe('Shopping flow — happy path', () => {
  // Inject the JWT into every request from this describe block so
  // POST /api/orders (which requires auth) accepts our requests.
  test.use({
    extraHTTPHeaders: {
      Authorization: `Bearer ${E2E_JWT}`,
    },
  });
  // Each test gets a fresh browser context (fresh localStorage / session)
  // so cart state does not bleed between tests.

  test('product listing displays at least one product card', async ({ page }) => {
    await page.goto('/index.html');

    // Wait for skeleton placeholders to be replaced by real cards
    const card = page.locator('.product-card:not(.skeleton-card)').first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    // ── Accessibility audit: product listing (stable, products loaded) ────────
    await checkA11y(page);
  });

  test('full journey: browse → detail → add to cart → checkout → confirmation', async ({ page }) => {
    // ── Step 1: Product listing ───────────────────────────────────────────────
    await page.goto('/index.html');

    // Wait for at least one real product card
    const firstCard = page.locator('.product-card:not(.skeleton-card)').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });

    // Record the product name so we can verify it appears on the detail page
    const productName = await firstCard.locator('.product-card__name').textContent();
    expect(productName).toBeTruthy();

    // ── Step 2: Navigate to product detail ───────────────────────────────────
    await firstCard.locator('.product-card__details-link').click();
    await page.waitForURL(/product\.html\?id=/, { timeout: 10_000 });

    // Product name heading should be populated (not empty after API fetch)
    const nameEl = page.locator('#product-name');
    await expect(nameEl).not.toBeEmpty({ timeout: 10_000 });

    // Price and stock status should also be visible
    await expect(page.locator('#product-price')).not.toBeEmpty();
    await expect(page.locator('#stock-status')).toContainText(/in stock/i, { timeout: 10_000 });

    // ── Accessibility audit: product detail (product fully loaded) ────────────
    await checkA11y(page);

    // ── Step 3: Add to cart ───────────────────────────────────────────────────
    // quantity-input already has value="1" in the HTML
    await page.locator('#add-to-cart').click();

    // Cart badge should increment to 1
    await expect(page.locator('#cart-badge')).toHaveText('1', { timeout: 10_000 });

    // Optional: feedback message should confirm the add
    await expect(page.locator('#cart-feedback')).toContainText(/added to cart/i, { timeout: 5_000 });

    // ── Step 4: Navigate to cart ──────────────────────────────────────────────
    await page.goto('/cart.html');

    // One cart item should appear
    await expect(page.locator('.cart-item')).toHaveCount(1, { timeout: 10_000 });

    // Item name should have text content (populated from product details)
    await expect(page.locator('.cart-item__name')).not.toBeEmpty({ timeout: 10_000 });
    await expect(page.locator('.cart-item__subtotal')).not.toBeEmpty();

    // Subtotal should be a non-zero GBP amount
    const subtotalText = await page.locator('#cart-subtotal').textContent();
    expect(subtotalText).toMatch(/£\d/);

    // ── Accessibility audit: cart page with item (before checkout form) ───────
    await checkA11y(page);

    // ── Step 5: Proceed to checkout ───────────────────────────────────────────
    await page.locator('#checkout-btn').click();
    await expect(page.locator('#order-form-container')).toBeVisible({ timeout: 5_000 });

    // ── Accessibility audit: cart page with order form visible ────────────────
    await checkA11y(page);

    // ── Step 6: Fill in shipping & payment form ───────────────────────────────
    await page.fill('#street',        '42 Playwright Avenue');
    await page.fill('#city',          'London');
    await page.fill('#postcode',      'SW1A 1AA');
    await page.fill('#country',       'United Kingdom');
    await page.fill('#card-last-four','4242');

    // ── Step 7: Place order ───────────────────────────────────────────────────
    await page.locator('#place-order-btn').click();

    // Should redirect to order-confirmation page
    await page.waitForURL(/order-confirmation\.html/, { timeout: 15_000 });

    // ── Step 8: Verify order confirmation ─────────────────────────────────────
    const orderIdEl = page.locator('#order-id');

    // #order-id starts as "Loading…" and is updated once the API responds
    await expect(orderIdEl).not.toHaveText('Loading…', { timeout: 10_000 });
    await expect(orderIdEl).not.toBeEmpty();

    // The order ID should look like a MongoDB ObjectId (24 hex characters)
    const orderId = await orderIdEl.textContent();
    expect(orderId?.trim()).toMatch(/^[0-9a-f]{24}$/i);

    // Confirmation heading should be visible
    await expect(page.locator('#confirmation-heading')).toHaveText('Order Confirmed!');

    // ── Accessibility audit: order confirmation page ──────────────────────────
    await checkA11y(page);
  });
});
