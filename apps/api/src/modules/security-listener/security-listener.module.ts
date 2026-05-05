/**
 * Bounded Context: Security Listener — Fase 13 / Trilha R-B.
 *
 * Pipeline reativo que ouve eventos de domínio e materializa
 * registros em `audit_security_events`.
 *
 * Eventos consumidos:
 *   - 'auth.login_failed'         → LoginFailedListener
 *                                     (rate-limit + BLOQUEIO_TEMPORARIO/
 *                                      BLOQUEIO_DEFINITIVO)
 *   - 'security.tenant_violation' → TenantViolationListener
 *                                     (TENANT_VIOLATION + revoga tokens)
 *   - 'usuario.perfil_alterado'   → PerfilAlteradoListener
 *                                     (PERFIL_ALTERADO)
 *   - 'auth.refresh_token_reuso'  → TokenReusoListener
 *                                     (TOKEN_REUSO_DETECTADO + revoga tokens)
 *
 * Quem emite? O esperado é que `auth/`, `users/admin` e o
 * `TenantContextInterceptor` chamem `SecurityEventEmitterService.emit(...)`.
 * Em fases anteriores (R-A2 / R-C) outras trilhas vão plugar essas
 * chamadas — este módulo entrega APENAS o ponto de escuta.
 *
 * O `RateLimitTracker` é singleton dentro do processo (ver doc do
 * tracker para implicações em deploy multi-réplica).
 */
import { Module } from '@nestjs/common';

import { SecurityEventEmitterService } from './application/security-event-emitter.service';
import { RateLimitTracker } from './domain/rate-limit-tracker';
import { LoginFailedListener } from './infrastructure/listeners/login-failed.listener';
import { PerfilAlteradoListener } from './infrastructure/listeners/perfil-alterado.listener';
import { TenantViolationListener } from './infrastructure/listeners/tenant-violation.listener';
import { TokenReusoListener } from './infrastructure/listeners/token-reuso.listener';
import { SecurityEventsRepository } from './infrastructure/security-events.repository';

@Module({
  providers: [
    // Singleton in-memory (ver doc do tracker).
    { provide: RateLimitTracker, useValue: new RateLimitTracker() },
    SecurityEventsRepository,
    SecurityEventEmitterService,
    // Listeners (registrados via @OnEvent).
    LoginFailedListener,
    TenantViolationListener,
    PerfilAlteradoListener,
    TokenReusoListener,
  ],
  exports: [SecurityEventEmitterService, SecurityEventsRepository],
})
export class SecurityListenerModule {}
