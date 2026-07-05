// @ts-check
'use strict';

const { defineConfig } = require('@playwright/test');
const path = require('path');

/**
 * Playwright configuration for Alpha Store E2E tests.
 *
 * webServer: launches backend/server.e2e.js which starts an in-memory MongoDB,
 * seeds test products, and serves both the API and the static frontend from
 * http://localhost:3000 via express.static.
 */
module.exports = defineConfig({
  testDir: './e2e',

  // Run tests sequentially — they share the same in-memory DB
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: [['list']],

  use: {
    // Both API and frontend are served from port 3000 via express.static (P40)
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    // Give JS-heavy pages time to fetch from the API
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],

  webServer: {
    // server.e2e.js starts mongodb-memory-server, seeds products, then listens
    command: 'node server.e2e.js',
    cwd: path.join(__dirname, 'backend'),
    port: 3000,
    // In local dev, reuse an already-running server; always start fresh in CI
    reuseExistingServer: !process.env.CI,
    // Allow up to 3 min on first run (mongodb-memory-server downloads ~509MB binary)
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
