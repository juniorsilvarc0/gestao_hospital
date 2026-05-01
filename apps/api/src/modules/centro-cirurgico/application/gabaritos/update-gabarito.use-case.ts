/**
 * `PATCH /v1/cadernos-gabaritos/{uuid}` — ativa/desativa, atualiza
 * observação e/ou substitui o conjunto de itens (delete + insert).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { UpdateGabaritoDto } from '../../dto/create-gabarito.dto';
import type { GabaritoResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentGabarito } from './gabarito.presenter';

@Injectable()
export class UpdateGabaritoUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    uuid: string,
    dto: UpdateGabaritoDto,
  ): Promise<GabaritoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('UpdateGabaritoUseCase requires a request context.');
    }

    const gab = await this.repo.findGabaritoByUuid(uuid);
    if (gab === null) {
      throw new NotFoundException({
        code: 'GABARITO_NOT_FOUND',
        message: 'Caderno de gabarito não encontrado.',
      });
    }

    if (dto.itens !== undefined) {
      const procUuids = dto.itens.map((it) => it.procedimentoUuid);
      const procs = await this.repo.findProcedimentosByUuids(procUuids);
      const missing = procUuids.filter((u) => !procs.has(u));
      if (missing.length > 0) {
        throw new NotFoundException({
          code: 'PROCEDIMENTO_NOT_FOUND',
          message: `Procedimentos não encontrados: ${missing.join(', ')}`,
        });
      }
      await this.repo.deleteGabaritoItens(gab.id);
      for (const it of dto.itens) {
        const proc = procs.get(it.procedimentoUuid);
        if (proc === undefined) continue;
        await this.repo.insertGabaritoItem({
          tenantId: ctx.tenantId,
          cadernoId: gab.id,
          procedimentoId: proc.id,
          quantidadePadrao: it.quantidadePadrao,
          obrigatorio: it.obrigatorio ?? false,
          observacao: it.observacao ?? null,
        });
      }
    }

    await this.repo.updateGabarito({
      cadernoId: gab.id,
      ativo: dto.ativo,
      observacao: dto.observacao,
      observacaoTouched: dto.observacao !== undefined,
    });

    await this.auditoria.record({
      tabela: 'cadernos_gabaritos',
      registroId: gab.id,
      operacao: 'U',
      diff: {
        evento: 'gabarito.atualizado',
        campos: Object.keys(dto),
      },
      finalidade: 'gabarito.atualizado',
    });

    const updated = await this.repo.findGabaritoByUuid(uuid);
    if (updated === null) {
      throw new Error('Gabarito atualizado não encontrado (RLS?).');
    }
    const itens = await this.repo.findGabaritoItensByCadernoId(updated.id);
    return presentGabarito(updated, itens);
  }
}
