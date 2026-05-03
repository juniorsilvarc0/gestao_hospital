/**
 * `MedicoOnlyGuard` — gate adicional aplicado a TODOS os endpoints do
 * Portal do Médico.
 *
 * Roda DEPOIS do `JwtAuthGuard` e do `PermissionsGuard` (globais), via
 * `@UseGuards()` no controller. Bloqueia 403 se:
 *   - o usuário não está vinculado a um prestador (`prestador_id` NULL); OU
 *   - o usuário tem `tipo_perfil = 'PACIENTE'` (paciente não pode entrar
 *     no portal médico mesmo que tenha permissão por bug); OU
 *   - o usuário foi soft-deleted ou desativado.
 *
 * Como a checagem da permissão `portal_medico:*` já é feita pelo
 * `PermissionsGuard`, este guard só vincula o `prestador_id` ao request
 * (`request.medicoContext`) para que os use cases o leiam sem refazer
 * o lookup.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import { PortalMedicoRepository } from './portal-medico.repository';

export interface MedicoRequestContext {
  userId: bigint;
  tenantId: bigint;
  prestadorId: bigint;
}

declare module 'express' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Request {
    medicoContext?: MedicoRequestContext;
  }
}

@Injectable()
export class MedicoOnlyGuard implements CanActivate {
  constructor(private readonly repo: PortalMedicoRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (user === undefined) {
      throw new ForbiddenException({
        code: 'AUTH_NOT_AUTHENTICATED',
        message: 'Usuário não autenticado.',
      });
    }

    const usuario = await this.repo.findUsuarioMedicoById(user.sub);
    if (
      usuario === null ||
      usuario.deleted_at !== null ||
      usuario.ativo === false
    ) {
      throw new ForbiddenException({
        code: 'PORTAL_MEDICO_USUARIO_INVALIDO',
        message: 'Usuário inativo ou inexistente.',
      });
    }

    if (usuario.tipo_perfil === 'PACIENTE') {
      throw new ForbiddenException({
        code: 'PORTAL_MEDICO_PERFIL_PACIENTE',
        message: 'Paciente não pode acessar o Portal do Médico.',
      });
    }

    if (usuario.prestador_id === null) {
      throw new ForbiddenException({
        code: 'PORTAL_MEDICO_SEM_PRESTADOR',
        message:
          'Usuário não está vinculado a um prestador — Portal do Médico inacessível.',
      });
    }

    request.medicoContext = {
      userId: user.sub,
      tenantId: user.tid,
      prestadorId: usuario.prestador_id,
    };
    return true;
  }
}

/**
 * Helper para extrair o `MedicoRequestContext` em um use case com
 * mensagem de erro coesa caso o guard tenha sido bypassado.
 */
export function requireMedicoContext(req: Request): MedicoRequestContext {
  const ctx = req.medicoContext;
  if (ctx === undefined) {
    throw new ForbiddenException({
      code: 'PORTAL_MEDICO_CONTEXT_MISSING',
      message: 'MedicoOnlyGuard não rodou para esta rota.',
    });
  }
  return ctx;
}
