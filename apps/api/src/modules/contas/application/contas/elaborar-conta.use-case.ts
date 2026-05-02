/**
 * `POST /v1/contas/{uuid}/elaborar` — inicia (ou refresh) elaboração.
 *
 * Transição: ABERTA → EM_ELABORACAO. Idempotente: se já estiver em
 * EM_ELABORACAO, apenas re-roda o checker e atualiza o snapshot de
 * inconsistências (faturista pode chamar várias vezes durante revisão).
 *
 * O checker é puro — recebe os itens já carregados pelo repositório.
 */
import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { nextContaStatus } from '../../domain/conta';
import type { Inconsistencia } from '../../domain/inconsistencia';
import { ContasRepository } from '../../infrastructure/contas.repository';
import { PacotesRepository } from '../../infrastructure/pacotes.repository';
import {
  checkInconsistencias,
  type GrupoGasto,
  type ItemForCheck,
  type PacoteForCheck,
} from '../elaboracao/inconsistency-checker';

export interface ElaborarContaResult {
  status: 'EM_ELABORACAO';
  inconsistencias: Inconsistencia[];
  totalErros: number;
  totalWarnings: number;
}

@Injectable()
export class ElaborarContaUseCase {
  constructor(
    private readonly repo: ContasRepository,
    private readonly pacotesRepo: PacotesRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async execute(contaUuid: string): Promise<ElaborarContaResult> {
    const conta = await this.repo.findContaByUuid(contaUuid);
    if (conta === null) {
      throw new NotFoundException({
        code: 'CONTA_NOT_FOUND',
        message: 'Conta não encontrada.',
      });
    }

    // Permitimos re-elaborar uma conta já EM_ELABORACAO (refresh do
    // checker). Para outras transições, validar.
    if (conta.status !== 'EM_ELABORACAO') {
      const target = nextContaStatus(conta.status, 'elaborar');
      if (target === null) {
        throw new UnprocessableEntityException({
          code: 'CONTA_TRANSICAO_INVALIDA',
          message: `Conta em status ${conta.status} não pode ser elaborada.`,
        });
      }
      await this.repo.setDataElaboracaoInicio(conta.id);
      await this.repo.updateContaStatus(conta.id, target);
    }

    const itens = await this.repo.findItensByContaId(conta.id);
    const itensCheck: ItemForCheck[] = itens.map((it) => ({
      itemId: it.uuid_externo,
      procedimentoId: it.procedimento_id.toString(),
      procedimentoNome: it.procedimento_nome,
      procedimentoGrupoGasto: it.procedimento_grupo_gasto as GrupoGasto,
      grupoGasto: it.grupo_gasto as GrupoGasto,
      quantidade: Number(it.quantidade),
      valorUnitario: Number(it.valor_unitario),
      prestadorExecutanteId:
        it.prestador_executante_id === null
          ? null
          : it.prestador_executante_id.toString(),
      dataRealizacaoIso:
        it.data_realizacao === null ? null : it.data_realizacao.toISOString().slice(0, 10),
      autorizado: it.autorizado,
      numeroAutorizacao: it.numero_autorizacao,
      foraPacote: it.fora_pacote,
      pacoteId: it.pacote_id === null ? null : it.pacote_id.toString(),
      lote: it.lote,
      registroAnvisa: it.registro_anvisa,
    }));

    // Pacotes presentes na conta (pacote_id ≠ null e cabeça PACOTE).
    const pacoteIds = new Set<string>();
    for (const it of itens) {
      if (it.pacote_id !== null) pacoteIds.add(it.pacote_id.toString());
    }
    const pacotesNaConta: PacoteForCheck[] = [];
    if (pacoteIds.size > 0) {
      const ids = Array.from(pacoteIds).map((s) => BigInt(s));
      const itensPorPacote = await this.pacotesRepo.findItensByPacoteIds(ids);
      for (const id of ids) {
        const previstos = itensPorPacote.get(id) ?? [];
        pacotesNaConta.push({
          pacoteId: id.toString(),
          itensPrevistos: previstos.map((p) => ({
            procedimentoId: p.procedimento_id,
            quantidade: Number(p.quantidade),
          })),
        });
      }
    }

    // Convênio exige autorização? Olha condicao_contratual atual.
    let exigirAutorizacao = false;
    if (conta.convenio_id !== null) {
      const ref = (conta.data_abertura ?? new Date()).toISOString().slice(0, 10);
      const cc = await this.repo.findCondicaoContratualVigente({
        convenioId: conta.convenio_id,
        planoId: conta.plano_id,
        referenciaIso: ref,
      });
      if (cc !== null) {
        const params = cc.payload as Record<string, unknown>;
        exigirAutorizacao = Boolean(
          params.exige_autorizacao_internacao || params.exige_autorizacao_opme,
        );
      }
    }

    const inconsistencias = checkInconsistencias({
      itens: itensCheck,
      pacotesNaConta,
      exigirAutorizacao,
    });

    await this.repo.setInconsistencias(conta.id, inconsistencias);

    const totalErros = inconsistencias.filter((i) => i.severidade === 'erro').length;
    const totalWarnings = inconsistencias.filter((i) => i.severidade === 'warning').length;

    await this.auditoria.record({
      tabela: 'contas',
      registroId: conta.id,
      operacao: 'U',
      diff: {
        evento: 'contas.elaborada',
        total_erros: totalErros,
        total_warnings: totalWarnings,
      },
      finalidade: 'contas.elaborada',
    });

    return {
      status: 'EM_ELABORACAO',
      inconsistencias,
      totalErros,
      totalWarnings,
    };
  }
}
