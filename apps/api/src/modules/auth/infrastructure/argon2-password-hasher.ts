/**
 * Argon2id password hasher.
 *
 * Parâmetros (RNF-002 / RN-SEG-01):
 *   - type:        argon2id
 *   - memoryCost:  64 MB (65536 KiB)
 *   - timeCost:    3
 *   - parallelism: 4
 *
 * Esses parâmetros são MAIORES que os mínimos do OWASP 2024 e
 * compatíveis com o seed da Fase 1 (que já usa os mesmos valores).
 *
 * `verify` é constant-time (libsodium-based via `argon2`).
 */
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private readonly options: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 64 * 1024,
    timeCost: 3,
    parallelism: 4,
  };

  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Hash mal formado / inválido — trata como mismatch (não vaza
      // detalhe ao caller).
      return false;
    }
  }
}

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
