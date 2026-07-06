# ── Alpha E-com backend image ──────────────────────────────────────────────────
# Build context MUST be the project root so we can include frontend/:
#   docker build -f backend/Dockerfile .
# docker-compose handles this automatically via build.context: .
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine

# ── Directory setup (as root) ─────────────────────────────────────────────────
# Create app directories and hand ownership to the pre-existing 'node' user
# (uid 1000, gid 1000) that ships with node:alpine.
RUN mkdir -p /app/backend /app/frontend \
 && chown -R node:node /app

# ── Switch to non-root user for all subsequent steps ─────────────────────────
USER node
WORKDIR /app/backend

# ── Install production dependencies ──────────────────────────────────────────
# Copy manifests first so Docker can cache the layer: if only source files
# change, this layer is reused and npm ci is not re-run.
COPY --chown=node:node backend/package*.json ./
RUN npm ci --only=production

# ── Copy application source ───────────────────────────────────────────────────
# backend/ source (node_modules excluded via .dockerignore)
COPY --chown=node:node backend/ ./

# frontend/ static assets — Express serves these via:
#   express.static(path.join(__dirname, '..', 'frontend'))
# __dirname inside the container is /app/backend, so ../frontend → /app/frontend
COPY --chown=node:node frontend/ /app/frontend/

# ── Runtime configuration ─────────────────────────────────────────────────────
EXPOSE 3000

# Lightweight health check using busybox wget (available in alpine)
HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=20s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
