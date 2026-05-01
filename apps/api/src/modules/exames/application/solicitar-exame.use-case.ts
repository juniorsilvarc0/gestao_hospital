/**
 * `POST /v1/atendimentos/:atendUuid/solicitacoes-exame` (RN-LAB-01).
 *
 * Fluxo:
 *   1. Resolve atendimento. Se já está com `data_hora_saida` preenchida
 *      e `status` em estado terminal (ALTA/CANCELADO), recusa
 *      (RN-ATE-07: atendimento "fechado" não recebe novos itens).
 *   2. Resolve `solicitanteId` (DTO `solicitanteUuid` ou
 *      `usuarios.prestador_id` da request).
 *   3. Resolve todos os procedimentos do payload — se algum não existe,
 *      404 com lista de UUIDs faltantes.
 *   4. INSERT solicitacoes_exame + INSERT N solicitacoes_exame_itens
 *      em uma única transação (já estamos dentro da `$transaction` do
 *      TenantContextInterceptor).
 *   5. Audit `exame.solicitado` com sumário (urgência + count) — sem
 *      indicação clínica nos diffs (PHI).
 *
 * Status inicial: `SOLICITADO` (RN-LAB-01). Autorização via convênio
 * é tratada por outro fluxo (Fase 8 / faturamento) que move para
 * `AUTORIZADO`.
 */
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import type { SolicitarExameDto } from '../dto/solicitar-exame.dto';
import type { SolicitacaoExameResponse } from '../dto/exame.response';
import { ExamesRepository } from '../infrastructure/exames.repository';
import { presentSolicitacao } from './solicitacao.presenter';

const ATENDIMENTO_TERMINAL = new Set(['ALTA', 'CANCELADO']);

@Injectable()
export class SolicitarExameUseCase {
  constructor(
    private readonly repo: ExamesRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(
    atendimentoUuid: string,
    dto: SolicitarExameDto,
  ): Promise<SolicitacaoExameResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('SolicitarExameUseCase requires a request context.');
    }

    // 1. Atendimento.
    const atendimento = await this.repo.findAtendimentoBasicsByUuid(
      atendimentoUuid,
    );
    if (atendimento === null) {
      throw new NotFoundException({
        code: 'ATENDIMENTO_NOT_FOUND',
        message: 'Atendimento não encontrado.',
      });
    }
    if (
      ATENDIMENTO_TERMINAL.has(atendimento.status) ||
      atendimento.dataHoraSaida !== null
    ) {
      // RN-ATE-07: nada novo entra em atendimento já encerrado.
      throw new ConflictException({
        code: 'ATENDIMENTO_ENCERRADO',
        message:
          'Atendimento já encerrado — não aceita novas solicitações de exame (RN-ATE-07).',
      });
    }

    // 2. Solicitante.
    let solicitanteId: bigint | null = null;
    if (dto.solicitanteUuid !== undefined) {
      solicitanteId = await this.repo.findPrestadorIdByUuid(dto.solicitanteUuid);
      if (solicitanteId === null) {
        throw new NotFoundException({
          code: 'SOLICITANTE_NOT_FOUND',
          message: 'Prestador solicitante não encontrado.',
        });
      }
    } else {
      solicitanteId = await this.repo.findPrestadorIdByUserId(ctx.userId);
      if (solicitanteId === null) {
        throw new ForbiddenException({
          code: 'USUARIO_SEM_PRESTADOR_VINCULADO',
          message:
            'Usuário não possui prestador vinculado — informe `solicitanteUuid` explicitamente.',
        });
      }
    }

    // 3. Procedimentos.
    const procUuids = dto.itens.map((i) => i.procedimentoUuid);
    const procs = await this.repo.findProcedimentosByUuids(procUuids);
    const missing = procUuids.filter((u) => !procs.has(u));
    if (missing.length > 0) {
      throw new NotFoundException({
        code: 'PROCEDIMENTO_NOT_FOUND',
        message: `Procedimentos não encontrados: ${missing.join(', ')}`,
      });
    }

    // 4. Persistência (transação implícita).
    const inserted = await this.repo.insertSolicitacao({
      tenantId: ctx.tenantId,
      atendimentoId: atendimento.id,
      pacienteId: atendimento.pacienteId,
      solicitanteId,
      urgencia: dto.urgencia,
      indicacaoClinica: dto.indicacaoClinica,
      numeroGuia: dto.numeroGuia ?? null,
      observacao: null,
    });

    await this.repo.insertItens(
      inserted.id,
      ctx.tenantId,
      dto.itens.map((it) => {
        const proc = procs.get(it.procedimentoUuid);
        if (proc === undefined) {
          throw new Error('procedimento desapareceu após resolução');
        }
        return {
          procedimentoId: proc.id,
          observacao: it.observacao ?? null,
        };
      }),
    );

    // 5. Audit lógico — sem indicação clínica (PHI).
    await this.auditoria.record({
      tabela: 'solicitacoes_exame',
      registroId: inserted.id,
      operacao: 'I',
      diff: {
        evento: 'exame.solicitado',
        atendimento_id: atendimento.id.toString(),
        solicitante_id: solicitanteId.toString(),
        urgencia: dto.urgencia,
        n_itens: dto.itens.length,
        ...(dto.numeroGuia !== undefined ? { com_numero_guia: true } : {}),
      },
      finalidade: 'exame.solicitado',
    });

    const created = await this.repo.findSolicitacaoByUuid(inserted.uuid_externo);
    if (created === null) {
      throw new Error('Solicitação criada não encontrada (RLS?).');
    }
    const itens = await this.repo.findItensBySolicitacaoId(created.id);
    return presentSolicitacao(created, itens);
  }
}
