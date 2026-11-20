# syntax=docker/dockerfile:1
# Shared-world server image (Fly.io). Two stages:
#   build:   install the workspace, bundle apps/sim-host/src/multiplayer/serve.ts
#   runtime: node slim + Prisma 7 client/CLI (pg adapter) + ws + the bundle.
#            Runs as `node`.
# Node 24 satisfies the repo's engines (>=22.12) and matches CI.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /repo
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json ./
COPY packages/contract/package.json packages/contract/
COPY packages/sim/package.json packages/sim/
COPY packages/db/package.json packages/db/
COPY apps/sim-host/package.json apps/sim-host/
COPY apps/client/package.json apps/client/
COPY apps/desktop/package.json apps/desktop/
# --ignore-scripts: no Electron or embedded-Postgres downloads in the image.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY packages packages
COPY apps/sim-host apps/sim-host
RUN node apps/sim-host/scripts/build-server.mjs

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false
COPY deploy/fly/package.json deploy/fly/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY packages/db/prisma ./prisma
COPY deploy/fly/prisma.config.ts ./prisma.config.ts
RUN npx prisma generate
COPY --from=build /repo/apps/sim-host/dist/server.mjs /repo/apps/sim-host/dist/server.mjs.map ./
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "server.mjs"]
