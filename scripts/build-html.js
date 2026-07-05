'use strict';
/**
 * scripts/build-html.js
 *
 * Transforms source HTML pages for the production dist/ directory:
 *   • css/styles.css?v=dev  →  css/styles.min.css?v=HASH
 *   • js/<name>.js?v=dev    →  js/<name>.min.js?v=HASH
 *
 * Build hash priority: BUILD_HASH env var → git short-SHA → timestamp fallback.
 * In CI set BUILD_HASH to the git short-SHA before running `npm run build`.
 *
 * Run as part of `npm run build` (via npm-run-all --parallel).
 * Reads from frontend/, writes to dist/.
 */
const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

// ─── Build hash ──────────────────────────────────────────────────────────────

function getBuildHash() {
  if (process.env.BUILD_HASH) return process.env.BUILD_HASH;
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return Date.now().toString(36); // timestamp fallback (non-reproducible but always works)
  }
}

const hash = getBuildHash();

// ─── Page map ────────────────────────────────────────────────────────────────

const PAGES = [
  { src: 'index.html',              js: 'main' },
  { src: 'product.html',            js: 'product-detail' },
  { src: 'cart.html',               js: 'cart' },
  { src: 'order-confirmation.html', js: 'order-confirmation' },
];

// ─── Pre-create output dirs (cleancss may not auto-create them) ──────────────

fs.mkdirSync(path.join('dist', 'js'),  { recursive: true });
fs.mkdirSync(path.join('dist', 'css'), { recursive: true });

// ─── Transform HTML pages ────────────────────────────────────────────────────

for (const { src, js } of PAGES) {
  let html = fs.readFileSync(path.join('frontend', src), 'utf8');

  // Swap stylesheet: css/styles.css?v=<any>  →  css/styles.min.css?v=HASH
  html = html.replace(
    /href="css\/styles\.css\?v=[^"]*"/,
    `href="css/styles.min.css?v=${hash}"`,
  );

  // Swap JS entry: js/<name>.js?v=<any>  →  js/<name>.min.js?v=HASH
  // Uses a page-specific regex to avoid matching other <script> tags
  html = html.replace(
    new RegExp(`src="js/${js}\\.js\\?v=[^"]*"`),
    `src="js/${js}.min.js?v=${hash}"`,
  );

  fs.writeFileSync(path.join('dist', src), html);
  console.log(`  ✓  dist/${src}`);
}

console.log(`\n  Build hash: ${hash}`);
