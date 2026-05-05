/**
 * `SecurityEventEmitterService` — fachada utilitária para outros
 * módulos emitirem eventos de segurança lógicos sem precisarem
 * importar o `EventEmitter2` diretamente.
 *
 * Uso:
 *   constructor(private readonly events: SecurityEventEmitterService) {}
 *   ...
 *   this.events.emit('auth.login_failed', { ip, email });
 *
 * Eventos canônicos (consumidos pelos listeners deste módulo):
 *   - 'auth.login_failed'           → login falhou (rate-limit + audit)
 *   - 'security.tenant_violation'   → JWT.tid != tenant tentado
 *   - 'usuario.perfil_alterado'     → admin mudou perfil de outro user
 *   - 'auth.refresh_token_reuso'    → refresh token rotativo reusado
 *
 * Despacho: `EventEmitter2` é síncrono (a menos que listener use
 * `{ async: true }`). Os listeners deste módulo usam `async: true`
 * para não bloquear a request original — o `RequestContextStorage`
 * permanece acessível porque `EventEmitter2` propaga o
 * `AsyncLocalStorage` corretamente.
 */
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class SecurityEventEmitterService {
  constructor(private readonly emitter: EventEmitter2) {}

  emit(eventName: string, payload: Record<string, unknown>): void {
    this.emitter.emit(eventName, payload);
  }
}
