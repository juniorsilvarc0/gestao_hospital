/**
 * Bounded Context: Identity & Access (Auth) — Fase 2.
 *
 * COORDENAÇÃO ENTRE TRILHAS:
 *   - Trilha A (auth core): LoginController/UseCases, PasswordHasher,
 *     JwtService, LockoutService, PwnedPasswords, AuthAudit, AccessTokenGuard.
 *     Exporta JWT_SERVICE/PASSWORD_HASHER/etc. para Trilhas B/C.
 *   - Trilha B (MFA): MfaModule importado abaixo. Exporta MfaService/MfaGuard/
 *     TotpGenerator. O LoginUseCase pode injetar MfaService quando
 *     RN-SEG-02 for plugado em PR posterior (ainda dentro da Fase 2).
 *   - Trilha C (RBAC): PermissionsGuard global + @Public() (decorator já
 *     criado em `common/decorators`). NÃO marque
 *     `/auth/mfa/verify` como @Public() — exige autenticação (parcial).
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MfaModule } from './mfa/mfa.module';
import { AuthController } from './auth.controller';
// Use cases
import { LoginUseCase } from './application/login.use-case';
import { RefreshTokenUseCase } from './application/refresh-token.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import { LogoutAllUseCase } from './application/logout-all.use-case';
import { ChangePasswordUseCase } from './application/change-password.use-case';
import { ForgotPasswordUseCase } from './application/forgot-password.use-case';
import { ResetPasswordUseCase } from './application/reset-password.use-case';
// Infra
import {
  Argon2PasswordHasher,
  PASSWORD_HASHER,
} from './infrastructure/argon2-password-hasher';
import { JoseJwtService, JWT_SERVICE } from './infrastructure/jose-jwt-service';
import { LockoutService } from './infrastructure/lockout.service';
import { PwnedPasswordsService } from './infrastructure/pwned-passwords.guard';
import { AuthAuditService } from './infrastructure/auth-audit.service';
import { PasswordResetTokenStore } from './infrastructure/password-reset-token.store';
import { MailerService } from './infrastructure/mailer.service';
import { AccessTokenGuard } from './infrastructure/access-token.guard';
import { redisProvider, REDIS_CLIENT } from './infrastructure/redis.provider';

@Module({
  imports: [ConfigModule, MfaModule],
  controllers: [AuthController],
  providers: [
    // Redis (cliente compartilhado).
    redisProvider,
    // Hashers + JWT (Symbol token + classe concreta — ambos disponíveis).
    Argon2PasswordHasher,
    { provide: PASSWORD_HASHER, useExisting: Argon2PasswordHasher },
    JoseJwtService,
    { provide: JWT_SERVICE, useExisting: JoseJwtService },
    // Stores e helpers.
    LockoutService,
    PwnedPasswordsService,
    AuthAuditService,
    PasswordResetTokenStore,
    MailerService,
    AccessTokenGuard,
    // Use cases.
    LoginUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    LogoutAllUseCase,
    ChangePasswordUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
  ],
  exports: [
    // Trilha B/C consumirão estes serviços.
    MfaModule,
    JWT_SERVICE,
    JoseJwtService,
    PASSWORD_HASHER,
    Argon2PasswordHasher,
    LockoutService,
    PwnedPasswordsService,
    AuthAuditService,
    AccessTokenGuard,
    REDIS_CLIENT,
  ],
})
export class AuthModule {}
