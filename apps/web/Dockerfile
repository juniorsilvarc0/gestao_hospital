# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────
# HMS-BR Web (React + Vite) — multi-stage Dockerfile.
# Build context = raiz do monorepo (workspace pnpm).
# Stages:
#   base    → Node 20 Alpine + pnpm
#   deps    → instala dependências do workspace
#   build   → vite build → dist/
#   runtime → nginx servindo dist estático (uso em produção)
#   dev     → vite dev server (HMR) para desenvolvimento
# ─────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=20.18-alpine
ARG PNPM_VERSION=9.15.0
ARG NGINX_VERSION=1.27-alpine

# ─────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/root/.local/share/pnpm \
    PATH=/root/.local/share/pnpm:$PATH \
    CI=true
RUN apk add --no-cache libc6-compat tini wget \
    && corepack enable \
    && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# ─────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/tiss/package.json packages/tiss/
COPY packages/sus/package.json packages/sus/
COPY packages/config/package.json packages/config/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store \
    && (pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile)

# ─────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm --filter @hms/web build

# ─────────────────────────────────────────────────────────────────────
FROM nginx:${NGINX_VERSION} AS runtime
RUN apk add --no-cache wget
# Conf default do nginx já serve /usr/share/nginx/html. Para SPA, fallback a index.html.
RUN printf 'server {\n  listen 80;\n  server_name _;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / { try_files $uri $uri/ /index.html; }\n}\n' \
    > /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
    CMD wget -q -O- http://localhost/ || exit 1

# ─────────────────────────────────────────────────────────────────────
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 5173
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=10 \
    CMD wget -q -O- http://localhost:5173/ || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "--filter", "@hms/web", "dev", "--host", "0.0.0.0"]
