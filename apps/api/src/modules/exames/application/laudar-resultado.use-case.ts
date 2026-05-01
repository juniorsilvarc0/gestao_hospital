/**
 * `POST /v1/resultados-exame/:uuid/laudar` (RN-LAB-04, INVARIANTE #3).
 *
 * Fluxo:
 *   1. Carrega resultado. Recusa se já assinado (trigger DDL bloqueia
 *      anyway, mas falhamos antes com 409 amigável).
 *   2. Resolve laudista: `usuarios.prestador_id` da request. Sem
 *      vínculo → 403.
 *   3. Conteúdo a assinar = snapshot canônico (UUID + dados do laudo).
 *   4. `IcpBrasilSigner.assinar(...)` (port — Trilha A R2 vai expor o
 *      real via PepModule; até lá, `LocalIcpBrasilStub`).
 *   5. UPDATE resultados_exame SET assinatura_digital + assinado_em +
 *      laudista_id + status='LAUDO_FINAL'.
 *   6. UPDATE item.status='LAUDO_FINAL' + recompute do parent.
 *   7. Audit `exame.laudo.assinado` + emit `exame.laudo.assinado` para
 *      o EventEmitter (consumidores futuros: notificação paciente,
 *      faturamento).
 *
 * **INVARIANTE #3**: após o UPDATE com `assinado_em` preenchido, o
 * trigger `tg_imutavel_apos_assinado` (DDL) bloqueia qualquer UPDATE
 * subsequente em colunas críticas — corrigir vira nova versão do
 * resultado (não coberto neste endpoint; entrará na Fase 6 R3).
 */
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { LaudarDto } from '../dto/laudar.dto';
import type { ResultadoExameResponse } from '../dto/exame.response';
import {
  ICP_BRASIL_SIGNER,
  type IcpBrasilSigner,
} from '../infrastructure/icp-brasil.port';
import { ExamesRepository } from '../infrastructure/exames.repository';
import { presentResultado } from './solicitacao.presenter';

@Injectable()
export class LaudarResultadoUseCase {
  constructor(
    private readonly repo: ExamesRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
    @Inject(ICP_BRASIL_SIGNER) private readonly signer: IcpBrasilSigner,
  ) {}

  async execute(
    uuid: string,
    dto: LaudarDto,
  ): Promise<ResultadoExameResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('LaudarResultadoUseCase requires a request context.');
    }

    const resultado = await this.repo.findResultadoByUuid(uuid);
    if (resultado === null) {
      throw new NotFoundException({
        code: 'RESULTADO_NOT_FOUND',
        message: 'Resultado de exame não encontrado.',
      });
    }
    if (resultado.assinado_em !== null) {
      throw new ConflictException({
        code: 'RESULTADO_JA_ASSINADO',
        message: 'Resultado já assinado (imutável — INVARIANTE #3 / RN-LAB-04).',
      });
    }
    if (resultado.status === 'CANCELADO') {
      throw new ConflictException({
        code: 'RESULTADO_CANCELADO',
        message: 'Resultado cancelado — não pode ser laudado.',
      });
    }

    // Laudista — usuário logado precisa ter prestador_id.
    const laudistaId = await this.repo.findPrestadorIdByUserId(ctx.userId);
    if (laudistaId === null) {
      throw new ForbiddenException({
        code: 'USUARIO_SEM_PRESTADOR_VINCULADO',
        message:
          'Apenas usuários com prestador vinculado podem laudar (CRM/CRBM).',
      });
    }

    // Conteúdo a assinar — snapshot canônico estável.
    const conteudo = {
      uuid: resultado.uuid_externo,
      solicitacao_item_uuid: resultado.solicitacao_item_uuid,
      solicitacao_uuid: resultado.solicitacao_uuid,
      paciente_uuid: resultado.paciente_uuid,
      procedimento_uuid: resultado.procedimento_uuid,
      data_coleta:
        resultado.data_coleta === null
          ? null
          : resultado.data_coleta.toISOString(),
      data_processamento:
        resultado.data_processamento === null
          ? null
          : resultado.data_processamento.toISOString(),
      laudo_estruturado: resultado.laudo_estruturado ?? null,
      laudo_texto: resultado.laudo_texto,
      laudo_pdf_url: resultado.laudo_pdf_url,
      imagens_urls: resultado.imagens_urls ?? null,
    };

    const result = await this.signer.assinar({
      conteudo,
      signatario: { usuarioId: ctx.userId, prestadorId: laudistaId },
      documentoTipo: 'RESULTADO_EXAME',
      certPemBase64: dto.certPemBase64,
      p12Base64: dto.p12Base64,
      p12Senha: dto.p12Senha,
    });

    await this.repo.laudarResultado({
      resultadoId: resultado.id,
      laudistaId,
      assinaturaJsonb: result.jsonb,
      assinadoEm: result.assinadoEm,
    });

    // Item & parent.
    await this.repo.setItemStatus(
      resultado.solicitacao_item_id,
      'LAUDO_FINAL',
    );
    // Recompute requer ID da solicitação — o resultado_row tem
    // `solicitacao_uuid`, fazemos lookup leve (poderia voltar do
    // repo num único query, mas mantemos coeso).
    const sol = await this.repo.findSolicitacaoByUuid(
      resultado.solicitacao_uuid,
    );
    if (sol !== null) {
      await this.repo.recomputeSolicitacaoStatus(sol.id);
    }

    await this.auditoria.record({
      tabela: 'resultados_exame',
      registroId: resultado.id,
      operacao: 'U',
      diff: {
        evento: 'exame.laudo.assinado',
        assinatura_id: result.assinaturaId,
        hash: result.jsonb.hash,
        stub: result.jsonb.stub,
        laudista_id: laudistaId.toString(),
      },
      finalidade: 'exame.laudo.assinado',
    });

    this.events.emit('exame.laudo.assinado', {
      resultadoUuid: resultado.uuid_externo,
      solicitacaoUuid: resultado.solicitacao_uuid,
      pacienteUuid: resultado.paciente_uuid,
      assinadoEm: result.assinadoEm.toISOString(),
    });

    const updated = await this.repo.findResultadoByUuid(uuid);
    if (updated === null) {
      throw new Error('Resultado assinado não encontrado (RLS?).');
    }
    return presentResultado(updated);
  }
}
