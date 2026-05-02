/**
 * `POST /v1/glosas` — cria glosa manual (RN-GLO-02).
 *
 * Exige `motivo`, `valor_glosado` e responsável (capturado do contexto do
 * usuário). Convênio é resolvido a partir da conta. Prazo de recurso
 * default = data_glosa + 30 dias (RN-GLO-03).
 *
 * Emite evento `glosa.recebida` via EventEmitter2 — Fase 9 consome para
 * disparar reapuração de repasse.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { CreateGlosaManualDto } from '../dto/create-glosa-manual.dto';
import type { GlosaResponse } from '../dto/responses';
import { defaultPrazoRecurso } from '../domain/glosa';
import { GlosasRepository } from '../infrastructure/glosas.repository';
import { presentGlosa } from './glosa.presenter';

@Injectable()
export class CreateGlosaManualUseCase {
  constructor(
    private readonly repo: GlosasRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(dto: CreateGlosaManualDto): Promise<GlosaResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateGlosaManualUseCase requires request context.');
    }

    const conta = await this.repo.findContaByUuid(dto.contaUuid);
    if (conta === null) {
      throw new NotFoundException({
        code: 'CONTA_NOT_FOUND',
        message: 'Conta não encontrada.',
      });
    }
    if (conta.convenioId === null) {
      throw new UnprocessableEntityException({
        code: 'CONTA_SEM_CONVENIO',
        message:
          'Glosa só é aplicável a contas com convênio (PARTICULAR/SUS não geram glosa TISS).',
      });
    }

    let contaItemId: bigint | null = null;
    if (dto.contaItemUuid !== undefined) {
      const item = await this.repo.findContaItemByUuid(dto.contaItemUuid);
      if (item === null || item.contaId !== conta.id) {
        throw new UnprocessableEntityException({
          code: 'CONTA_ITEM_INVALIDO',
          message: 'Item informado não pertence à conta.',
        });
      }
      contaItemId = item.id;
    }

    let guiaTissId: bigint | null = null;
    if (dto.guiaTissUuid !== undefined) {
      const guia = await this.repo.findGuiaTissByUuid(dto.guiaTissUuid);
      if (guia === null || guia.contaId !== conta.id) {
        throw new UnprocessableEntityException({
          code: 'GUIA_TISS_INVALIDA',
          message: 'Guia TISS informada não pertence à conta.',
        });
      }
      guiaTissId = guia.id;
    }

    const prazoRecurso = dto.prazoRecurso ?? defaultPrazoRecurso(dto.dataGlosa);

    const inserted = await this.repo.insertGlosa({
      tenantId: ctx.tenantId,
      contaId: conta.id,
      contaItemId,
      guiaTissId,
      convenioId: conta.convenioId,
      motivo: dto.motivo,
      codigoGlosaTiss: dto.codigoGlosaTiss ?? null,
      valorGlosado: dto.valorGlosado.toFixed(4),
      dataGlosa: dto.dataGlosa,
      origem: 'MANUAL',
      prazoRecurso,
      userId: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'glosas',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'glosa.criada_manual',
        conta_id: conta.id.toString(),
        valor_glosado: dto.valorGlosado.toFixed(4),
        codigo_glosa_tiss: dto.codigoGlosaTiss ?? null,
      },
      finalidade: 'glosa.criada_manual',
    });

    this.events.emit('glosa.recebida', {
      glosaUuid: inserted.uuidExterno,
      contaUuid: dto.contaUuid,
      origem: 'MANUAL',
      valorGlosado: dto.valorGlosado.toFixed(4),
    });

    const row = await this.repo.findGlosaByUuid(inserted.uuidExterno);
    if (row === null) {
      throw new Error('Glosa criada não encontrada (RLS?).');
    }
    return presentGlosa(row);
  }
}
