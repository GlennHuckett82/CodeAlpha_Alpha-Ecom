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
  // Resolved to a string literal at bundle time; falls back to localhost in dev
  API_BASE_URL:
    _nodeEnv === 'production'
      ? 'https://api.alpha-store.example.com' // TODO: replace with your production URL
      : 'http://localhost:3000',

  BUILD_HASH: 'dev',
};

export default CONFIG;
