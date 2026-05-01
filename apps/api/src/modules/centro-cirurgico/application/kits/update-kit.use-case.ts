/**
 * `PATCH /v1/kits-cirurgicos/{uuid}` — atualiza nome/descrição/ativo e,
 * opcionalmente, troca todos os itens (delete + insert).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { UpdateKitDto } from '../../dto/create-kit.dto';
import type { KitResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentKit } from './kit.presenter';

@Injectable()
export class UpdateKitUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(uuid: string, dto: UpdateKitDto): Promise<KitResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('UpdateKitUseCase requires a request context.');
    }

    const kit = await this.repo.findKitByUuid(uuid);
    if (kit === null) {
      throw new NotFoundException({
        code: 'KIT_NOT_FOUND',
        message: 'Kit cirúrgico não encontrado.',
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
      await this.repo.deleteKitItens(kit.id);
      for (const it of dto.itens) {
        const proc = procs.get(it.procedimentoUuid);
        if (proc === undefined) continue;
        await this.repo.insertKitItem({
          tenantId: ctx.tenantId,
          kitId: kit.id,
          procedimentoId: proc.id,
          quantidade: it.quantidade,
          obrigatorio: it.obrigatorio ?? true,
        });
      }
    }

    await this.repo.updateKit({
      kitId: kit.id,
      nome: dto.nome,
      descricao: dto.descricao,
      descricaoTouched: dto.descricao !== undefined,
      ativo: dto.ativo,
    });

    await this.auditoria.record({
      tabela: 'kits_cirurgicos',
      registroId: kit.id,
      operacao: 'U',
      diff: {
        evento: 'kit.atualizado',
        campos: Object.keys(dto),
      },
      finalidade: 'kit.atualizado',
    });

    const updated = await this.repo.findKitByUuid(uuid);
    if (updated === null) {
      throw new Error('Kit atualizado não encontrado (RLS?).');
    }
    const itens = await this.repo.findKitItensByKitId(updated.id);
    return presentKit(updated, itens);
  }
}
