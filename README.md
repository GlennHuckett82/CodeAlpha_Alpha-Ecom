# Alpha E-com

[![CI](https://github.com/GlennHuckett82/alpha-ecom/actions/workflows/ci.yml/badge.svg)](https://github.com/GlennHuckett82/alpha-ecom/actions/workflows/ci.yml)

A full-stack e-commerce store built with Express.js, MongoDB, and vanilla JavaScript — no frameworks, no bundlers at runtime. Features JWT authentication, cursor-based pagination, a Redis-style in-memory cache, WCAG 2.1 AA accessibility, a full CI/CD pipeline, and interactive OpenAPI documentation.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla JS ES modules · CSS3 custom properties · HTML5 |
| **Backend** | Node.js 20 · Express 4 · Mongoose 8 · express-validator |
| **Database** | MongoDB 7 (production / Docker) · mongodb-memory-server (tests) |
| **Security** | Helmet · CORS · express-rate-limit · bcryptjs · JWT (jsonwebtoken) |
| **Testing** | Jest 29 · Supertest · Playwright 1.44 · axe-core/playwright |
| **Build** | esbuild · clean-css-cli · npm-run-all |
| **DevOps** | Docker · docker-compose · GitHub Actions CI · Render (PaaS) |
| **Docs** | swagger-jsdoc · swagger-ui-express (OpenAPI 3.0.3) |

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20+ | `node --version` to confirm |
| npm | 9+ | bundled with Node 20 |
| MongoDB | 7+ | only needed for local dev without Docker |
| Docker Desktop | any recent | only needed for the Docker quick start |

---

## Quick Start — Local (no Docker)

```bash
# 1. Clone the repository
git clone https://github.com/GlennHuckett82/alpha-ecom.git
cd alpha-ecom

# 2. Install root-level dev tools (Playwright, esbuild, etc.)
npm ci

# 3. Install backend dependencies
cd backend && npm ci && cd ..

# 4. Create your environment file
cp backend/.env.example backend/.env
# Open backend/.env and set JWT_SECRET (and MONGO_URI if not default)

# 5. Start the backend API
cd backend && npm run dev
# → API running at http://localhost:3000
# → Frontend served at http://localhost:3000 (Express static)
```

> **Tip:** Open `frontend/index.html` with VS Code Live Server for hot-reload during frontend development. The frontend auto-selects the API base URL based on `NODE_ENV`.

---

## Quick Start — Docker (includes MongoDB)

```bash
# 1. Create backend/.env (only JWT_SECRET is required)
cp backend/.env.example backend/.env

# 2. Build and start both services
npm run docker:up
# → API + Mongo running; app at http://localhost:3000

# 3. Stop and remove containers
npm run docker:down
```

The `docker-compose.yml` spins up two services: `api` (Node 20 Alpine) and `mongo` (MongoDB 7). A named volume (`alpha_mongo_data`) persists the database across restarts.

---

## Running Tests

### Unit + Integration (Jest)

```bash
cd backend

npm test                # 351 tests, no coverage report
npm run test:coverage   # same + HTML coverage report (≥80 % enforced)
npm run test:watch      # interactive watch mode during development
```

### End-to-End + Accessibility (Playwright)

```bash
# From the project root:
npm run test:e2e:install   # first run only — downloads Chromium
npm run test:e2e           # full Playwright suite + axe-core a11y checks
```

E2E tests require the backend to be running (`cd backend && npm run dev`). The server URL is configured in `playwright.config.js`.

### Linting

```bash
cd backend
npm run lint          # ESLint (airbnb-base)
npm run lint:fix      # auto-fix fixable issues
```

---

## Environment Variables

Create `backend/.env` by copying `backend/.env.example`. All variables are listed below.

| Variable | Required | Description | Example |
|---|---|---|---|
| `PORT` | No | Port the Express server listens on | `3000` |
| `NODE_ENV` | No | Runtime environment (`development` / `production` / `test`) | `development` |
| `MONGO_URI` | **Yes** | MongoDB connection string | `mongodb://localhost:27017/alpha-ecom` |
| `JWT_SECRET` | **Yes** | Secret used to sign JWT tokens — keep long and random | `s3cr3t-32chars-minimum-recommended` |
| `CORS_ORIGIN` | No | Comma-separated list of allowed CORS origins | `http://localhost:5500,http://127.0.0.1:5500` |
| `ADMIN_KEY` | No | Header value required to access `/api/admin/*` routes | `my-admin-key` |

> **GitHub Actions:** set `JWT_SECRET` as a repository secret so the CI test job can pass. The pipeline falls back to a non-production placeholder if the secret is absent.

---

## API Overview

Interactive docs (Swagger UI) are available at [`http://localhost:3000/api/docs`](http://localhost:3000/api/docs) when the server is running.
The raw OpenAPI 3.0.3 spec is served at [`/api/docs.json`](http://localhost:3000/api/docs.json).

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | — | Health check (used by Docker / Render) |
| `GET` | `/api/health` | — | Health check (API prefix variant) |
| `GET` | `/api/products` | — | List products — cursor or offset pagination, category filter, full-text search |
| `GET` | `/api/products/:id` | — | Get a single product by MongoDB ObjectId |
| `GET` | `/api/cart/:sessionId` | — | Retrieve cart with populated product details |
| `POST` | `/api/cart` | — | Add item to cart (creates cart if absent; increments qty if item exists) |
| `PUT` | `/api/cart/:sessionId/items/:productId` | — | Update item quantity (replaces, does not add) |
| `DELETE` | `/api/cart/:sessionId/items/:productId` | — | Remove a single item from cart |
| `DELETE` | `/api/cart/:sessionId` | — | Clear all items from cart |
| `POST` | `/api/auth/register` | — | Register a new user account |
| `POST` | `/api/auth/login` | — | Log in and receive a signed JWT (24 h expiry) |
| `POST` | `/api/orders` | Bearer JWT | Place an order — validates stock, simulates payment, persists order |
| `GET` | `/api/orders/:id` | Bearer JWT | Retrieve a placed order by ID |
| `DELETE` | `/api/admin/cache` | `x-admin-key` | Flush the in-memory product cache |

**Auth column key:** `Bearer JWT` = `Authorization: Bearer <token>` header required. `x-admin-key` = `x-admin-key: <ADMIN_KEY>` header required.

---

## Folder Structure

```
alpha-ecom/
├── backend/                  Express API
│   ├── middleware/            auth, cache, cors, errorHandler, security
│   ├── models/               Mongoose schemas — User, Product, Cart, Order
│   ├── routes/               products, cart, orders, auth, admin
│   ├── services/             inventoryService, paymentService
│   ├── tests/                Jest unit + integration suites (19 files)
│   ├── scripts/              createIndexes.js (MongoDB text + compound indexes)
│   ├── Dockerfile            Multi-stage Node 20 Alpine image
│   ├── render.yaml           Render Blueprint deployment config
│   ├── swagger.js            OpenAPI 3.0.3 spec (swagger-jsdoc)
│   └── server.js             Express app entry point
├── frontend/                 Vanilla JS + CSS3 (no framework)
│   ├── css/styles.css        Design system — CSS custom properties, WCAG 2.1 AA
│   └── js/                   ES module entry points per page
├── e2e/                      Playwright tests + axe-core accessibility checks
├── scripts/                  esbuild config, build-html.js
├── docs/                     Deployment guide and architecture notes
├── dist/                     Production build output (git-ignored)
├── docker-compose.yml        api + mongo services
└── .github/workflows/ci.yml  Lint → Test → Build CI pipeline
```

---

## Deployment

The backend is deployable to [Render](https://render.com) using the included `backend/render.yaml` Blueprint.

See [docs/deployment.md](docs/deployment.md) for full step-by-step instructions covering:
- MongoDB Atlas cluster setup
- Render Blueprint connection
- Environment variable configuration
- Manual redeploy and rollback procedures
- Free-tier spin-down caveat

---

## Extra Credit Features

- **Cursor-based pagination** — `GET /api/products` supports both cursor (efficient, index-only) and offset (classic page/limit) modes.
- **In-memory response cache** — TTL-based cache middleware on product routes with `X-Cache: HIT/MISS` headers; instantly invalidated via `DELETE /api/admin/cache`.
- **WCAG 2.1 AA accessibility** — contrast ratios verified, skip-navigation links, visible focus rings, semantic HTML, automated axe-core checks in E2E tests.
- **OpenAPI 3.0.3 documentation** — swagger-jsdoc generates the spec from JSDoc comments; Swagger UI served at `/api/docs` with lazy loading so tests don't pay the parse cost.
- **Docker Compose** — single command (`npm run docker:up`) starts the full stack including MongoDB with a health-checked startup dependency.
- **GitHub Actions CI** — three-job pipeline (lint → test → build) with MongoDB binary cache, coverage artifact upload, and image build verification.
- **Production build pipeline** — esbuild bundles + minifies JS; clean-css minifies CSS; custom `build-html.js` rewrites asset paths in HTML pages.
- **Rate limiting** — `express-rate-limit` on all `/api` routes (excluding health checks and docs) to prevent abuse.
- **Security headers** — Helmet sets CSP, HSTS, X-Frame-Options, and other defensive headers.
- **Stock management with rollback** — order placement decrements product stock; if the Order document write fails, stock is rolled back automatically.

---

## License

MIT © 2024 Alpha E-com Contributors

