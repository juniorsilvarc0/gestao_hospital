/**
 * `POST /v1/cme/lotes` — cria lote de esterilização.
 *
 * Lote nasce em `EM_PROCESSAMENTO`. Indicador biológico fica nulo até a
 * leitura final (RN-CME-01) — só então o lote pode ser LIBERADO via
 * `POST /liberar`.
 */
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import type { CreateLoteCmeDto } from '../../dto/create-lote.dto';
import type { LoteResponse } from '../../dto/responses';
import { CmeRepository } from '../../infrastructure/cme.repository';
import { presentLote } from './lote.presenter';

@Injectable()
export class CreateLoteUseCase {
  constructor(
    private readonly repo: CmeRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(dto: CreateLoteCmeDto): Promise<LoteResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('CreateLoteUseCase requires request context.');
    }

    const responsavelId = await this.repo.findPrestadorIdByUuid(
      dto.responsavelUuid,
    );
    if (responsavelId === null) {
      throw new NotFoundException({
        code: 'RESPONSAVEL_NOT_FOUND',
        message: 'Prestador responsável não encontrado.',
      });
    }

    const exists = await this.repo.existsLoteByNumero(ctx.tenantId, dto.numero);
    if (exists) {
      throw new ConflictException({
        code: 'CME_LOTE_DUPLICADO',
        message: `Já existe um lote com número '${dto.numero}'.`,
      });
    }

    const inserted = await this.repo.insertLote({
      tenantId: ctx.tenantId,
      numero: dto.numero,
      metodo: dto.metodo,
      dataEsterilizacao: dto.dataEsterilizacao,
      validade: dto.validade,
      responsavelId,
      indicadorQuimicoOk: dto.indicadorQuimicoOk ?? null,
      observacao: dto.observacao ?? null,
      userId: ctx.userId,
    });

    await this.auditoria.record({
      tabela: 'cme_lotes',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'cme.lote_criado',
        numero: dto.numero,
        metodo: dto.metodo,
        validade: dto.validade,
      },
      finalidade: 'cme.lote_criado',
    });

    const row = await this.repo.findLoteByUuid(inserted.uuidExterno);
    if (row === null) {
      throw new Error('Lote criado não encontrado (RLS?).');
    }
    return presentLote(row);
  }
}
