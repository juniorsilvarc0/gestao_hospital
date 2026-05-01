/**
 * Unit do `ListarFilaUseCase`.
 *
 * O SQL faz a ordenação Manchester. Aqui validamos que:
 *   - 404 quando setor não existe;
 *   - presenta os rows na ordem que o repository devolveu (a query
 *     SQL é responsável pela ordenação real).
 */
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ListarFilaUseCase } from '../application/listar-fila.use-case';

describe('ListarFilaUseCase', () => {
  let repo: {
    findSetorIdByUuid: ReturnType<typeof vi.fn>;
    listFila: ReturnType<typeof vi.fn>;
  };
  let useCase: ListarFilaUseCase;

  beforeEach(() => {
    repo = {
      findSetorIdByUuid: vi.fn(),
      listFila: vi.fn(),
    };
    useCase = new ListarFilaUseCase(repo as never);
  });

  it('404 setor inexistente', async () => {
    repo.findSetorIdByUuid.mockResolvedValue(null);
    await expect(
      useCase.execute({
        setorUuid: '00000000-0000-4000-8000-000000000003',
        limit: 50,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('retorna fila ordenada (preserva ordem do repo)', async () => {
    repo.findSetorIdByUuid.mockResolvedValue(30n);
    repo.listFila.mockResolvedValue([
      {
        uuid_externo: 'a1',
        numero_atendimento: '2026-1',
        paciente_uuid: 'p1',
        paciente_nome: 'Maria',
        classificacao_risco: 'VERMELHO',
        status: 'EM_ATENDIMENTO',
        data_hora_entrada: new Date('2026-04-28T10:00:00Z'),
        tempo_espera_segundos: 600,
      },
      {
        uuid_externo: 'a2',
        numero_atendimento: '2026-2',
        paciente_uuid: 'p2',
        paciente_nome: 'João',
        classificacao_risco: 'AMARELO',
        status: 'EM_ATENDIMENTO',
        data_hora_entrada: new Date('2026-04-28T09:50:00Z'),
        tempo_espera_segundos: 1200,
      },
      {
        uuid_externo: 'a3',
        numero_atendimento: '2026-3',
        paciente_uuid: 'p3',
        paciente_nome: 'José',
        classificacao_risco: null,
        status: 'EM_ESPERA',
        data_hora_entrada: new Date('2026-04-28T08:00:00Z'),
        tempo_espera_segundos: 7200,
      },
    ]);

    const result = await useCase.execute({
      setorUuid: '00000000-0000-4000-8000-000000000003',
      limit: 50,
    });
    expect(result.data).toHaveLength(3);
    expect(result.data[0].classificacaoRisco).toBe('VERMELHO');
    expect(result.data[2].classificacaoRisco).toBeNull();
    expect(result.data[2].tempoEsperaSegundos).toBe(7200);
  });
});
