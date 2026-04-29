/**
 * MfaModule — Trilha B / Fase 2.
 *
 * Quem importa: AuthModule (Trilha A) deve fazer
 *   `imports: [MfaModule]`
 * para expor os endpoints `/auth/mfa/*` e ter `MfaService` disponível
 * para injetar no LoginUseCase (segundo fator + enforcement RN-SEG-02).
 *
 * Exports:
 *   - MfaService          → consumido pelo LoginUseCase (Trilha A).
 *   - MfaGuard            → usado em rotas com @RequireMfa().
 *   - TotpGenerator       → reuse em testes E2E e seeds.
 *
 * Providers internos:
 *   - RECOVERY_CODE_HASHER → Argon2RecoveryCodeHasher (default).
 *     Trilha A pode override registrando outro `useExisting`.
 */
import { Module } from '@nestjs/common';

import { MfaController } from './mfa.controller';
import { MfaService, PASSWORD_HASHER } from './mfa.service';
import { TotpGenerator } from './infrastructure/totp-generator';
import { MfaGuard } from './decorators/mfa.guard';
import {
  Argon2RecoveryCodeHasher,
  RECOVERY_CODE_HASHER,
} from './infrastructure/recovery-code-hasher';

/**
 * Provider de PASSWORD_HASHER específico do MfaModule.
 *
 * O MfaModule é importado pelo AuthModule (Trilha A); como em NestJS os
 * providers só fluem do `imports` para fora via `exports`, NÃO temos
 * acesso ao Argon2PasswordHasher da Trilha A aqui (seria circular ou
 * exigiria forwardRef + duplicação de exports). Solução pragmática:
 * registrar o mesmo Argon2id como provider local do MFA. Como ambos
 * compartilham os parâmetros (memCost 64 MiB, timeCost 3, argon2id),
 * verify do mesmo hash funciona em qualquer um.
 *
 * Se a Trilha A quiser unificar via Symbol global, basta substituir este
 * provider por `{ provide: PASSWORD_HASHER, useExisting: Argon2PasswordHasher }`
 * dentro de uma feature module composta — por ora, isolar é mais seguro.
 */
@Module({
  controllers: [MfaController],
  providers: [
    MfaService,
    TotpGenerator,
    MfaGuard,
    Argon2RecoveryCodeHasher,
    {
      provide: RECOVERY_CODE_HASHER,
      useClass: Argon2RecoveryCodeHasher,
    },
    {
      // Reutiliza o mesmo Argon2RecoveryCodeHasher (Argon2id 64MiB×3) para
      // verificar a senha em /disable. O hash gravado em
      // `usuarios.senha_hash` pela seed/Trilha A usa argon2id também — o
      // formato PHC é cross-compatível.
      provide: PASSWORD_HASHER,
      useExisting: Argon2RecoveryCodeHasher,
    },
  ],
  exports: [MfaService, MfaGuard, TotpGenerator],
})
export class MfaModule {}
