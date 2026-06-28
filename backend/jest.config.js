'use strict';

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',

  // Run the in-memory MongoDB setup before every test file
  setupFilesAfterEnv: ['./tests/jest.setup.js'],

  // Only match files inside /tests/
  testMatch: ['**/tests/**/*.test.js'],

  // Collect coverage from source files only (not tests or config)
  collectCoverageFrom: [
    'models/**/*.js',
    'routes/**/*.js',
    'services/**/*.js',
    'middleware/**/*.js',
    '!**/*.placeholder.js',
  ],

  // Fail the build if coverage drops below 80% on any metric
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },

  // Human-readable output in CI; use 'verbose' locally for detail
  verbose: true,

  // Prevent open handles (e.g. unclosed Mongoose connections) from hanging the process
  forceExit: true,

  // Limit to 1 worker when running coverage to avoid port/memory contention
  workerIdleMemoryLimit: '512MB',
};
