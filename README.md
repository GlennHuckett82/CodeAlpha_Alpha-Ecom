# Alpha E-com

[![CI](https://github.com/GlennHuckett82/alpha-ecom/actions/workflows/ci.yml/badge.svg)](https://github.com/GlennHuckett82/alpha-ecom/actions/workflows/ci.yml)

A full-stack e-commerce store built with Express.js, MongoDB, and vanilla JavaScript.

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20 · Express 4 · Mongoose 8 |
| Database | MongoDB 7 (Docker) · mongodb-memory-server (tests) |
| Frontend | Vanilla JS ES modules · CSS3 custom properties |
| Testing | Jest 29 · Supertest · Playwright 1.44 · axe-core |
| Build | esbuild · clean-css · GitHub Actions CI |

## Getting started

### Prerequisites
- Node.js 20+
- Docker Desktop (for running with MongoDB)

### Local development (with Live Server)

```bash
# 1. Install root dependencies (Playwright, esbuild, etc.)
npm ci

# 2. Install backend dependencies
cd backend && npm ci && cd ..

# 3. Create backend/.env from the example and fill in JWT_SECRET
cp backend/.env.example backend/.env

# 4. Start the backend (connects to MONGO_URI in backend/.env)
cd backend && npm start
```

Open `frontend/index.html` with VS Code Live Server or any static server.

### Docker (recommended — includes MongoDB)

```bash
cp backend/.env.example backend/.env   # fill in JWT_SECRET
npm run docker:up                      # builds image, starts api + mongo
# → http://localhost:3000
```

```bash
npm run docker:down    # stop and remove containers
```

### Backend tests

```bash
cd backend
npm test               # all 351 tests (no coverage)
npm run test:coverage  # with coverage report (≥80% enforced)
```

### Frontend E2E tests (Playwright)

```bash
npm run test:e2e:install   # first time only — downloads Chromium
npm run test:e2e           # runs all Playwright + axe accessibility tests
```

### Production build

```bash
npm run build   # minifies JS, CSS, rewrites HTML → dist/
```

## CI pipeline

Every push and pull request to `main` runs three sequential jobs:

1. **Lint** — ESLint (airbnb-base) across the entire backend
2. **Test** — 351 Jest unit + integration tests; coverage enforced at ≥80%
3. **Build** — esbuild + clean-css; verifies all `dist/` artifacts are present

Set the following repository secret before the pipeline can pass:
`JWT_SECRET` — any non-empty string (used by auth tests; no real DB required).

## Project structure

```
alpha-ecom/
├── backend/               Express API
│   ├── middleware/         cors, auth, cache, errorHandler, security
│   ├── models/             Mongoose schemas (User, Product, Cart, Order)
│   ├── routes/             products, cart, orders, auth, admin
│   ├── services/           inventoryService, paymentService
│   ├── tests/              Jest unit + integration suites
│   └── server.js           Express app (also serves frontend/)
├── frontend/              Vanilla JS + CSS3
│   ├── css/styles.css      Design system (custom properties, WCAG 2.1 AA)
│   ├── js/                 ES module entry points per page
│   └── *.html              Page shells (index, product, cart, confirmation)
├── e2e/                   Playwright tests + axe accessibility checks
├── scripts/               esbuild config, HTML build script
├── docker-compose.yml     api + mongo services
└── .github/workflows/     CI pipeline
```
