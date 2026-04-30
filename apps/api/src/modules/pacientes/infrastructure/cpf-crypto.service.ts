/**
 * `CpfCryptoService` — cifra/decifra CPF e calcula hash determinístico
 * para busca (DB.md §6.4).
 *
 * Estratégia (RN-LGP-07):
 *   - `cpf_encrypted` (BYTEA) = `pgp_sym_encrypt(cpf_normalized, KEY)`
 *     via `pgcrypto`. A chave **não viaja** com o dado — só é conhecida
 *     pelo backend (via `PGCRYPTO_KEY` em dev; KMS em produção).
 *   - `cpf_hash` (VARCHAR 64) = SHA-256 hex de `cpf_normalized`. Hash
 *     determinístico permite consultar `WHERE cpf_hash = ?` em
 *     constant-time, sem decifrar.
 *
 * Responsabilidades:
 *   - `normalize(raw)` — só dígitos (rejeita NULL/empty).
 *   - `hashCpf(raw)` — devolve o hash hex (lower-case).
 *   - `encryptCpf(raw, tx)` — devolve o BYTEA cifrado (`Buffer`),
 *     porque `pgp_sym_encrypt` só roda dentro do banco. Recebe `tx`
 *     para herdar a transação (RLS-aware).
 *   - `decryptCpf(encrypted, tx)` — devolve o CPF em claro. **NÃO
 *     CHAME** em handlers de listagem; só onde for estritamente
 *     necessário (ex.: TISS, geração de guia, exportação LGPD).
 *
 * Notas:
 *   - SHA-256 sem salt é determinístico por design (permite busca);
 *     CPF tem só 10⁹ valores possíveis — em teoria dicionário-attack
 *     viável. Mitigado pelo fato de o `cpf_hash` viver dentro do
 *     próprio Postgres com RLS + pg_audit; quem tem acesso ao DB já
 *     tem o problema maior. Salt determinístico (HMAC com chave
 *     secreta) é a evolução natural quando o KMS estiver pronto.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

import type { Config } from '../../../config/configuration';
import type { TransactionalPrismaClient } from '../../../common/context/request-context';

@Injectable()
export class CpfCryptoService {
  private readonly logger = new Logger(CpfCryptoService.name);
  private readonly key: string;

  constructor(private readonly config: ConfigService<Config, true>) {
    this.key = this.config.get('PGCRYPTO_KEY', { infer: true });
  }

  /**
   * Remove tudo que não for dígito. Retorna `undefined` se vazio.
   * (Validação completa de DV fica no `CpfValidator`.)
   */
  normalize(raw: string | null | undefined): string | undefined {
    if (raw === null || raw === undefined) {
      return undefined;
    }
    const digits = raw.replace(/\D/g, '');
    return digits.length === 0 ? undefined : digits;
  }

  /**
   * SHA-256 hex (lower-case, 64 chars) do CPF normalizado.
   * Usado em `cpf_hash` para busca determinística e em uniqueness
   * constraint (`uq_pacientes_cpf_tenant`).
   */
  hashCpf(raw: string): string {
    const normalized = this.normalize(raw);
    if (normalized === undefined) {
      throw new Error('hashCpf received empty CPF');
    }
    return createHash('sha256').update(normalized, 'utf8').digest('hex');
  }

  /**
   * Cifra o CPF com `pgp_sym_encrypt` dentro da transação atual.
   * Devolve o `Buffer` (BYTEA) que pode ir direto no Prisma como
   * `cpf_encrypted`.
   */
  async encryptCpf(
    raw: string,
    tx: TransactionalPrismaClient,
  ): Promise<Buffer> {
    const normalized = this.normalize(raw);
    if (normalized === undefined) {
      throw new Error('encryptCpf received empty CPF');
    }
    const rows = await tx.$queryRaw<{ encrypted: Buffer }[]>`
      SELECT pgp_sym_encrypt(${normalized}::text, ${this.key}::text) AS encrypted
    `;
    if (rows.length === 0 || rows[0].encrypted === null) {
      throw new Error('pgp_sym_encrypt returned empty result');
    }
    return rows[0].encrypted;
  }

  /**
   * Decifra um BYTEA produzido por `encryptCpf`. Use somente quando
   * absolutamente necessário (RN-LGP-07: PHI minimization). Retorna
   * `undefined` se o blob for nulo ou vazio.
   */
  async decryptCpf(
    encrypted: Buffer | null | undefined,
    tx: TransactionalPrismaClient,
  ): Promise<string | undefined> {
    if (encrypted === null || encrypted === undefined || encrypted.length === 0) {
      return undefined;
    }
    try {
      const rows = await tx.$queryRaw<{ decrypted: string | null }[]>`
        SELECT pgp_sym_decrypt(${encrypted}::bytea, ${this.key}::text) AS decrypted
      `;
      if (rows.length === 0 || rows[0].decrypted === null) {
        return undefined;
      }
      return rows[0].decrypted;
    } catch (err: unknown) {
      // Não logamos o blob nem a chave (PHI/secret).
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'pgp_sym_decrypt failed (chave incorreta ou blob corrompido)',
      );
      return undefined;
    }
  }
}
