/**
 * `POST /v1/contas/{uuid}/fechar` — RN-FAT-01.
 *
 * Pré-condições:
 *   1. Status atual = EM_ELABORACAO.
 *   2. Não pode haver inconsistências com `severidade='erro'`.
 *
 * Snapshots gravados (RN-FAT-02):
 *   - `versao_tiss_snapshot` (string, da condicao_contratual).
 *   - `condicao_contratual_snap` (JSONB completo da condição).
 *   - `tabela_precos_snap` (JSONB com mapa procedimento_id → valor para
 *     o subset usado pela conta — JSONB enxuto).
 *   - `iss_aliquota_snap`, `iss_valor`, `iss_retem` (RN-FAT-10).
 *
 * Ao final emite evento `conta.fechada` (Fase 8 R-B/R-C consomem).
 */
import Decimal from 'decimal.js';
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AuditoriaService } from '../../../auditoria/application/auditoria.service';
import { temInconsistenciaBloqueante, type Inconsistencia } from '../../domain/inconsistencia';
import { ContasRepository } from '../../infrastructure/contas.repository';

export interface FecharContaResult {
  status: 'FECHADA';
  versaoTiss: string | null;
  issValor: string | null;
}

function asInconsistencias(raw: unknown): Inconsistencia[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw as Inconsistencia[];
  return [];
}

@Injectable()
export class FecharContaUseCase {
  constructor(
    private readonly repo: ContasRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(contaUuid: string): Promise<FecharContaResult> {
    const conta = await this.repo.findContaByUuid(contaUuid);
    if (conta === null) {
      throw new NotFoundException({
        code: 'CONTA_NOT_FOUND',
        message: 'Conta não encontrada.',
      });
    }
    if (conta.status !== 'EM_ELABORACAO') {
      throw new UnprocessableEntityException({
        code: 'CONTA_STATUS_INVALIDO',
        message: `Fechamento exige status EM_ELABORACAO; atual: ${conta.status}.`,
      });
    }

    const inconsistencias = asInconsistencias(conta.inconsistencias);
    if (temInconsistenciaBloqueante(inconsistencias)) {
      const erros = inconsistencias.filter((i) => i.severidade === 'erro');
      throw new UnprocessableEntityException({
        code: 'CONTA_TEM_INCONSISTENCIAS_ERRO',
        message: `Conta possui ${erros.length} inconsistência(s) com severidade 'erro' — corrigir antes de fechar.`,
        inconsistencias: erros,
      });
    }

    // ─── Snapshots ───
    const referenciaIso = (conta.data_abertura ?? new Date()).toISOString().slice(0, 10);
    let condicaoContratualPayload: unknown = null;
    let issAliquota: string | null = null;
    let issRetem = false;
    let versaoTiss: string | null = null;

    if (conta.convenio_id !== null) {
      const cc = await this.repo.findCondicaoContratualVigente({
        convenioId: conta.convenio_id,
        planoId: conta.plano_id,
        referenciaIso,
      });
      if (cc === null) {
        throw new UnprocessableEntityException({
          code: 'CONDICAO_CONTRATUAL_NAO_ENCONTRADA',
          message:
            'Convênio sem condição contratual vigente para a data de atendimento. Cadastre a condição antes de fechar.',
        });
      }
      condicaoContratualPayload = cc.payload;
      issAliquota = cc.issAliquota;
      issRetem = cc.issRetem;
      versaoTiss = cc.versaoTiss;
    }

    // Tabela de preços snapshot — apenas o subset usado.
    const itens = await this.repo.findItensByContaId(conta.id);
    const procedimentoIds = Array.from(
      new Set(itens.map((it) => it.procedimento_id)),
    );
    let tabelaPrecosSnap: Record<string, string> | null = null;
    if (conta.convenio_id !== null && procedimentoIds.length > 0) {
      const tab = await this.repo.findTabelaPrecosSnapshot({
        convenioId: conta.convenio_id,
        planoId: conta.plano_id,
        procedimentoIds,
        referenciaIso,
      });
      tabelaPrecosSnap = {
        __tabela_id: tab.tabelaId === null ? '' : tab.tabelaId.toString(),
        __tabela_codigo: tab.tabelaCodigo ?? '',
        __tabela_versao: tab.tabelaVersao === null ? '' : tab.tabelaVersao.toString(),
        ...tab.valores,
      };
    }

    // ISS (RN-FAT-10): ISS = aliquota × (valor_servicos + valor_taxas)
    let issValor: string | null = null;
    if (issAliquota !== null) {
      const aliquota = new Decimal(issAliquota);
      const baseServicos = new Decimal(conta.valor_servicos);
      const baseTaxas = new Decimal(conta.valor_taxas);
      issValor = aliquota.div(100).mul(baseServicos.plus(baseTaxas)).toFixed(4);
    }

    await this.repo.applySnapshotsAndFechar({
      contaId: conta.id,
      snapshot: {
        versaoTiss,
        condicaoContratual: condicaoContratualPayload,
        tabelaPrecos: tabelaPrecosSnap,
        issAliquota,
        issRetem,
        issValor,
      },
    });

    await this.auditoria.record({
      tabela: 'contas',
      registroId: conta.id,
      operacao: 'U',
      diff: {
        evento: 'conta.fechada',
        versao_tiss: versaoTiss,
        iss_aliquota: issAliquota,
        iss_valor: issValor,
        iss_retem: issRetem,
        warnings: inconsistencias.filter((i) => i.severidade === 'warning').length,
      },
      finalidade: 'conta.fechada',
    });

    this.events.emit('conta.fechada', {
      contaUuid,
      contaId: conta.id.toString(),
      versaoTiss,
      issValor,
    });

    return { status: 'FECHADA', versaoTiss, issValor };
  }
}
