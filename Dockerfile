# ─────────────────────────────────────────────────────────────────────────────
# VTube — multi-stage production image.
#
# The Express server (server/) serves the built React SPA from ../client/dist
# via express.static and exposes the API under /api/v1. So the final image
# contains:
#   /app/server        → the Node/Express server (runtime deps only)
#   /app/client/dist    → the compiled SPA the server serves
#
# Stage 1 builds the client. Stage 2 installs server production deps. The final
# stage assembles a slim runtime image that runs as a non-root user.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: build the React client ──────────────────────────────────────────
FROM node:20-alpine AS client-build
WORKDIR /app/client

# Install with the lockfile for reproducible builds, then build.
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build


# ── Stage 2: install server production dependencies ───────────────────────────
FROM node:20-alpine AS server-deps
WORKDIR /app/server

# The server's package.json has a `postinstall` that builds the client; that is
# redundant here (Stage 1 already built it) and would fail because client/ is
# not present in this stage. `--ignore-scripts` skips it. Only production deps.
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts


# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/server

# Copy server production node_modules and source.
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server/package.json ./package.json
COPY server/src ./src

# The server writes temp uploads to ./public/temp (cwd-relative) and serves
# static assets from ./public. Create the directory up front.
RUN mkdir -p ./public/temp

# Copy the compiled SPA to the location the server serves (../client/dist).
COPY --from=client-build /app/client/dist /app/client/dist

# Run as the built-in unprivileged user and own the writable temp dir.
RUN chown -R node:node /app
USER node

EXPOSE 8000

# `npm start` → `node src/index.js`
CMD ["npm", "start"]
