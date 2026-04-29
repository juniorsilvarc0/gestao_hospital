/**
 * Hasher de recovery codes — Argon2id.
 *
 * Mantemos uma INTERFACE explícita (`RecoveryCodeHasher`) para que a
 * Trilha A possa, quando publicar seu `PasswordHasher` global, registrar
 * um provider que troque a implementação SEM o módulo MFA precisar
 * reimportar nada — basta:
 *
 *   {
 *     provide: RECOVERY_CODE_HASHER,
 *     useExisting: PasswordHasher,
 *   }
 *
 * Argon2id parameters seguem OWASP 2024 (memoryCost 64 MiB,
 * timeCost 3, parallelism 1) — mesmo perfil esperado de senhas, e
 * recovery codes têm entropia menor (32 bits cada) então NÃO podem
 * usar SHA-256 cru ou bcrypt.
 */
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

export const RECOVERY_CODE_HASHER = Symbol('RECOVERY_CODE_HASHER');

export interface RecoveryCodeHasher {
  hash(plain: string): Promise<string>;
  verify(hashStored: string, plain: string): Promise<boolean>;
}

@Injectable()
export class Argon2RecoveryCodeHasher implements RecoveryCodeHasher {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 64 * 1024,
      timeCost: 3,
      parallelism: 1,
    });
  }

  async verify(hashStored: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hashStored, plain);
    } catch {
      // Hash corrompido / formato inválido — tratamos como "não bate".
      return false;
    }
  }
}
