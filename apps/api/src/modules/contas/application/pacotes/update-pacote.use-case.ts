/**
 * `PATCH /v1/pacotes/{uuid}` — atualização parcial.
 *
 * Quando `itens` é informado, faz substituição completa: deleta os itens
 * existentes e insere os novos (mais simples e seguro do que diff).
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { UpdatePacoteDto } from '../../dto/create-pacote.dto';
import type { PacoteResponse } from '../../dto/responses';
import { PacotesRepository } from '../../infrastructure/pacotes.repository';
import { presentPacote } from './pacote.presenter';

@Injectable()
export class UpdatePacoteUseCase {
  constructor(
    private readonly repo: PacotesRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string, dto: UpdatePacoteDto): Promise<PacoteResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('UpdatePacoteUseCase requires request context.');
    }

    const existing = await this.repo.findPacoteByUuid(uuid);
    if (existing === null) {
      throw new NotFoundException({
        code: 'PACOTE_NOT_FOUND',
        message: 'Pacote não encontrado.',
      });
    }

    await this.repo.updatePacote({
      pacoteId: existing.id,
      nome: dto.nome,
      descricao: dto.descricao,
      descricaoTouched: 'descricao' in dto,
      valorTotal: dto.valorTotal !== undefined ? dto.valorTotal.toFixed(4) : undefined,
      vigenciaInicio: dto.vigenciaInicio,
      vigenciaFim: dto.vigenciaFim,
      vigenciaFimTouched: 'vigenciaFim' in dto,
      ativo: dto.ativo,
    });

    if (dto.itens !== undefined) {
      const procUuids = dto.itens.map((i) => i.procedimentoUuid);
      const procMap = await this.repo.findProcedimentosByUuids(procUuids);
      const naoEncontrados = procUuids.filter((u) => !procMap.has(u));
      if (naoEncontrados.length > 0) {
        throw new UnprocessableEntityException({
          code: 'PROCEDIMENTO_ITEM_INVALIDO',
          message: `Procedimentos não encontrados: ${naoEncontrados.join(', ')}.`,
        });
      }
      await this.repo.deletePacoteItens(existing.id);
      for (const it of dto.itens) {
        const proc = procMap.get(it.procedimentoUuid);
        if (proc === undefined) continue;
        await this.repo.insertPacoteItem({
          tenantId: ctx.tenantId,
          pacoteId: existing.id,
          procedimentoId: proc.id,
          quantidade: it.quantidade.toString(),
          faixaInicio: it.faixaInicio ?? null,
          faixaFim: it.faixaFim ?? null,
        });
      }
    }

    await this.auditoria.record({
      tabela: 'pacotes',
      registroId: existing.id,
      operacao: 'U',
      diff: {
        evento: 'pacote.atualizado',
        campos: Object.keys(dto),
      },
      finalidade: 'pacote.atualizado',
    });

    const row = await this.repo.findPacoteByUuid(uuid);
    if (row === null) {
      throw new Error('Pacote após update não encontrado (RLS?).');
    }
    const itens = await this.repo.findItensByPacoteId(row.id);
    return presentPacote(row, itens);
  }
}
