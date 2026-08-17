FROM node:20-bookworm-slim AS base
ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /app

# ── deps ─────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ── backend build ────────────────────────────────────────────────────────
FROM deps AS backend-build
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# ── frontend build ───────────────────────────────────────────────────────
FROM base AS web-build
COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci --no-audit --no-fund
COPY web ./web
RUN npm --prefix web run build

# ── runtime ──────────────────────────────────────────────────────────────
FROM base AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    ca-certificates \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium
ENV NODE_ENV=production

COPY --from=backend-build /app/node_modules ./node_modules
COPY --from=backend-build /app/dist ./dist
COPY --from=backend-build /app/prisma ./prisma
COPY --from=web-build /app/web/dist ./web/dist

EXPOSE 3006
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]