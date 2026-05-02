/**
 * `POST /v1/glosas/importar-tiss` — importa em lote glosas eletrônicas
 * vindas do retorno TISS (RN-GLO-01).
 *
 * Para cada item, tenta localizar `conta_id` por `numero_conta` ou
 * `numero_guia_prestador`. `conta_item_id` é heurístico — se não localiza,
 * a glosa fica como "glosa de conta" (`conta_item_id = NULL`).
 */
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import { defaultPrazoRecurso } from '../domain/glosa';
import {
  inferMotivoGlosa,
  isMotivoGenerico,
} from '../domain/motivo-inferencer';
import type {
  ImportarGlosaTissItemDto,
  ImportarGlosasTissDto,
} from '../dto/importar-glosas-tiss.dto';
import type {
  GlosaResponse,
  ImportarGlosasTissResponse,
} from '../dto/responses';
import { GlosasRepository } from '../infrastructure/glosas.repository';
import { presentGlosa } from './glosa.presenter';

@Injectable()
export class ImportarGlosasTissUseCase {
  constructor(
    private readonly repo: GlosasRepository,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  async execute(
    dto: ImportarGlosasTissDto,
  ): Promise<ImportarGlosasTissResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('ImportarGlosasTissUseCase requires request context.');
    }

    const total = dto.glosas.length;
    const importadas: GlosaResponse[] = [];
    const comAlerta: { linha: number; mensagem: string }[] = [];

    for (let i = 0; i < dto.glosas.length; i++) {
      const item = dto.glosas[i];
      const linha = i + 1;
      try {
        const result = await this.processarItem(item, ctx);
        if (result.glosa !== null) {
          importadas.push(result.glosa);
        }
        if (result.alerta !== null) {
          comAlerta.push({ linha, mensagem: result.alerta });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'erro desconhecido';
        comAlerta.push({ linha, mensagem: msg });
      }
    }

    if (importadas.length > 0) {
      await this.auditoria.record({
        tabela: 'glosas',
        registroId: BigInt(0),
        operacao: 'I',
        diff: {
          evento: 'glosas.importadas_tiss',
          total,
          importadas: importadas.length,
          com_alerta: comAlerta.length,
          lote_uuid: dto.loteUuid ?? null,
        },
        finalidade: 'glosas.importadas_tiss',
      });
    }

    return {
      total,
      importadas: importadas.length,
      comAlerta,
      glosas: importadas,
    };
  }

  private async processarItem(
    item: ImportarGlosaTissItemDto,
    ctx: { tenantId: bigint; userId: bigint },
  ): Promise<{ glosa: GlosaResponse | null; alerta: string | null }> {
    let contaId: bigint | null = null;
    let convenioId: bigint | null = null;

    if (item.contaNumero !== undefined) {
      const conta = await this.repo.findContaByNumero(item.contaNumero);
      if (conta !== null) {
        contaId = conta.id;
        convenioId = conta.convenioId;
      }
    }

    if (contaId === null && item.guiaNumeroPrestador !== undefined) {
      const guia = await this.repo.findGuiaTissByNumeroPrestador(
        item.guiaNumeroPrestador,
      );
      if (guia !== null) {
        contaId = guia.contaId;
        // resolver convenio via conta:
        const c = await this.repo.findContaByUuidById(guia.contaId);
        convenioId = c?.convenioId ?? null;
      }
    }

    if (contaId === null) {
      return {
        glosa: null,
        alerta: `Conta não encontrada (numero=${item.contaNumero ?? '-'}, guia=${item.guiaNumeroPrestador ?? '-'})`,
      };
    }
    if (convenioId === null) {
      return {
        glosa: null,
        alerta: 'Conta sem convênio (PARTICULAR/SUS) — glosa TISS não aplicável',
      };
    }

    let contaItemId: bigint | null = null;
    if (item.contaItemReferencia !== undefined) {
      const parts = item.contaItemReferencia.split('|');
      const codigo = parts[0]?.trim();
      const data = parts[1]?.trim() ?? null;
      if (codigo !== undefined && codigo.length > 0) {
        contaItemId = await this.repo.findContaItemByHeuristic(
          contaId,
          codigo,
          data,
        );
      }
    }

    // RN-GLO-06 — enriquecer motivo se genérico
    let motivo = item.motivo;
    if (isMotivoGenerico(motivo)) {
      const sugestao = inferMotivoGlosa(item.codigoGlosaTiss);
      motivo = `${motivo} (sugestão: ${sugestao.descricao})`;
    }

    const inserted = await this.repo.insertGlosa({
      tenantId: ctx.tenantId,
      contaId,
      contaItemId,
      guiaTissId: null,
      convenioId,
      motivo,
      codigoGlosaTiss: item.codigoGlosaTiss,
      valorGlosado: item.valorGlosado.toFixed(4),
      dataGlosa: item.dataGlosa,
      origem: 'TISS',
      prazoRecurso: defaultPrazoRecurso(item.dataGlosa),
      userId: ctx.userId,
    });

    this.events.emit('glosa.recebida', {
      glosaUuid: inserted.uuidExterno,
      origem: 'TISS',
      valorGlosado: item.valorGlosado.toFixed(4),
    });

    const row = await this.repo.findGlosaByUuid(inserted.uuidExterno);
    if (row === null) {
      return { glosa: null, alerta: 'Falha ao reler glosa criada' };
    }
    return {
      glosa: presentGlosa(row),
      alerta: contaItemId === null && item.contaItemReferencia !== undefined
        ? 'Item da conta não localizado pela heurística — glosa criada como "glosa de conta"'
        : null,
    };
  }
}
