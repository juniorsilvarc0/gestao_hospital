/**
 * `POST /v1/prescricoes/:uuid/assinar` (RN-PEP-02 + RN-PRE-01).
 *
 * Fluxo:
 *   1. Carrega prescrição. Não pode estar:
 *      - já assinada (trigger `tg_imutavel_apos_assinatura` bloquearia
 *        anyway, mas falhamos antes com mensagem amigável);
 *      - cancelada/recusada/encerrada.
 *   2. Chama o `IcpBrasilSigner` (port — Trilha A entrega o real, stub
 *      em dev). Hash SHA-256 do conteúdo serializado da prescrição.
 *   3. UPDATE `prescricoes` setando `assinatura_digital` JSONB e
 *      `assinada_em`. (Status continua AGUARDANDO_ANALISE até o
 *      farmacêutico — RN-PRE-01.)
 *   4. EventEmitter2 dispara `prescricao.assinada` (a Fase 7 / painel
 *      farmácia consome).
 *
 * Importante: a entrega de demanda à farmácia (`PrescricaoAtiva`) é o
 * `analisar-prescricao` quando outcome = APROVADA — RN-PRE-01.
 * Apenas assinar não basta.
 */
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import {
  ICP_BRASIL_SIGNER,
  type IcpBrasilSigner,
} from '../infrastructure/icp-brasil.port';
import { PrescricoesRepository } from '../infrastructure/prescricoes.repository';
import type { PrescricaoResponse } from '../dto/list-prescricoes.dto';
import { presentPrescricao } from './prescricao.presenter';

@Injectable()
export class AssinarPrescricaoUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PrescricoesRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
    @Inject(ICP_BRASIL_SIGNER) private readonly signer: IcpBrasilSigner,
  ) {}

  async execute(uuid: string): Promise<PrescricaoResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('AssinarPrescricaoUseCase requires a request context.');
    }

    const presc = await this.repo.findPrescricaoByUuid(uuid);
    if (presc === null) {
      throw new NotFoundException({
        code: 'PRESCRICAO_NOT_FOUND',
        message: 'Prescrição não encontrada.',
      });
    }
    if (presc.assinada_em !== null) {
      throw new ConflictException({
        code: 'PRESCRICAO_JA_ASSINADA',
        message: 'Prescrição já está assinada (imutável — RN-PEP-02).',
      });
    }
    if (
      presc.status === 'CANCELADA' ||
      presc.status === 'ENCERRADA' ||
      presc.status === 'RECUSADA_FARMACIA'
    ) {
      throw new ConflictException({
        code: 'PRESCRICAO_STATUS_INVALIDO',
        message: `Não é possível assinar prescrição com status ${presc.status}.`,
      });
    }

    const itens = await this.repo.findItensByPrescricaoId(presc.id);

    // Conteúdo a assinar = snapshot canônico.
    const conteudo = {
      uuid: presc.uuid_externo,
      atendimento_uuid: presc.atendimento_uuid,
      paciente_uuid: presc.paciente_uuid,
      prescritor_uuid: presc.prescritor_uuid,
      data_hora: presc.data_hora.toISOString(),
      tipo: presc.tipo,
      validade_inicio: presc.validade_inicio.toISOString(),
      itens: itens.map((it) => ({
        uuid: it.uuid_externo,
        procedimento_uuid: it.procedimento_uuid,
        dose: it.dose,
        via: it.via,
        frequencia: it.frequencia,
      })),
    };

    const prestadorId = await this.repo.findPrestadorIdByUserId(ctx.userId);
    const result = await this.signer.assinar({
      conteudo,
      signatario: { usuarioId: ctx.userId, prestadorId },
      documentoTipo: 'PRESCRICAO',
    });

    const tx = this.prisma.tx();
    await tx.$executeRaw`
      UPDATE prescricoes
         SET assinatura_digital = ${JSON.stringify(result.jsonb)}::jsonb,
             assinada_em        = ${result.assinadoEm}::timestamptz,
             updated_at         = now()
       WHERE id = ${presc.id}::bigint
         AND data_hora = ${presc.data_hora}::timestamptz
    `;

    await this.auditoria.record({
      tabela: 'prescricoes',
      registroId: presc.id,
      operacao: 'U',
      diff: {
        evento: 'prescricao.assinada',
        assinatura_id: result.assinaturaId,
        hash: result.jsonb.hash,
        stub: result.jsonb.stub,
      },
      finalidade: 'prescricao.assinada',
    });

    this.events.emit('prescricao.assinada', {
      prescricaoUuid: presc.uuid_externo,
      atendimentoUuid: presc.atendimento_uuid,
      pacienteUuid: presc.paciente_uuid,
      assinadoEm: result.assinadoEm.toISOString(),
    });

    const updated = await this.repo.findPrescricaoByUuid(uuid);
    if (updated === null) {
      throw new Error('Prescrição assinada não encontrada (RLS?).');
    }
    const newItens = await this.repo.findItensByPrescricaoId(presc.id);
    return presentPrescricao(updated, newItens);
  }
}
