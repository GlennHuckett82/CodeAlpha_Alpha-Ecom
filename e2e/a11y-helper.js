// @ts-check
'use strict';

const { AxeBuilder } = require('@axe-core/playwright');

/**
 * Run an axe-core WCAG 2.1 AA accessibility audit on the given Playwright page.
 *
 * Throws an Error listing every violation when any are found, so the calling
 * Playwright test fails with a clear, actionable report.
 *
 * Tags used:
 *   wcag2a   / wcag2aa   — WCAG 2.0  Level A & AA
 *   wcag21a  / wcag21aa  — WCAG 2.1  Level A & AA (SC 1.3.4, 1.4.10-13, etc.)
 *
 * @param {import('@playwright/test').Page} page  Playwright page to audit
 * @param {object} [opts]
 * @param {string[]} [opts.exclude]  Additional CSS selectors to exclude from analysis
 * @returns {Promise<void>}
 */
async function checkA11y(page, { exclude = [] } = {}) {
  let builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

  if (exclude.length > 0) {
    exclude.forEach((sel) => { builder = builder.exclude(sel); });
  }

  const { violations } = await builder.analyze();

  if (violations.length === 0) return;

  const report = violations
    .map((v) => {
      const nodes = v.nodes
        .map((n) => `      ${n.html}`)
        .join('\n');
      return `  [${v.id}] ${v.description}\n    Impact: ${v.impact}\n    Nodes:\n${nodes}`;
    })
    .join('\n\n');

  throw new Error(
    `axe found ${violations.length} WCAG 2.1 AA violation(s):\n\n${report}`,
  );
}

module.exports = { checkA11y };
