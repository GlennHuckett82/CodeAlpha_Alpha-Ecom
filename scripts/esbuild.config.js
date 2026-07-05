'use strict';
/**
 * scripts/esbuild.config.js
 *
 * Cross-platform esbuild runner that uses the Node.js API instead of raw CLI
 * flags, avoiding Windows shell-quoting problems with --define values.
 *
 * Usage (via npm scripts):
 *   node scripts/esbuild.config.js --production   → minified, NODE_ENV=production
 *   node scripts/esbuild.config.js --dev          → source-maps, NODE_ENV=development
 *
 * Equivalent CLI intent:
 *   esbuild frontend/js/main.js --bundle --minify --outfile=dist/js/main.min.js \
 *     --define:process.env.NODE_ENV='"production"'
 *   (plus the other three entry points handled here simultaneously)
 */
const esbuild = require('esbuild');

const isProduction = process.argv.includes('--production');
const nodeEnv      = isProduction ? 'production' : 'development';

esbuild
  .build({
    // All four page entry points — esbuild bundles each independently
    entryPoints: [
      'frontend/js/main.js',
      'frontend/js/product-detail.js',
      'frontend/js/cart.js',
      'frontend/js/order-confirmation.js',
    ],
    bundle:     true,
    minify:     isProduction,
    sourcemap:  !isProduction,  // inline source-maps in dev for easy debugging
    format:     'esm',          // keep ES-module output; HTML uses type="module"
    outdir:     'dist/js',
    entryNames: '[name].min',   // main.min.js, cart.min.js, …

    // --define:process.env.NODE_ENV='"production"'
    // esbuild replaces every occurrence of process.env.NODE_ENV at bundle time.
    define: {
      'process.env.NODE_ENV': JSON.stringify(nodeEnv),
    },

    // Inject `var process = …` at the top of each bundle so that the
    // `typeof process !== 'undefined'` guard in config.js evaluates correctly
    // in a browser (where `process` is not a native global).
    // Without this, the guard would always be FALSE in a browser, causing the
    // production bundle to fall back to the dev URL at runtime.
    banner: {
      js: `var process={env:{NODE_ENV:${JSON.stringify(nodeEnv)}}};`,
    },

    // Target the last 2 major versions of each evergreen browser
    target: ['chrome90', 'firefox90', 'safari15', 'edge90'],
  })
  .then(() => {
    const label = isProduction ? 'minified  (production)' : 'built with source-maps (dev)';
    console.log(`  ✓  dist/js/*.min.js — ${label}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
