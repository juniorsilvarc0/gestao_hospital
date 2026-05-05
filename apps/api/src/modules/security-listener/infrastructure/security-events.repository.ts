/**
 * `SecurityEventsRepository` — persistência dos eventos de segurança
 * disparados pelos listeners do módulo `security-listener`.
 *
 * Tabela: `audit_security_events` (criada na migration
 * `20260505031110_hardening_lgpd_admin`).
 *
 * RLS: a política permite escrita quando `tenant_id IS NULL` ou bate
 * com `app.current_tenant_id`. Como os listeners executam no contexto
 * da request do usuário (mesmo `RequestContextStorage`), o
 * `prisma.tx()` já está com `SET LOCAL app.current_tenant_id`, então
 * `INSERT` passa naturalmente. Eventos cross-tenant (sem tenant)
 * usam `tenant_id IS NULL`.
 *
 * Outras operações:
 *   - `bloquearUsuario`: atualiza `usuarios.bloqueado_ate`.
 *   - `revogarRefreshTokensUsuario`: marca `sessoes_ativas.revogada_em`
 *     (a tabela de refresh-tokens neste projeto chama-se
 *     `sessoes_ativas`).
 */
import { Injectable, Logger } from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export type SecurityEventTipo =
  | 'TENANT_VIOLATION'
  | 'PERFIL_ALTERADO'
  | 'BLOQUEIO_TEMPORARIO'
  | 'BLOQUEIO_DEFINITIVO'
  | 'CERTIFICADO_INVALIDO'
  | 'EXPORT_MASSA_TENTATIVA'
  | 'TOKEN_REUSO_DETECTADO'
  | 'OUTROS';

export type SecurityEventSeveridade =
  | 'INFO'
  | 'WARNING'
  | 'ALERTA'
  | 'CRITICO';

export interface InsertSecurityEventArgs {
  tenantId?: bigint | null;
  tipo: SecurityEventTipo;
  severidade: SecurityEventSeveridade;
  usuarioId?: bigint | null;
  alvoUsuarioId?: bigint | null;
  ipOrigem?: string | null;
  userAgent?: string | null;
  requestPath?: string | null;
  requestMethod?: string | null;
  detalhes: Record<string, unknown>;
}

@Injectable()
export class SecurityEventsRepository {
  private readonly logger = new Logger(SecurityEventsRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insere um evento. Tenta primeiro pelo `prisma.tx()` (mesma transação
   * da request, com tenant context). Se falhar (ex.: chamada fora de
   * request), cai no client global — ainda assim respeitamos RLS via
   * `tenant_id` explícito.
   *
   * Nunca lança: erro é logado e engolido. Auditoria perdida é ruim,
   * mas pior seria abortar a request original (login, etc.).
   */
  async insertEvent(args: InsertSecurityEventArgs): Promise<void> {
    const ctx = RequestContextStorage.get();
    const tenantId =
      args.tenantId !== undefined ? args.tenantId : ctx?.tenantId ?? null;

    const client = ctx?.tx ?? this.prisma;
    try {
      await client.$executeRaw`
        INSERT INTO audit_security_events (
          tenant_id, tipo, severidade, usuario_id, alvo_usuario_id,
          ip_origem, user_agent, request_path, request_method, detalhes
        ) VALUES (
          ${tenantId}::bigint,
          ${args.tipo}::enum_security_event_tipo,
          ${args.severidade}::enum_security_event_severidade,
          ${args.usuarioId ?? null}::bigint,
          ${args.alvoUsuarioId ?? null}::bigint,
          ${args.ipOrigem ?? null}::inet,
          ${args.userAgent ?? null},
          ${args.requestPath ?? null},
          ${args.requestMethod ?? null},
          ${JSON.stringify(args.detalhes)}::jsonb
        )
      `;
    } catch (err: unknown) {
      this.logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          tipo: args.tipo,
          severidade: args.severidade,
        },
        'Falha ao inserir audit_security_event',
      );
    }
  }

  /**
   * Marca o usuário como bloqueado até `ate`. Usado em
   * `BLOQUEIO_TEMPORARIO` (15min) — paralelo ao `LockoutService`,
   * que já bloqueia via Redis.
   */
  async bloquearUsuario(usuarioId: bigint, ate: Date): Promise<void> {
    const ctx = RequestContextStorage.get();
    const client = ctx?.tx ?? this.prisma;
    try {
      await client.$executeRaw`
        UPDATE usuarios
           SET bloqueado_ate = ${ate}::timestamptz,
               updated_at = now()
         WHERE id = ${usuarioId}::bigint
      `;
    } catch (err: unknown) {
      this.logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          usuarioId: usuarioId.toString(),
        },
        'Falha ao bloquear usuário',
      );
    }
  }

  /**
   * Revoga TODOS os refresh tokens do usuário marcando
   * `sessoes_ativas.revogada_em = now()`. Usado em:
   *   - TOKEN_REUSO_DETECTADO (RN-SEG-04)
   *   - TENANT_VIOLATION       (RN-SEG-06)
   *
   * Não fazemos DELETE: queremos manter o histórico de sessões para
   * auditoria forense.
   */
  async revogarRefreshTokensUsuario(usuarioId: bigint): Promise<void> {
    const ctx = RequestContextStorage.get();
    const client = ctx?.tx ?? this.prisma;
    try {
      await client.$executeRaw`
        UPDATE sessoes_ativas
           SET revogada_em = now()
         WHERE usuario_id = ${usuarioId}::bigint
           AND revogada_em IS NULL
      `;
    } catch (err: unknown) {
      this.logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          usuarioId: usuarioId.toString(),
        },
        'Falha ao revogar refresh tokens',
      );
    }
  }
}
