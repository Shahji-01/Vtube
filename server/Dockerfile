# ── Stage 1: Build Frontend ───────────────────────────────────────────
FROM node:18-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ── Stage 2: Serve Backend ───────────────────────────────────────────
FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copy backend package files
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install --production

# If using bcrypt, use Alpine-compatible version or build from source
# RUN npm rebuild bcrypt --build-from-source 

# Copy backend source
COPY server/ ./

# Copy built frontend from Stage 1 into backend's serve path
COPY --from=client-builder /app/client/dist /app/client/dist

# Expose port
EXPOSE 8000

# Start server
CMD ["npm", "start"]