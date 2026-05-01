/**
 * Unit do `GetMapaSalasUseCase`.
 *
 * Cobre:
 *   - Agrupamento por sala (todas as salas voltam, mesmo as vazias).
 *   - Cirurgias ordenadas por data_hora_agendada.
 *   - Cálculo de horaFim previsto (agendada + duração).
 *   - 400 quando data inválida.
 */
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { GetMapaSalasUseCase } from '../application/mapa/get-mapa-salas.use-case';

describe('GetMapaSalasUseCase', () => {
  function makeRow(args: {
    id: bigint;
    salaId: bigint;
    salaUuid: string;
    salaNome: string;
    agendada: string;
    duracao: number;
    status?: string;
    pacienteNome?: string;
  }) {
    return {
      id: args.id,
      uuid_externo: 'cir-' + args.id.toString(),
      tenant_id: 1n,
      atendimento_id: 10n,
      atendimento_uuid: 'atend-1',
      paciente_id: 20n,
      paciente_uuid: 'pac-1',
      paciente_nome: args.pacienteNome ?? 'Paciente',
      procedimento_principal_id: 100n,
      procedimento_principal_uuid: 'proc-1',
      procedimento_principal_nome: 'Apendicectomia',
      procedimentos_secundarios: null,
      sala_id: args.salaId,
      sala_uuid: args.salaUuid,
      sala_nome: args.salaNome,
      setor_id: 70n,
      setor_uuid: 'setor-1',
      data_hora_agendada: new Date(args.agendada),
      duracao_estimada_minutos: args.duracao,
      data_hora_inicio: null,
      data_hora_fim: null,
      cirurgiao_id: 40n,
      cirurgiao_uuid: 'cir-prest-1',
      cirurgiao_nome: 'Dr',
      tipo_anestesia: 'GERAL',
      classificacao_cirurgia: 'ELETIVA' as const,
      exige_autorizacao_convenio: false,
      kit_cirurgico_id: null,
      kit_cirurgico_uuid: null,
      caderno_gabarito_id: null,
      caderno_gabarito_uuid: null,
      ficha_cirurgica: null,
      ficha_anestesica: null,
      intercorrencias: null,
      status: (args.status ?? 'AGENDADA') as never,
      conta_id: null,
      conta_uuid: null,
      opme_solicitada: null,
      opme_autorizada: null,
      opme_utilizada: null,
      cancelamento_motivo: null,
      cancelado_em: null,
    };
  }

  it('agrupa por sala e calcula horaFim prevista', async () => {
    const repo = {
      listMapaSalas: vi.fn(async () => ({
        salas: [
          {
            sala_id: 1n,
            sala_uuid: 'sala-1',
            sala_nome: 'Sala A',
            setor: 'Centro Cirúrgico',
          },
          {
            sala_id: 2n,
            sala_uuid: 'sala-2',
            sala_nome: 'Sala B',
            setor: 'Centro Cirúrgico',
          },
        ],
        cirurgias: [
          makeRow({
            id: 10n,
            salaId: 1n,
            salaUuid: 'sala-1',
            salaNome: 'Sala A',
            agendada: '2026-05-02T08:00:00Z',
            duracao: 60,
          }),
          makeRow({
            id: 11n,
            salaId: 1n,
            salaUuid: 'sala-1',
            salaNome: 'Sala A',
            agendada: '2026-05-02T10:00:00Z',
            duracao: 45,
          }),
        ],
      })),
    };

    const uc = new GetMapaSalasUseCase(repo as never);
    const out = await uc.execute({ data: '2026-05-02' });
    expect(out.data).toBe('2026-05-02');
    expect(out.salas).toHaveLength(2);

    const salaA = out.salas.find((s) => s.salaUuid === 'sala-1');
    const salaB = out.salas.find((s) => s.salaUuid === 'sala-2');
    expect(salaA?.cirurgias).toHaveLength(2);
    expect(salaB?.cirurgias).toHaveLength(0);

    // horaFim = agendada + duracao (60min)
    expect(salaA?.cirurgias[0].horaInicio).toBe('2026-05-02T08:00:00.000Z');
    expect(salaA?.cirurgias[0].horaFim).toBe('2026-05-02T09:00:00.000Z');

    // 2ª cirurgia: 10:00 + 45min
    expect(salaA?.cirurgias[1].horaFim).toBe('2026-05-02T10:45:00.000Z');
  });

  it('data inválida → 400', async () => {
    const repo = { listMapaSalas: vi.fn() };
    const uc = new GetMapaSalasUseCase(repo as never);
    await expect(uc.execute({ data: 'invalid' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('sem data, default = hoje (UTC)', async () => {
    const repo = {
      listMapaSalas: vi.fn(async () => ({ salas: [], cirurgias: [] })),
    };
    const uc = new GetMapaSalasUseCase(repo as never);
    const out = await uc.execute({});
    expect(/^\d{4}-\d{2}-\d{2}$/.test(out.data)).toBe(true);
    expect(repo.listMapaSalas).toHaveBeenCalledOnce();
  });
});
