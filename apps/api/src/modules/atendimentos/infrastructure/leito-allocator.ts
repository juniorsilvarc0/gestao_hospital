/**
 * `LeitoAllocator` — coração da Fase 5 (INVARIANTE CRÍTICA #2).
 *
 * Garante: **dois pacientes nunca ocupam o mesmo leito**.
 *
 * Defesa em camadas (race condition):
 *
 *   1. `SELECT ... FOR UPDATE` na linha do leito — bloqueia até
 *      COMMIT/ROLLBACK da transação atual. Só uma transação por vez
 *      avança a partir daqui.
 *   2. Checagem da `versao` (otimistic lock) — bate com o que a UI
 *      enviou. Detecta caso "alguém alterou o leito desde o último
 *      GET /v1/leitos/mapa". Sem isso, dois operadores poderiam
 *      "ignorar" status = HIGIENIZACAO se um deles refrescou o cache
 *      depois do outro.
 *   3. Checagem do `status` — só `DISPONIVEL` aceita alocação.
 *   4. `UPDATE ... WHERE versao = ? AND status = 'DISPONIVEL'` — se
 *      por qualquer motivo (ex.: trigger externa) o estado mudou
 *      entre o SELECT e o UPDATE, o WHERE filtra e `executeRaw`
 *      devolve 0 rows → conflict.
 *
 * **Não há retorno parcial.** Em qualquer falha lança
 * `LeitoConflictError`, e o controller trata como 409.
 *
 * **NÃO abre transação nova**: confia que o handler está dentro do
 * `prisma.$transaction` aberto pelo `TenantContextInterceptor` —
 * abrir nested transaction não faz savepoint no Prisma e levaria a
 * comportamento confuso. O ROLLBACK acontece pelo throw.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { LeitoConflictError } from './leito-conflict.error';

interface AlocarLeitoInput {
  leitoUuid: string;
  leitoVersao: number;
  atendimentoId: bigint;
  pacienteId: bigint;
}

interface AlocarLeitoResult {
  leitoId: bigint;
  novaVersao: number;
}

interface LiberarLeitoInput {
  leitoId: bigint;
  /** `HIGIENIZACAO` (default) ou `DISPONIVEL` (apenas em casos forçados pelo BI). */
  novoStatus?: 'HIGIENIZACAO' | 'DISPONIVEL';
}

interface LiberarLeitoResult {
  leitoId: bigint;
  novaVersao: number;
}

interface LeitoLockedRow {
  id: bigint;
  versao: number;
  status: string;
}

@Injectable()
export class LeitoAllocator {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aloca o leito para o atendimento. Retorna a nova `versao` do leito.
   * Lança `LeitoConflictError` em qualquer race / status incompatível.
   */
  async alocar(input: AlocarLeitoInput): Promise<AlocarLeitoResult> {
    const tx = this.prisma.tx();

    // 1. SELECT FOR UPDATE — bloqueia a linha até COMMIT.
    const leitoRows = await tx.$queryRaw<LeitoLockedRow[]>`
      SELECT id, versao, status::text AS status
        FROM leitos
       WHERE uuid_externo = ${input.leitoUuid}::uuid
       FOR UPDATE
    `;
    if (leitoRows.length === 0) {
      throw new LeitoConflictError('NOT_FOUND', null, 'Leito não encontrado.');
    }
    const leito = leitoRows[0];

    if (leito.versao !== input.leitoVersao) {
      throw new LeitoConflictError(
        'STALE_VERSION',
        leito.versao,
        `Versão stale: enviada ${input.leitoVersao}, atual ${leito.versao}.`,
      );
    }
    if (leito.status !== 'DISPONIVEL') {
      throw new LeitoConflictError(
        'NOT_DISPONIVEL',
        leito.versao,
        `Leito não disponível (status atual: ${leito.status}).`,
      );
    }

    // 2. UPDATE atômico com guarda na versão e no status.
    const updated = await tx.$executeRaw`
      UPDATE leitos
         SET status               = 'OCUPADO'::enum_leito_status,
             paciente_id          = ${input.pacienteId}::bigint,
             atendimento_id       = ${input.atendimentoId}::bigint,
             ocupacao_iniciada_em = now(),
             versao               = versao + 1
       WHERE id = ${leito.id}::bigint
         AND versao = ${input.leitoVersao}::int
         AND status = 'DISPONIVEL'::enum_leito_status
    `;
    if (updated === 0) {
      // Última linha de defesa — alguém ganhou a corrida entre SELECT
      // FOR UPDATE e UPDATE (improvável, mas a guarda existe).
      throw new LeitoConflictError(
        'RACE',
        leito.versao,
        'Race condition detectada na alocação.',
      );
    }

    return { leitoId: leito.id, novaVersao: input.leitoVersao + 1 };
  }

  /**
   * Libera o leito (alta / transferência). Sempre `HIGIENIZACAO` por
   * default — fluxo de limpeza vira `DISPONIVEL` depois (Fase 5 / mapa).
   */
  async liberar(input: LiberarLeitoInput): Promise<LiberarLeitoResult> {
    const tx = this.prisma.tx();
    const novoStatus = input.novoStatus ?? 'HIGIENIZACAO';

    // SELECT FOR UPDATE também aqui — protege contra dupla liberação.
    const leitoRows = await tx.$queryRaw<LeitoLockedRow[]>`
      SELECT id, versao, status::text AS status
        FROM leitos
       WHERE id = ${input.leitoId}::bigint
       FOR UPDATE
    `;
    if (leitoRows.length === 0) {
      throw new LeitoConflictError('NOT_FOUND', null, 'Leito não encontrado.');
    }
    const leito = leitoRows[0];

    // Idempotência: se já está em HIGIENIZACAO/DISPONIVEL, não erra,
    // só não atualiza (mantém versao).
    if (leito.status === novoStatus) {
      return { leitoId: leito.id, novaVersao: leito.versao };
    }

    const updated = await tx.$executeRaw`
      UPDATE leitos
         SET status               = ${novoStatus}::enum_leito_status,
             paciente_id          = NULL,
             atendimento_id       = NULL,
             ocupacao_iniciada_em = NULL,
             versao               = versao + 1
       WHERE id = ${leito.id}::bigint
         AND versao = ${leito.versao}::int
    `;
    if (updated === 0) {
      throw new LeitoConflictError(
        'RACE',
        leito.versao,
        'Race condition na liberação do leito.',
      );
    }
    return { leitoId: leito.id, novaVersao: leito.versao + 1 };
  }
}
