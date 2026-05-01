/**
 * `POST /v1/cadernos-gabaritos` — cadastra novo gabarito.
 *
 * `(procedimento_principal_id, cirurgiao_id, versao)` é único pelo DB
 * (`uq_cg`).
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { CreateGabaritoDto } from '../../dto/create-gabarito.dto';
import type { GabaritoResponse } from '../../dto/responses';
import { CentroCirurgicoRepository } from '../../infrastructure/centro-cirurgico.repository';
import { presentGabarito } from './gabarito.presenter';

@Injectable()
export class CreateGabaritoUseCase {
  constructor(
    private readonly repo: CentroCirurgicoRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(dto: CreateGabaritoDto): Promise<GabaritoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateGabaritoUseCase requires a request context.');
    }

    // Resolve procedimento principal.
    const procPrincipalMap = await this.repo.findProcedimentosByUuids([
      dto.procedimentoPrincipalUuid,
    ]);
    const procPrincipal = procPrincipalMap.get(dto.procedimentoPrincipalUuid);
    if (procPrincipal === undefined) {
      throw new NotFoundException({
        code: 'PROCEDIMENTO_NOT_FOUND',
        message: 'Procedimento principal não encontrado.',
      });
    }

    let cirurgiaoId: bigint | null = null;
    if (dto.cirurgiaoUuid !== undefined) {
      const id = await this.repo.findPrestadorIdByUuid(dto.cirurgiaoUuid);
      if (id === null) {
        throw new NotFoundException({
          code: 'CIRURGIAO_NOT_FOUND',
          message: 'Cirurgião não encontrado.',
        });
      }
      cirurgiaoId = id;
    }

    // Resolve itens.
    const itemUuids = dto.itens.map((it) => it.procedimentoUuid);
    const procs = await this.repo.findProcedimentosByUuids(itemUuids);
    const missing = itemUuids.filter((u) => !procs.has(u));
    if (missing.length > 0) {
      throw new NotFoundException({
        code: 'PROCEDIMENTO_NOT_FOUND',
        message: `Procedimentos não encontrados: ${missing.join(', ')}`,
      });
    }

    let inserted: { id: bigint; uuidExterno: string };
    try {
      inserted = await this.repo.insertGabarito({
        tenantId: ctx.tenantId,
        procedimentoPrincipalId: procPrincipal.id,
        cirurgiaoId,
        versao: dto.versao ?? 1,
        ativo: dto.ativo ?? true,
        observacao: dto.observacao ?? null,
        userId: ctx.userId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('uq_cg') || msg.includes('duplicate key value')) {
        throw new ConflictException({
          code: 'GABARITO_DUPLICADO',
          message:
            'Já existe gabarito com a mesma combinação procedimento+cirurgião+versão.',
        });
      }
      throw err;
    }

    for (const it of dto.itens) {
      const proc = procs.get(it.procedimentoUuid);
      if (proc === undefined) continue;
      await this.repo.insertGabaritoItem({
        tenantId: ctx.tenantId,
        cadernoId: inserted.id,
        procedimentoId: proc.id,
        quantidadePadrao: it.quantidadePadrao,
        obrigatorio: it.obrigatorio ?? false,
        observacao: it.observacao ?? null,
      });
    }

    await this.auditoria.record({
      tabela: 'cadernos_gabaritos',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'gabarito.criado',
        procedimento_principal_id: procPrincipal.id.toString(),
        cirurgiao_id: cirurgiaoId?.toString() ?? null,
        versao: dto.versao ?? 1,
        n_itens: dto.itens.length,
      },
      finalidade: 'gabarito.criado',
    });

    const row = await this.repo.findGabaritoByUuid(inserted.uuidExterno);
    if (row === null) {
      throw new Error('Gabarito recém-criado não encontrado (RLS?).');
    }
    const itens = await this.repo.findGabaritoItensByCadernoId(row.id);
    return presentGabarito(row, itens);
  }
}
