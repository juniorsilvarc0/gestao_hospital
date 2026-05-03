/**
 * Helpers de domínio que resolvem o paciente do usuário logado a partir
 * do `RequestContextStorage`. Centralizam a checagem `tipo_perfil =
 * PACIENTE` + presença de `paciente_id`, e devolvem os identificadores
 * BIGINT/UUID do paciente para os use cases consumirem.
 *
 * Por que existe?
 *   - Todos os endpoints `/v1/portal/paciente/*` filtram por
 *     `paciente_id` derivado do JWT. Sem helper, cada use case repetiria
 *     a mesma query e o mesmo guard 403.
 *   - A constraint `ck_usuarios_tipo_vinculo` garante coerência no
 *     banco — aqui apenas validamos que o registro vivo do usuário
 *     respeita o invariante. Se não respeitar, é erro 500 (config).
 *
 * Os IDs do paciente são lidos via `prisma.tx()` — RLS já está aplicada
 * pelo `TenantContextInterceptor`, então a busca naturalmente respeita
 * o tenant.
 */
import { ForbiddenException, Injectable } from '@nestjs/common';

import { RequestContextStorage } from '../../../common/context/request-context';
import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface PacienteContext {
  /** ID do usuário (login) que efetuou a request. */
  userId: bigint;
  /** Tenant atual. */
  tenantId: bigint;
  /** ID interno do paciente vinculado ao usuário. */
  pacienteId: bigint;
  /** UUID externo do paciente. */
  pacienteUuid: string;
}

@Injectable()
export class PacienteContextResolver {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve o paciente do request. Lança 403 quando:
   *   - não há request context (chamada fora de HTTP);
   *   - o usuário não é do tipo PACIENTE;
   *   - o usuário PACIENTE está sem `paciente_id` (config inconsistente).
   */
  async resolve(): Promise<PacienteContext> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new ForbiddenException({
        code: 'PORTAL_PACIENTE_NO_CONTEXT',
        message: 'Request sem contexto autenticado.',
      });
    }

    const tx = this.prisma.tx();
    const rows = await tx.$queryRaw<
      {
        paciente_id: bigint | null;
        tipo_perfil: 'INTERNO' | 'PRESTADOR' | 'PACIENTE';
        paciente_uuid: string | null;
      }[]
    >`
      SELECT u.paciente_id,
             u.tipo_perfil::text AS tipo_perfil,
             p.uuid_externo::text AS paciente_uuid
        FROM usuarios u
        LEFT JOIN pacientes p ON p.id = u.paciente_id AND p.deleted_at IS NULL
       WHERE u.id = ${ctx.userId}::bigint
         AND u.deleted_at IS NULL
       LIMIT 1
    `;

    if (rows.length === 0) {
      throw new ForbiddenException({
        code: 'PORTAL_PACIENTE_USER_NOT_FOUND',
        message: 'Usuário não encontrado ou inativo.',
      });
    }
    const row = rows[0];
    if (row.tipo_perfil !== 'PACIENTE') {
      throw new ForbiddenException({
        code: 'PORTAL_PACIENTE_FORBIDDEN_PROFILE',
        message:
          'Endpoint restrito a usuários do tipo PACIENTE (portal). Verifique tipo_perfil.',
      });
    }
    if (row.paciente_id === null || row.paciente_uuid === null) {
      throw new ForbiddenException({
        code: 'PORTAL_PACIENTE_NO_PATIENT_LINK',
        message: 'Usuário PACIENTE sem vínculo com paciente_id.',
      });
    }

    return {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      pacienteId: row.paciente_id,
      pacienteUuid: row.paciente_uuid,
    };
  }
}
