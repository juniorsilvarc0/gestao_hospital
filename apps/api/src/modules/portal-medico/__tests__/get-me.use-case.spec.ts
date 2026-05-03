/**
 * Testes unitários do `GetMeUseCase`. Mockamos `PortalMedicoRepository`
 * e `RepasseRepository`.
 */
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GetMeUseCase } from '../application/get-me.use-case';
import type { MedicoRequestContext } from '../infrastructure/medico-only.guard';

const CTX: MedicoRequestContext = {
  userId: 42n,
  tenantId: 1n,
  prestadorId: 99n,
};

const PRESTADOR_ROW = {
  id: 99n,
  uuid_externo: '00000000-0000-4000-8000-000000000099',
  nome: 'Dra. Maria Silva',
  tipo_conselho: 'CRM',
  numero_conselho: '123456',
  uf_conselho: 'SP',
  rqe: 'RQE-9876',
  cbo_principal: '225125',
  tipo_vinculo: 'COOPERADO',
  recebe_repasse: true,
  ativo: true,
};

function buildRepo(overrides: {
  prestador?: typeof PRESTADOR_ROW | null;
  permissoes?: string[];
  laudosPendentes?: number;
  cirurgiasHoje?: number;
  proximaConsulta?: ReturnType<typeof buildProximaConsulta> | null;
} = {}): {
  findPrestadorById: ReturnType<typeof vi.fn>;
  findPermissoesByUsuarioId: ReturnType<typeof vi.fn>;
  countLaudosPendentes: ReturnType<typeof vi.fn>;
  countCirurgiasRange: ReturnType<typeof vi.fn>;
  findProximaConsulta: ReturnType<typeof vi.fn>;
} {
  return {
    findPrestadorById: vi.fn(async () =>
      overrides.prestador === undefined ? PRESTADOR_ROW : overrides.prestador,
    ),
    findPermissoesByUsuarioId: vi.fn(async () =>
      overrides.permissoes ?? ['portal_medico:read', 'portal_medico:agenda'],
    ),
    countLaudosPendentes: vi.fn(async () => overrides.laudosPendentes ?? 3),
    countCirurgiasRange: vi.fn(async () => overrides.cirurgiasHoje ?? 1),
    findProximaConsulta: vi.fn(async () =>
      overrides.proximaConsulta === undefined
        ? buildProximaConsulta()
        : overrides.proximaConsulta,
    ),
  };
}

function buildProximaConsulta(): {
  agendamento_uuid: string;
  inicio: Date;
  paciente_uuid: string;
  paciente_nome: string;
  recurso_uuid: string;
  tipo: string;
  link_teleconsulta: string | null;
} {
  return {
    agendamento_uuid: '00000000-0000-4000-8000-00000000a000',
    inicio: new Date('2026-05-02T13:00:00Z'),
    paciente_uuid: '00000000-0000-4000-8000-00000000b000',
    paciente_nome: 'João Paciente',
    recurso_uuid: '00000000-0000-4000-8000-00000000c000',
    tipo: 'CONSULTA',
    link_teleconsulta: null,
  };
}

function buildRepasseRepo(rows: Array<Record<string, unknown>> = []): {
  listRepasses: ReturnType<typeof vi.fn>;
} {
  return {
    listRepasses: vi.fn(async () => ({ rows, total: rows.length })),
  };
}

describe('GetMeUseCase', () => {
  let repo: ReturnType<typeof buildRepo>;
  let repasseRepo: ReturnType<typeof buildRepasseRepo>;

  beforeEach(() => {
    repo = buildRepo();
    repasseRepo = buildRepasseRepo();
  });

  it('retorna prestador + permissões + resumo', async () => {
    const uc = new GetMeUseCase(repo as never, repasseRepo as never);
    const out = await uc.execute(CTX);

    expect(out.prestador.uuid).toBe(PRESTADOR_ROW.uuid_externo);
    expect(out.prestador.nome).toBe(PRESTADOR_ROW.nome);
    expect(out.prestador.conselhoSigla).toBe('CRM');
    expect(out.permissoes).toEqual([
      'portal_medico:read',
      'portal_medico:agenda',
    ]);
    expect(out.resumo.laudosPendentes).toBe(3);
    expect(out.resumo.cirurgiasHoje).toBe(1);
    expect(out.resumo.proximaConsulta).not.toBeNull();
    expect(out.resumo.proximaConsulta?.pacienteNome).toBe('João Paciente');
    expect(out.resumo.repasseUltimaCompetencia).toBeNull();
  });

  it('retorna repasse mais recente quando há repasses', async () => {
    const repasseRow = {
      id: 5n,
      uuid_externo: '00000000-0000-4000-8000-00000000d000',
      tenant_id: 1n,
      prestador_id: 99n,
      prestador_uuid: PRESTADOR_ROW.uuid_externo,
      prestador_nome: PRESTADOR_ROW.nome,
      conselho_sigla: 'CRM',
      conselho_numero: '123456',
      competencia: '2026-04',
      data_apuracao: new Date('2026-05-02T00:00:00Z'),
      data_conferencia: null,
      conferido_por: null,
      conferido_por_uuid: null,
      data_liberacao: null,
      liberado_por: null,
      liberado_por_uuid: null,
      data_pagamento: null,
      pago_por: null,
      pago_por_uuid: null,
      valor_bruto: '5000.0000',
      valor_creditos: '0.0000',
      valor_debitos: '0.0000',
      valor_descontos: '500.0000',
      valor_impostos: '0.0000',
      valor_liquido: '4500.0000',
      status: 'APURADO',
      cancelado_em: null,
      cancelado_motivo: null,
      observacao: null,
      qtd_itens: 12,
      created_at: new Date('2026-05-02T00:00:00Z'),
      updated_at: null,
    };
    repasseRepo = buildRepasseRepo([repasseRow]);
    const uc = new GetMeUseCase(repo as never, repasseRepo as never);
    const out = await uc.execute(CTX);
    expect(out.resumo.repasseUltimaCompetencia).toEqual({
      uuid: repasseRow.uuid_externo,
      competencia: '2026-04',
      status: 'APURADO',
      valorBruto: '5000.0000',
      valorLiquido: '4500.0000',
      qtdItens: 12,
    });
    expect(repasseRepo.listRepasses).toHaveBeenCalledWith({
      prestadorId: CTX.prestadorId,
      page: 1,
      pageSize: 1,
    });
  });

  it('404 quando prestador soft-deleted', async () => {
    repo = buildRepo({ prestador: null });
    const uc = new GetMeUseCase(repo as never, repasseRepo as never);
    await expect(uc.execute(CTX)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('proximaConsulta null quando não há agendamento futuro', async () => {
    repo = buildRepo({ proximaConsulta: null });
    const uc = new GetMeUseCase(repo as never, repasseRepo as never);
    const out = await uc.execute(CTX);
    expect(out.resumo.proximaConsulta).toBeNull();
  });
});
