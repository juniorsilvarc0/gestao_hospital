/**
 * Unit do `ApuracaoRunnerService`.
 *
 * Mockamos:
 *   - `RepasseRepository` inteiro (nenhuma SQL é exercitada);
 *   - `runWithTenant` apenas chama o callback (sem transação real);
 *   - `AuditoriaService` registra chamadas;
 *   - `EventEmitter2` registra emissões.
 *
 * Valida:
 *   1. Happy path: prestador sem repasse existente → cria + insere itens.
 *   2. Idempotência: mesma execução, repasse APURADO sem force → retorna
 *      ignorado.
 *   3. Idempotência com force: limpa itens + reapura.
 *   4. Repasse em status terminal (CONFERIDO/...) → ignorado mesmo com force.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApuracaoRunnerService } from '../application/apuracao/apuracao-runner.service';

const TENANT = '1';
const USER = '100';

function buildRunner() {
  const repo = {
    runWithTenant: vi.fn(async (_tenantId: bigint, fn: () => Promise<unknown>) => fn()),
    findPrestadorIdByUuid: vi.fn(),
    findPrestadoresElegiveis: vi.fn(),
    findRepasseExistente: vi.fn(),
    insertRepasse: vi.fn(),
    deleteRepasseItens: vi.fn(),
    resetRepasseParaReapuracao: vi.fn(),
    findItensParaRepasse: vi.fn(),
    findCriteriosVigentesEm: vi.fn(),
    insertRepasseItem: vi.fn(),
  };
  const auditoria = { record: vi.fn() };
  const events = { emit: vi.fn() };
  const prisma = {} as never;

  const runner = new ApuracaoRunnerService(
    repo as never,
    auditoria as never,
    events as never,
    prisma,
  );
  return { runner, repo, auditoria, events };
}

describe('ApuracaoRunnerService.run — happy path', () => {
  it('cria repasse e insere itens quando prestador casa critério', async () => {
    const { runner, repo, auditoria, events } = buildRunner();

    repo.findPrestadoresElegiveis.mockResolvedValue([
      {
        id: 7n,
        uuid_externo: '00000000-0000-4000-8000-000000000007',
        nome: 'Dr. Casa',
        tipo_vinculo: 'CORPO_CLINICO',
      },
    ]);
    repo.findRepasseExistente.mockResolvedValue(null);
    repo.insertRepasse.mockResolvedValue({
      id: 42n,
      uuidExterno: '00000000-0000-4000-8000-000000000042',
    });
    repo.findItensParaRepasse.mockResolvedValue([
      {
        conta_id: 100n,
        conta_item_id: 200n,
        cirurgia_id: null,
        procedimento_id: 300n,
        codigo_procedimento: '10101012',
        grupo_gasto: 'PROCEDIMENTO',
        funcao: 'EXECUTANTE',
        prestador_id: 7n,
        data_realizacao: new Date('2026-04-15T10:00:00Z'),
        valor_total: '1000.0000',
        valor_glosa: '0.0000',
        convenio_id: 5n,
      },
    ]);
    repo.findCriteriosVigentesEm.mockResolvedValue([
      {
        id: 555n,
        uuid_externo: '00000000-0000-4000-8000-000000000555',
        tenant_id: 1n,
        descricao: 'Padrão',
        vigencia_inicio: new Date('2026-01-01T00:00:00Z'),
        vigencia_fim: null,
        unidade_faturamento_id: null,
        unidade_atendimento_id: null,
        unidade_faturamento_uuid: null,
        unidade_atendimento_uuid: null,
        tipo_base_calculo: 'VALOR_TOTAL',
        momento_repasse: 'AO_FATURAR',
        dia_fechamento: null,
        prazo_dias: null,
        prioridade: 1,
        regras: {
          matchers: [{ prestador_id: 7, percentual: 70 }],
        },
        ativo: true,
        created_at: new Date(),
        updated_at: null,
      },
    ]);
    repo.insertRepasseItem.mockResolvedValue({
      id: 999n,
      uuidExterno: '00000000-0000-4000-8000-000000000999',
    });

    const result = await runner.run({
      tenantId: TENANT,
      userId: USER,
      correlationId: '11111111-1111-4111-8111-111111111111',
      competencia: '2026-04',
      prestadorUuids: null,
      forceReapuracao: false,
    });

    expect(result.prestadoresProcessados).toBe(1);
    expect(result.repassesCriados).toBe(1);
    expect(result.itensInseridos).toBe(1);
    expect(result.ignorados).toHaveLength(0);

    expect(repo.insertRepasse).toHaveBeenCalledOnce();
    expect(repo.insertRepasseItem).toHaveBeenCalledOnce();
    const insertItemArgs = repo.insertRepasseItem.mock.calls[0][0];
    expect(insertItemArgs.repasseId).toBe(42n);
    expect(insertItemArgs.criterioId).toBe(555n);
    expect(insertItemArgs.percentual).toBe('70.0000');
    expect(insertItemArgs.valorCalculado).toBe('700.0000');
    expect(insertItemArgs.criterioSnapshot).toMatchObject({
      uuid: '00000000-0000-4000-8000-000000000555',
      descricao: 'Padrão',
      tipo_base_calculo: 'VALOR_TOTAL',
    });

    expect(auditoria.record).toHaveBeenCalledOnce();
    expect(events.emit).toHaveBeenCalledWith(
      'repasse.apurado',
      expect.objectContaining({ competencia: '2026-04', itens: 1 }),
    );
  });
});

describe('ApuracaoRunnerService.run — idempotência', () => {
  it('repasse APURADO sem force → ignora', async () => {
    const { runner, repo } = buildRunner();
    repo.findPrestadoresElegiveis.mockResolvedValue([
      {
        id: 7n,
        uuid_externo: '00000000-0000-4000-8000-000000000007',
        nome: 'Dr X',
        tipo_vinculo: 'CORPO_CLINICO',
      },
    ]);
    repo.findRepasseExistente.mockResolvedValue({
      id: 42n,
      status: 'APURADO',
    });

    const result = await runner.run({
      tenantId: TENANT,
      userId: USER,
      correlationId: 'c1',
      competencia: '2026-04',
      prestadorUuids: null,
      forceReapuracao: false,
    });

    expect(result.repassesCriados).toBe(0);
    expect(result.repassesReapurados).toBe(0);
    expect(result.ignorados).toHaveLength(1);
    expect(result.ignorados[0].motivo).toMatch(/forceReapuracao/);
    expect(repo.insertRepasse).not.toHaveBeenCalled();
    expect(repo.deleteRepasseItens).not.toHaveBeenCalled();
  });

  it('repasse APURADO com force → limpa e reapura', async () => {
    const { runner, repo } = buildRunner();
    repo.findPrestadoresElegiveis.mockResolvedValue([
      {
        id: 7n,
        uuid_externo: '00000000-0000-4000-8000-000000000007',
        nome: 'Dr X',
        tipo_vinculo: 'CORPO_CLINICO',
      },
    ]);
    repo.findRepasseExistente.mockResolvedValue({
      id: 42n,
      status: 'APURADO',
    });
    repo.findItensParaRepasse.mockResolvedValue([]);

    const result = await runner.run({
      tenantId: TENANT,
      userId: USER,
      correlationId: 'c1',
      competencia: '2026-04',
      prestadorUuids: null,
      forceReapuracao: true,
    });

    expect(repo.deleteRepasseItens).toHaveBeenCalledWith(42n);
    expect(repo.resetRepasseParaReapuracao).toHaveBeenCalledWith(42n);
    expect(result.repassesReapurados).toBe(1);
    expect(result.itensInseridos).toBe(0);
    expect(result.ignorados).toHaveLength(1);
    expect(result.ignorados[0].motivo).toMatch(/nenhum item/);
  });

  it('repasse CONFERIDO não pode ser reapurado mesmo com force', async () => {
    const { runner, repo } = buildRunner();
    repo.findPrestadoresElegiveis.mockResolvedValue([
      {
        id: 7n,
        uuid_externo: '00000000-0000-4000-8000-000000000007',
        nome: 'Dr X',
        tipo_vinculo: 'CORPO_CLINICO',
      },
    ]);
    repo.findRepasseExistente.mockResolvedValue({
      id: 42n,
      status: 'CONFERIDO',
    });

    const result = await runner.run({
      tenantId: TENANT,
      userId: USER,
      correlationId: 'c1',
      competencia: '2026-04',
      prestadorUuids: null,
      forceReapuracao: true,
    });

    expect(result.ignorados).toHaveLength(1);
    expect(result.ignorados[0].motivo).toMatch(/CONFERIDO/);
    expect(repo.deleteRepasseItens).not.toHaveBeenCalled();
    expect(repo.insertRepasse).not.toHaveBeenCalled();
  });

  it('zero prestadores elegíveis → resultado vazio', async () => {
    const { runner, repo } = buildRunner();
    repo.findPrestadoresElegiveis.mockResolvedValue([]);

    const result = await runner.run({
      tenantId: TENANT,
      userId: USER,
      correlationId: 'c1',
      competencia: '2026-04',
      prestadorUuids: null,
      forceReapuracao: false,
    });

    expect(result.prestadoresProcessados).toBe(0);
    expect(result.repassesCriados).toBe(0);
    expect(repo.insertRepasse).not.toHaveBeenCalled();
  });
});
