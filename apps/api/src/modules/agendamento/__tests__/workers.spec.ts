/**
 * Workers `ConfirmacaoWorker` e `NoShowWorker` — TODO de cobertura.
 *
 * Por que `describe.skip` em vez de unit test mockando tudo?
 *
 *   1. Os workers fazem muito pouco em si — toda a lógica está em
 *      `$queryRawUnsafe` SQL contra Postgres real (RLS via SET LOCAL,
 *      UPDATE com RETURNING, INSERT em `auditoria_eventos`). Mockar
 *      isso vira tautologia: "espera-se que o worker chame
 *      executeRaw com o SQL X que escrevi" — mudança de SQL passa
 *      pelo teste.
 *
 *   2. O valor real está em **integration** com testcontainers
 *      Postgres (vitest-config menciona, mas a infra ainda não está
 *      pronta — Trilha C da Fase 1 deixou como placeholder). Quando
 *      essa infra existir, este `describe.skip` vira o spec real:
 *
 *        - seed `tenants` + `pacientes` + `agendamentos` em janelas
 *          [now+23h, now+25h] e [now-1h, now-31min];
 *        - dispara `worker.process({ id: 'test' } as Job)`;
 *        - asserta `agendamentos.status` mudou para `FALTOU` /
 *          `auditoria_eventos` recebeu linha.
 *
 *   3. Cron scheduler — testar é trivial (basta mockar a queue) mas
 *      não agrega cobertura semântica; o que importa é que o repeat
 *      esteja registrado. Validamos manualmente nos logs do boot.
 *
 * Quando esses testes virarem reais, transformar `describe.skip` em
 * `describe` e remover este TODO.
 */
import { describe, it } from 'vitest';

describe.skip('ConfirmacaoWorker (TODO: integration testcontainers)', () => {
  it('marca notificações para agendamentos em [now+23h, now+25h]', () => {
    // Pré-requisito: testcontainers Postgres habilitado.
  });

  it('respeita isolamento por tenant (não notifica outros tenants)', () => {
    // Pré-requisito: testcontainers Postgres habilitado.
  });

  it('grava auditoria_eventos com canal usado', () => {
    // Pré-requisito: testcontainers Postgres habilitado.
  });
});

describe.skip('NoShowWorker (TODO: integration testcontainers)', () => {
  it('marca FALTOU para agendamentos com inicio < now - 30min', () => {
    // Pré-requisito: testcontainers Postgres habilitado.
  });

  it('não marca quem já fez check-in', () => {
    // Pré-requisito: testcontainers Postgres habilitado.
  });

  it('idempotente: 2 execuções produzem o mesmo resultado', () => {
    // Pré-requisito: testcontainers Postgres habilitado.
  });
});
