'use strict';

module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: [
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'commonjs',
  },
  rules: {
    // Allow console in server-side code (use sparingly)
    'no-console': ['warn', { allow: ['error', 'warn', 'info'] }],

    // Prettier handles these — disable conflicting ESLint rules
    indent: 'off',
    quotes: ['error', 'single', { avoidEscape: true }],
    'comma-dangle': ['error', 'always-multiline'],
    semi: ['error', 'always'],

    // CommonJS modules use 'use strict' explicitly — ES-module implicit-strict rule N/A
    strict: 'off',

    // Allow long JSDoc YAML comment lines (swagger @openapi examples), URLs, and strings
    'max-len': ['error', {
      code: 100,
      ignoreComments: true,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true,
    }],

    // Node.js 20 natively supports for...of; sequential async iteration requires it
    'no-restricted-syntax': [
      'error',
      { selector: 'LabeledStatement', message: 'Labels are a form of GOTO; avoid them.' },
      { selector: 'WithStatement', message: '`with` is disallowed in strict mode.' },
    ],

    // Dynamic require() is idiomatic in Node.js (lazy loading, test module isolation)
    'global-require': 'off',

    // MongoDB uses _id/__v; allow module-private convention too
    'no-underscore-dangle': ['error', { allow: ['_id', '__v'] }],
    'consistent-return': 'off',

    // Allow unused 'next' in Express error handlers
    'no-unused-vars': ['error', { argsIgnorePattern: 'next' }],
  },
  overrides: [
    {
      // Relax rules for test files and dev-only scripts
      files: ['tests/**/*.js', '**/*.test.js', 'server.e2e.js', 'jest.config.js'],
      env: { jest: true },
      rules: {
        'no-console': 'off',
        'import/no-extraneous-dependencies': 'off',
      },
    },
  ],
};
