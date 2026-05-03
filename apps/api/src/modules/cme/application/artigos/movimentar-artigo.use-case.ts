/**
 * `POST /v1/cme/artigos/{uuid}/movimentar` — registra movimentação.
 *
 * Valida transição (RN-CME-02), insere `cme_movimentacoes` (a trigger
 * DB atualiza `etapa_atual` + `ultima_movimentacao` no artigo) e, se
 * destino = `EM_USO`, grava `paciente_id`/`cirurgia_id` (RN-CME-05).
 *
 * Para destino `RECEPCAO` (volta de `EM_USO`), limpa `paciente_id`/
 * `cirurgia_id` para o próximo ciclo.
 *
 * Emite evento `cme.artigo_movimentado`.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../../common/context/request-context';
import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { validateMovimentacao } from '../../domain/artigo';
import type { CmeEtapa } from '../../domain/etapa-transicoes';
import type { CmeLoteStatus } from '../../domain/lote';
import type { MovimentarArtigoDto } from '../../dto/movimentar-artigo.dto';
import type { ArtigoResponse } from '../../dto/responses';
import { CmeRepository } from '../../infrastructure/cme.repository';
import { presentArtigo } from './artigo.presenter';

@Injectable()
export class MovimentarArtigoUseCase {
  constructor(
    private readonly repo: CmeRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    artigoUuid: string,
    dto: MovimentarArtigoDto,
  ): Promise<ArtigoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('MovimentarArtigoUseCase requires request context.');
    }

    const artigo = await this.repo.findArtigoByUuid(artigoUuid);
    if (artigo === null) {
      throw new NotFoundException({
        code: 'CME_ARTIGO_NOT_FOUND',
        message: 'Artigo não encontrado.',
      });
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

    // RN-CME-02 — valida transição lógica + invariantes do lote.
    const erro = validateMovimentacao({
      etapaAtual: artigo.etapa_atual as CmeEtapa,
      etapaDestino: dto.etapaDestino,
      loteStatus: artigo.lote_status as CmeLoteStatus,
      pacienteUuid: dto.pacienteUuid,
    });
    if (erro !== null) {
      throw new UnprocessableEntityException({
        code: 'CME_MOVIMENTACAO_INVALIDA',
        message: erro,
      });
    }

    // Resolver paciente/cirurgia, se EM_USO.
    let pacienteId: bigint | null = null;
    let cirurgiaId: bigint | null = null;
    if (dto.etapaDestino === 'EM_USO') {
      // pacienteUuid já foi exigido pela validação acima.
      pacienteId = await this.repo.findPacienteIdByUuid(dto.pacienteUuid!);
      if (pacienteId === null) {
        throw new NotFoundException({
          code: 'PACIENTE_NOT_FOUND',
          message: 'Paciente não encontrado.',
        });
      }
      if (dto.cirurgiaUuid !== undefined) {
        cirurgiaId = await this.repo.findCirurgiaIdByUuid(dto.cirurgiaUuid);
        if (cirurgiaId === null) {
          throw new NotFoundException({
            code: 'CIRURGIA_NOT_FOUND',
            message: 'Cirurgia não encontrada.',
          });
        }
      }
    }

    // Inserir a movimentação — trigger atualiza etapa_atual + ultima_movimentacao.
    const inserted = await this.repo.insertMovimentacao({
      tenantId: ctx.tenantId,
      artigoId: artigo.id,
      etapaOrigem: artigo.etapa_atual as CmeEtapa,
      etapaDestino: dto.etapaDestino,
      responsavelId,
      observacao: dto.observacao ?? null,
    });

    // RN-CME-05: se foi para EM_USO, grava paciente/cirurgia no artigo.
    // Se voltou para RECEPCAO (reprocessar) ou foi DESCARTADO, limpa.
    if (dto.etapaDestino === 'EM_USO') {
      await this.repo.updateArtigoUso({
        id: artigo.id,
        pacienteId,
        cirurgiaId,
      });
    } else if (
      dto.etapaDestino === 'RECEPCAO' ||
      dto.etapaDestino === 'DESCARTADO'
    ) {
      await this.repo.clearArtigoUso(artigo.id);
    }

    await this.auditoria.record({
      tabela: 'cme_movimentacoes',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'cme.artigo_movimentado',
        artigo_uuid: artigo.uuid_externo,
        codigo_artigo: artigo.codigo_artigo,
        etapa_origem: artigo.etapa_atual,
        etapa_destino: dto.etapaDestino,
      },
      finalidade: 'cme.artigo_movimentado',
    });

    this.events.emit('cme.artigo_movimentado', {
      artigoUuid: artigo.uuid_externo,
      etapaOrigem: artigo.etapa_atual,
      etapaDestino: dto.etapaDestino,
    });

    const updated = await this.repo.findArtigoByUuid(artigoUuid);
    if (updated === null) {
      throw new Error('Artigo pós-movimentação não encontrado (RLS?).');
    }
    return presentArtigo(updated);
  }
}
