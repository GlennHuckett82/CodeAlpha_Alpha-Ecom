/**
 * config.js — Build-time constants shared across all frontend modules.
 *
 * BUILD_HASH is appended as `?v=BUILD_HASH` to CSS/JS URLs in HTML pages.
 * In a CI/CD pipeline this value is replaced with the git short-sha or a
 * content hash at build time; it defaults to 'dev' for local development.
 */
const CONFIG = {
  API_BASE_URL: 'http://localhost:3000',
  BUILD_HASH: 'dev',
};

export default CONFIG;
