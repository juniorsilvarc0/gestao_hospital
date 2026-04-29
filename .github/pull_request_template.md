## RN tratada

<!-- Identifique a regra de negócio implementada (formato RN-XXX-NN, ver docs/03-regras-negocio.md). -->
RN-XXX-NN

## Mudança

<!-- Descreva o que muda e por quê. Linke a issue se houver. -->

## Schema?

- [ ] Não toca schema
- [ ] Toca schema → DB.md atualizado nesta PR

## Testes

<!-- Lista dos testes adicionados/modificados nesta PR. Coverage mínima: unit 80%, integration 70%. -->

-
-

## Validação Docker

- [ ] `docker compose down -v && make up && make migrate && make seed && make test` passou em diretório limpo
- [ ] `docker compose ps` todos `healthy`

## Checklist

- [ ] Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)
- [ ] Sem `console.log` / `TODO` / `FIXME` críticos
- [ ] Sem PHI em logs (CPF, CNS, conteúdo de prontuário)
- [ ] CI verde (lint, typecheck, test, migrations status, build)
