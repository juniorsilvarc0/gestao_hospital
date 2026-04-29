# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────
# HMS-BR API (NestJS) — multi-stage Dockerfile.
# Build context = raiz do monorepo (precisa enxergar packages/* e o workspace pnpm).
# Stages:
#   base    → Node 20 LTS Alpine + pnpm via corepack
#   deps    → instala dependências do workspace
#   build   → compila TS (apenas para imagem de runtime/produção)
#   runtime → imagem mínima para produção (apenas dist + prod deps)
#   dev     → imagem para desenvolvimento (hot-reload via NestJS watch)
# ─────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=20.18-alpine
ARG PNPM_VERSION=9.15.0

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
# Manifests do workspace (cópia granular para cache eficiente).
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
# Manifests dos apps e packages (apenas package.json — preserva cache do install).
COPY apps/api/package.json apps/api/
COPY packages/domain/package.json packages/domain/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/tiss/package.json packages/tiss/
COPY packages/sus/package.json packages/sus/
COPY packages/config/package.json packages/config/
# Em dev/CI ainda não há lockfile estável — fallback para no-frozen-lockfile.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store \
    && (pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile)

# ─────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
# Schema Prisma vive em apps/api/prisma/ (já copiado via `apps/api`).
# Gera o client antes do build para que os tipos estejam disponíveis ao TS.
RUN pnpm --filter @hms/api prisma:generate
RUN pnpm --filter @hms/api build

# ─────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
ARG PNPM_VERSION
ENV NODE_ENV=production \
    PNPM_HOME=/root/.local/share/pnpm \
    PATH=/root/.local/share/pnpm:$PATH
RUN apk add --no-cache tini wget \
    && corepack enable \
    && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
# Apenas o necessário para rodar a API compilada.
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/packages ./packages
COPY --from=build /app/node_modules ./node_modules
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD wget -q -O- http://localhost:3000/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/main.js"]

# ─────────────────────────────────────────────────────────────────────
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=10 \
    CMD wget -q -O- http://localhost:3000/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
# Em dev a fonte vem por bind-mount do compose. Geramos o client Prisma a cada
# start (rápido — idempotente) para garantir que mudanças no schema reflitam
# imediatamente no cliente TS.
CMD ["sh", "-c", "pnpm --filter @hms/api prisma:generate && pnpm --filter @hms/api start:dev"]
