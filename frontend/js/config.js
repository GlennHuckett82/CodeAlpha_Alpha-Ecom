/**
 * config.js — Build-time constants shared across all frontend modules.
 *
 * API_BASE_URL — NODE_ENV swap:
 *   esbuild replaces `process.env.NODE_ENV` at bundle time via
 *   `--define:process.env.NODE_ENV='"production"'` (see scripts/esbuild.config.js).
 *   The ternary below therefore collapses to a string literal in the bundle
 *   with zero runtime overhead.
 *   In development (no build step — files served directly from the filesystem
 *   by Five Server), `process` is not defined in the browser. The `typeof`
 *   guard prevents a ReferenceError and falls back to the dev URL automatically.
 *
 * BUILD_HASH — cache-busting:
 *   Appended as `?v=BUILD_HASH` to CSS/JS URLs in HTML pages.
 *   Defaults to 'dev'; replaced with the git short-SHA at CI build time via
 *   the BUILD_HASH environment variable (see scripts/build-html.js).
 */

// `process` only exists in Node.js / after an esbuild bundle; guard against
// ReferenceError when the file loads directly in a browser without a build step.
/* eslint-disable no-undef */
const _nodeEnv =
  typeof process !== 'undefined' && process.env
    ? process.env.NODE_ENV
    : 'development';
/* eslint-enable no-undef */

const CONFIG = {
  // API_BASE_URL — empty string in production, absolute URL in development.
  //
  // Production (esbuild collapses the ternary at bundle time):
  //   The Express server on Render serves both the API and the frontend from the
  //   SAME origin (e.g. https://alpha-ecom-api.onrender.com).  All API calls
  //   are therefore same-origin, so relative paths like /api/products work
  //   correctly without hardcoding any domain.  Using '' avoids breakage if the
  //   service is ever moved to a custom domain.
  //
  // Development (no build step — Live Server on :5500, API on :3000):
  //   Absolute URL is required because the two servers are cross-origin.
  API_BASE_URL:
    _nodeEnv === 'production'
      ? ''                      // same-origin on Render — no domain needed
      : 'http://localhost:3000',

  BUILD_HASH: 'dev',
};

export default CONFIG;
