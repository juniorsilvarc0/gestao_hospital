# HMS-BR — Makefile (atalhos canônicos para a stack dev em Docker).
# Princípio: o desenvolvedor só precisa de Docker no host. Tudo abaixo
# orquestra docker compose. Não invocar pnpm/node/psql diretamente no host.

SHELL := /bin/bash

# Permite override: `make logs s=api`, `make sh s=web`.
s ?= api

# Default goal exibe o help.
.DEFAULT_GOAL := help

.PHONY: help up down logs sh psql migrate seed test lint reset build ps clean ai-up

help: ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS=":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up: ## Sobe todos os serviços e aguarda healthcheck (`docker compose up -d --wait`)
	docker compose up -d --wait

down: ## Para todos os serviços
	docker compose down

logs: ## Tail dos logs — uso: `make logs s=api`
	docker compose logs -f $(s)

sh: ## Shell num serviço — uso: `make sh s=api` ou `make sh s=web`
	docker compose exec $(s) sh

psql: ## Abre psql no postgres (db/usuário do .env)
	docker compose exec postgres psql -U $${POSTGRES_USER:-hms} $${POSTGRES_DB:-hms}

migrate: ## Roda `prisma migrate dev` dentro do container api
	docker compose exec api pnpm --filter @hms/api prisma migrate dev

seed: ## Popula tenant dev + admin
	docker compose exec api pnpm --filter @hms/api seed

test: ## Roda os testes da api
	docker compose exec api pnpm --filter @hms/api test

lint: ## Lint global do monorepo
	docker compose exec api pnpm lint

reset: ## Recria tudo do zero (CUIDADO: apaga volumes)
	docker compose down -v
	$(MAKE) up
	$(MAKE) migrate
	$(MAKE) seed

build: ## Rebuild das imagens (sem cache do compose)
	docker compose build

ps: ## Status dos serviços
	docker compose ps

clean: ## Remove containers e volumes (apaga dados!)
	docker compose down -v

ai-up: ## Sobe o microsserviço de IA (profile=ai, desativado por padrão)
	docker compose --profile ai up -d --wait ai-service
