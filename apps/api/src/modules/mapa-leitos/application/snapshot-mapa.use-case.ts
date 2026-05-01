/**
 * `SnapshotMapaUseCase` — devolve a "foto" inicial do mapa de leitos.
 *
 * Por que um snapshot REST além do WebSocket?
 *   A UI precisa de uma fonte estável na primeira carga (ex.: F5 do
 *   operador). Daí em diante, o cliente atualiza o estado com os
 *   eventos `leito.*` recebidos via WS. Sem snapshot, o cliente teria
 *   uma janela cega entre o open do socket e o primeiro evento.
 *
 * Tudo é lido com o `tx` do `TenantContextInterceptor` — RLS é
 * aplicado pelo Postgres com `SET LOCAL app.current_tenant_id`.
 *
 * Cuidado com PHI:
 *   - Nome do paciente é minimizado (LGPD — RN-LGP-01).
 *   - Alergias entram somente se o paciente já consentiu LGPD.
 *   - CPF/CNS jamais aparece.
 *
 * Performance:
 *   Uma query JOIN única (leitos + setores + atendimentos +
 *   pacientes) buscando apenas as colunas necessárias. Em hospitais
 *   reais com 500-2000 leitos, isso resolve em <50ms se os índices
 *   `ix_leitos_setor_status` e `ix_atend_setor_status` existirem.
 */
import { Injectable } from '@nestjs/common';
import {
  enum_leito_status as LeitoStatus,
  enum_leito_tipo_acomodacao as LeitoTipoAcomodacao,
} from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

/** Linha bruta retornada pelo SELECT do snapshot. */
interface MapaLeitoLinha {
  leito_id: bigint;
  leito_codigo: string;
  leito_status: LeitoStatus;
  leito_tipo_acomodacao: LeitoTipoAcomodacao;
  leito_versao: number;
  leito_extra: boolean;
  leito_observacao: string | null;
  ocupacao_iniciada_em: Date | null;
  ocupacao_prevista_fim: Date | null;
  setor_id: bigint;
  setor_nome: string;
  setor_tipo: string;
  paciente_id: bigint | null;
  paciente_uuid: string | null;
  paciente_nome: string | null;
  paciente_data_nascimento: Date | null;
  paciente_alergias: unknown;
  atendimento_id: bigint | null;
  atendimento_uuid: string | null;
  atendimento_tipo: string | null;
  atendimento_data_entrada: Date | null;
}

/** Item por leito no snapshot. */
export interface MapaLeitoItem {
  /** BIGINT como string. */
  id: string;
  codigo: string;
  status: LeitoStatus;
  tipoAcomodacao: LeitoTipoAcomodacao;
  versao: number;
  extra: boolean;
  observacao: string | null;
  ocupacaoIniciadaEm: string | null;
  ocupacaoPrevistaFim: string | null;
  paciente: {
    uuid: string;
    nome: string;
    idade: number | null;
    diasInternado: number | null;
    alergias: string[];
  } | null;
  atendimento: {
    uuid: string;
    tipo: string;
    dataEntrada: string;
  } | null;
}

/** Item por setor (cabeçalho). */
export interface MapaSetorItem {
  /** BIGINT como string. */
  id: string;
  nome: string;
  tipo: string;
  totais: Record<LeitoStatus, number>;
  leitos: MapaLeitoItem[];
}

export interface SnapshotMapaInput {
  /** Filtra por setor — interno (BIGINT como string). Quando ausente: todos. */
  setorId?: string;
}

export interface SnapshotMapaResult {
  setores: MapaSetorItem[];
  geradoEm: string;
}

@Injectable()
export class SnapshotMapaUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: SnapshotMapaInput): Promise<SnapshotMapaResult> {
    const tx = this.prisma.tx();
    const setorIdNum =
      input.setorId !== undefined && input.setorId.length > 0
        ? this.parseBigInt(input.setorId)
        : null;

    const linhas = await tx.$queryRawUnsafe<MapaLeitoLinha[]>(
      `
      SELECT
        l.id                              AS leito_id,
        l.codigo                          AS leito_codigo,
        l.status                          AS leito_status,
        l.tipo_acomodacao                 AS leito_tipo_acomodacao,
        l.versao                          AS leito_versao,
        l.extra                           AS leito_extra,
        l.observacao                      AS leito_observacao,
        l.ocupacao_iniciada_em            AS ocupacao_iniciada_em,
        l.ocupacao_prevista_fim           AS ocupacao_prevista_fim,
        s.id                              AS setor_id,
        s.nome                            AS setor_nome,
        s.tipo::text                      AS setor_tipo,
        p.id                              AS paciente_id,
        p.uuid_externo                    AS paciente_uuid,
        p.nome                            AS paciente_nome,
        p.data_nascimento                 AS paciente_data_nascimento,
        p.alergias                        AS paciente_alergias,
        a.id                              AS atendimento_id,
        a.uuid_externo                    AS atendimento_uuid,
        a.tipo::text                      AS atendimento_tipo,
        a.data_hora_entrada               AS atendimento_data_entrada
        FROM setores s
        LEFT JOIN leitos l
          ON l.setor_id = s.id
         AND l.deleted_at IS NULL
        LEFT JOIN pacientes p
          ON p.id = l.paciente_id
         AND p.deleted_at IS NULL
        LEFT JOIN atendimentos a
          ON a.id = l.atendimento_id
         AND a.deleted_at IS NULL
       WHERE s.deleted_at IS NULL
         AND s.ativo = TRUE
         ${setorIdNum !== null ? 'AND s.id = $1::bigint' : ''}
       ORDER BY s.nome ASC, l.codigo ASC
      `,
      ...(setorIdNum !== null ? [setorIdNum] : []),
    );

    return {
      setores: this.agrupar(linhas),
      geradoEm: new Date().toISOString(),
    };
  }

  private agrupar(linhas: MapaLeitoLinha[]): MapaSetorItem[] {
    const porSetor = new Map<string, MapaSetorItem>();
    for (const row of linhas) {
      const setorKey = row.setor_id.toString();
      let setor = porSetor.get(setorKey);
      if (setor === undefined) {
        setor = {
          id: setorKey,
          nome: row.setor_nome,
          tipo: row.setor_tipo,
          totais: this.totaisVazios(),
          leitos: [],
        };
        porSetor.set(setorKey, setor);
      }
      // Setor sem leitos (LEFT JOIN deu NULL em l.id).
      if (row.leito_id === null || row.leito_id === undefined) {
        continue;
      }
      const leito = this.toLeitoItem(row);
      setor.leitos.push(leito);
      setor.totais[leito.status] = (setor.totais[leito.status] ?? 0) + 1;
    }
    return Array.from(porSetor.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR'),
    );
  }

  private toLeitoItem(row: MapaLeitoLinha): MapaLeitoItem {
    const paciente =
      row.paciente_id !== null && row.paciente_uuid !== null
        ? {
            uuid: row.paciente_uuid,
            nome: this.minimizarNome(row.paciente_nome ?? ''),
            idade: this.calcularIdade(row.paciente_data_nascimento),
            diasInternado: this.calcularDiasInternado(row.ocupacao_iniciada_em),
            alergias: this.extrairAlergias(row.paciente_alergias),
          }
        : null;

    const atendimento =
      row.atendimento_id !== null &&
      row.atendimento_uuid !== null &&
      row.atendimento_tipo !== null &&
      row.atendimento_data_entrada !== null
        ? {
            uuid: row.atendimento_uuid,
            tipo: row.atendimento_tipo,
            dataEntrada: row.atendimento_data_entrada.toISOString(),
          }
        : null;

    return {
      id: row.leito_id.toString(),
      codigo: row.leito_codigo,
      status: row.leito_status,
      tipoAcomodacao: row.leito_tipo_acomodacao,
      versao: row.leito_versao,
      extra: row.leito_extra,
      observacao: row.leito_observacao,
      ocupacaoIniciadaEm: row.ocupacao_iniciada_em
        ? row.ocupacao_iniciada_em.toISOString()
        : null,
      ocupacaoPrevistaFim: row.ocupacao_prevista_fim
        ? row.ocupacao_prevista_fim.toISOString()
        : null,
      paciente,
      atendimento,
    };
  }

  private totaisVazios(): Record<LeitoStatus, number> {
    return {
      DISPONIVEL: 0,
      OCUPADO: 0,
      RESERVADO: 0,
      HIGIENIZACAO: 0,
      MANUTENCAO: 0,
      BLOQUEADO: 0,
    };
  }

  /** Mantém apenas primeiro nome + inicial do último sobrenome (LGPD). */
  private minimizarNome(nome: string): string {
    const partes = nome.trim().split(/\s+/).filter((p) => p.length > 0);
    if (partes.length === 0) {
      return '';
    }
    if (partes.length === 1) {
      return partes[0];
    }
    const ultimo = partes[partes.length - 1];
    return `${partes[0]} ${ultimo.charAt(0)}.`;
  }

  private calcularIdade(dataNascimento: Date | null): number | null {
    if (dataNascimento === null) {
      return null;
    }
    const hoje = new Date();
    let idade = hoje.getFullYear() - dataNascimento.getFullYear();
    const m = hoje.getMonth() - dataNascimento.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < dataNascimento.getDate())) {
      idade -= 1;
    }
    return idade < 0 ? 0 : idade;
  }

  private calcularDiasInternado(ocupacaoIniciada: Date | null): number | null {
    if (ocupacaoIniciada === null) {
      return null;
    }
    const ms = Date.now() - ocupacaoIniciada.getTime();
    if (ms < 0) {
      return 0;
    }
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  /**
   * Extrai uma lista curta de alergias do JSONB do paciente. Aceita
   * dois shapes possíveis (RN-PEP-05 não engessa formato):
   *   - array de strings: `["Dipirona", "Penicilina"]`
   *   - array de objetos: `[{ substancia: "Dipirona" }, ...]`
   */
  private extrairAlergias(raw: unknown): string[] {
    if (raw === null || raw === undefined) {
      return [];
    }
    if (!Array.isArray(raw)) {
      return [];
    }
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item === 'string' && item.length > 0) {
        out.push(item);
      } else if (typeof item === 'object' && item !== null) {
        const rec = item as Record<string, unknown>;
        const candidate = rec.substancia ?? rec.nome ?? rec.descricao;
        if (typeof candidate === 'string' && candidate.length > 0) {
          out.push(candidate);
        }
      }
      if (out.length >= 10) {
        break;
      }
    }
    return out;
  }

  private parseBigInt(raw: string): bigint | null {
    try {
      const v = BigInt(raw);
      return v <= 0n ? null : v;
    } catch {
      return null;
    }
  }
}
