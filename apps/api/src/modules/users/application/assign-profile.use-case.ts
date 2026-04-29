/**
 * Use case: `POST /users/{uuid}/perfis` (admin).
 *
 * Vincula (`attach`) ou revoga (`detach`) um perfil ao usuário.
 * Sempre gera evento de auditoria `auth.profile.changed` (RN-SEG-07)
 * com admin origem e usuário-alvo.
 */
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import { PermissionsCacheService } from '../../../common/cache/permissions-cache.service';
import type { AssignProfileDto } from '../dto/assign-profile.dto';

@Injectable()
export class AssignProfileUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly cache: PermissionsCacheService,
  ) {}

  async execute(uuid: string, dto: AssignProfileDto): Promise<void> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error('AssignProfileUseCase requires a request context.');
    }
    const tx = this.prisma.tx();

    const usuario = await tx.usuario.findFirst({
      where: { uuidExterno: uuid },
      select: { id: true },
    });
    if (usuario === null) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Usuário não encontrado.',
      });
    }

    const perfil = await tx.perfil.findFirst({
      where: { codigo: dto.perfilCodigo, ativo: true },
      select: { id: true, codigo: true },
    });
    if (perfil === null) {
      throw new UnprocessableEntityException({
        code: 'USER_PROFILE_NOT_FOUND',
        message: `Perfil ${dto.perfilCodigo} não encontrado/ativo no tenant.`,
      });
    }

    if (dto.acao === 'attach') {
      try {
        await tx.usuarioPerfil.create({
          data: { usuarioId: usuario.id, perfilId: perfil.id },
        });
      } catch (err: unknown) {
        // Já vinculado: idempotente (P2002).
        if (
          !(
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          )
        ) {
          throw err;
        }
      }
      await this.auditoria.record({
        tabela: 'usuarios_perfis',
        registroId: usuario.id,
        operacao: 'I',
        diff: {
          evento: 'auth.profile.changed',
          acao: 'attach',
          alvo_usuario_id: usuario.id.toString(),
          perfil_id: perfil.id.toString(),
          perfil_codigo: perfil.codigo,
          admin_usuario_id: ctx.userId.toString(),
        },
        finalidade: 'admin.assign-profile',
      });
    } else {
      await tx.usuarioPerfil.deleteMany({
        where: { usuarioId: usuario.id, perfilId: perfil.id },
      });
      await this.auditoria.record({
        tabela: 'usuarios_perfis',
        registroId: usuario.id,
        operacao: 'D',
        diff: {
          evento: 'auth.profile.changed',
          acao: 'detach',
          alvo_usuario_id: usuario.id.toString(),
          perfil_id: perfil.id.toString(),
          perfil_codigo: perfil.codigo,
          admin_usuario_id: ctx.userId.toString(),
        },
        finalidade: 'admin.revoke-profile',
      });
    }

    await this.cache.invalidateUser(usuario.id);
  }
}
