/**
 * `POST /v1/resultados-exame` (RN-LAB-03).
 *
 * Fluxo:
 *   1. Resolve item da solicitação por UUID.
 *   2. Valida que pelo menos um campo de conteúdo está preenchido
 *      (`laudoEstruturado` | `laudoTexto` | `laudoPdfUrl`). Sem isso,
 *      um "resultado" não tem dado clínico — recusamos.
 *   3. Verifica que o item ainda não tem `resultado_id` (regra: um
 *      resultado por item; nova versão exige fluxo de retificação,
 *      não coberto neste endpoint).
 *   4. INSERT resultados_exame com `assinado_em = NULL` e
 *      status = 'LAUDO_PARCIAL'.
 *   5. UPDATE solicitacao_item.resultado_id + status='LAUDO_PARCIAL'.
 *   6. Recalcula status do parent (LAUDO_PARCIAL ou LAUDO_FINAL).
 *   7. Audit `exame.resultado.registrado` (sem PHI).
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { RegistrarResultadoDto } from '../dto/registrar-resultado.dto';
import type { ResultadoExameResponse } from '../dto/exame.response';
import { ExamesRepository } from '../infrastructure/exames.repository';
import { presentResultado } from './solicitacao.presenter';

@Injectable()
export class RegistrarResultadoUseCase {
  constructor(
    private readonly repo: ExamesRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    dto: RegistrarResultadoDto,
  ): Promise<ResultadoExameResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('RegistrarResultadoUseCase requires a request context.');
    }

    // 1. Item.
    const item = await this.repo.findItemByUuid(dto.solicitacaoItemUuid);
    if (item === null) {
      throw new NotFoundException({
        code: 'SOLICITACAO_ITEM_NOT_FOUND',
        message: 'Item de solicitação não encontrado.',
      });
    }
    if (item.resultado_id !== null) {
      throw new ConflictException({
        code: 'RESULTADO_JA_REGISTRADO',
        message:
          'Item já possui resultado vinculado. Nova versão exige fluxo de retificação.',
      });
    }
    if (item.status === 'CANCELADO') {
      throw new ConflictException({
        code: 'ITEM_CANCELADO',
        message: 'Item está cancelado — não aceita resultado.',
      });
    }

    // 2. Conteúdo mínimo.
    const temEstruturado =
      dto.laudoEstruturado !== undefined &&
      dto.laudoEstruturado.analitos.length > 0;
    const temTexto =
      dto.laudoTexto !== undefined && dto.laudoTexto.trim().length > 0;
    const temPdf =
      dto.laudoPdfUrl !== undefined && dto.laudoPdfUrl.length > 0;
    if (!temEstruturado && !temTexto && !temPdf) {
      throw new BadRequestException({
        code: 'RESULTADO_SEM_CONTEUDO',
        message:
          'Pelo menos um de `laudoEstruturado.analitos`, `laudoTexto` ou `laudoPdfUrl` é obrigatório.',
      });
    }

    // 3. Resolve paciente via solicitação parent.
    const solicitacao = await this.repo.findSolicitacaoByUuid(
      item.solicitacao_uuid,
    );
    if (solicitacao === null) {
      throw new NotFoundException({
        code: 'SOLICITACAO_EXAME_NOT_FOUND',
        message: 'Solicitação parent não encontrada.',
      });
    }

    // 4/5. INSERT + ligação.
    const dataColeta =
      dto.dataColeta !== undefined ? new Date(dto.dataColeta) : null;
    const dataProc =
      dto.dataProcessamento !== undefined
        ? new Date(dto.dataProcessamento)
        : null;
    if (
      (dataColeta !== null && Number.isNaN(dataColeta.getTime())) ||
      (dataProc !== null && Number.isNaN(dataProc.getTime()))
    ) {
      throw new BadRequestException({
        code: 'RESULTADO_DATA_INVALIDA',
        message: 'dataColeta ou dataProcessamento inválida.',
      });
    }

    const inserted = await this.repo.insertResultado({
      tenantId: ctx.tenantId,
      solicitacaoItemId: item.id,
      pacienteId: solicitacao.paciente_id,
      dataColeta,
      dataProcessamento: dataProc,
      laudoEstruturado: dto.laudoEstruturado ?? null,
      laudoTexto: dto.laudoTexto ?? null,
      laudoPdfUrl: dto.laudoPdfUrl ?? null,
      imagensUrls: dto.imagensUrls ?? null,
      status: 'LAUDO_PARCIAL',
    });

    await this.repo.setItemResultadoId(item.id, inserted.id);
    await this.repo.setItemStatus(item.id, 'LAUDO_PARCIAL');
    await this.repo.recomputeSolicitacaoStatus(solicitacao.id);

    // 6. Audit (sem conteúdo do laudo).
    await this.auditoria.record({
      tabela: 'resultados_exame',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'exame.resultado.registrado',
        solicitacao_item_id: item.id.toString(),
        solicitacao_id: solicitacao.id.toString(),
        com_estruturado: temEstruturado,
        com_texto: temTexto,
        com_pdf: temPdf,
        com_imagens: (dto.imagensUrls?.length ?? 0) > 0,
      },
      finalidade: 'exame.resultado.registrado',
    });

    const created = await this.repo.findResultadoByUuid(inserted.uuid_externo);
    if (created === null) {
      throw new Error('Resultado criado não encontrado (RLS?).');
    }
    return presentResultado(created);
  }
}
