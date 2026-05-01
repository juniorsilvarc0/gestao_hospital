/**
 * `POST /v1/kits-cirurgicos` — cadastra novo kit cirúrgico.
 *
 * Resolve UUIDs de procedimento → IDs e insere itens. `codigo` é único
 * por tenant (constraint DB `uq_kits`).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { CreateKitDto } from '../../dto/create-kit.dto';
import type { KitResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentKit } from './kit.presenter';

@Injectable()
export class CreateKitUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(dto: CreateKitDto): Promise<KitResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateKitUseCase requires a request context.');
    }

    // Resolve procedimentos.
    const procUuids = dto.itens.map((it) => it.procedimentoUuid);
    const procs = await this.repo.findProcedimentosByUuids(procUuids);
    const missing = procUuids.filter((u) => !procs.has(u));
    if (missing.length > 0) {
      throw new NotFoundException({
        code: 'PROCEDIMENTO_NOT_FOUND',
        message: `Procedimentos não encontrados: ${missing.join(', ')}`,
      });
    }

    let inserted: { id: bigint; uuidExterno: string };
    try {
      inserted = await this.repo.insertKit({
        tenantId: ctx.tenantId,
        codigo: dto.codigo,
        nome: dto.nome,
        descricao: dto.descricao ?? null,
        ativo: dto.ativo ?? true,
        userId: ctx.userId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('uq_kits') ||
        msg.includes('duplicate key value')
      ) {
        throw new ConflictException({
          code: 'KIT_CODIGO_DUPLICADO',
          message: `Já existe um kit com código '${dto.codigo}'.`,
        });
      }
      throw err;
    }

    for (const it of dto.itens) {
      const proc = procs.get(it.procedimentoUuid);
      if (proc === undefined) continue;
      await this.repo.insertKitItem({
        tenantId: ctx.tenantId,
        kitId: inserted.id,
        procedimentoId: proc.id,
        quantidade: it.quantidade,
        obrigatorio: it.obrigatorio ?? true,
      });
    }

    await this.auditoria.record({
      tabela: 'kits_cirurgicos',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'kit.criado',
        codigo: dto.codigo,
        n_itens: dto.itens.length,
      },
      finalidade: 'kit.criado',
    });

    const kitRow = await this.repo.findKitByUuid(inserted.uuidExterno);
    if (kitRow === null) {
      throw new Error('Kit recém-criado não encontrado (RLS?).');
    }
    const itensRows = await this.repo.findKitItensByKitId(kitRow.id);
    return presentKit(kitRow, itensRows);
  }
}
