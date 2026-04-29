/**
 * Use case: `POST /users` (admin) — cria usuário no tenant atual.
 *
 * Regras:
 *   - `senha` é hashada com Argon2id (m=64MB, t=3, p=4) — RNF-002.
 *   - `precisa_trocar_senha = true` por padrão (admin não cria senha
 *     que o usuário vai usar permanentemente).
 *   - Vincula perfis informados (todos por código). Perfis que não
 *     existirem no tenant atual → 422.
 *   - Email único por tenant (constraint `uq_usuarios_email_tenant`).
 */
import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';
import { RequestContextStorage } from '../../../common/context/request-context';
import type { CreateUserDto } from '../dto/create-user.dto';
import type { UserResponse } from '../dto/user.response';
import { presentUser, type UsuarioWithPerfis } from './user.presenter';
import { AuditoriaService } from '../../auditoria/application/auditoria.service';
import { PermissionsCacheService } from '../../../common/cache/permissions-cache.service';

@Injectable()
export class CreateUserUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly cache: PermissionsCacheService,
  ) {}

  async execute(dto: CreateUserDto): Promise<UserResponse> {
    const ctx = RequestContextStorage.get();
    if (ctx === undefined) {
      throw new Error(
        'CreateUserUseCase requires an active request context (tenant).',
      );
    }
    const tx = this.prisma.tx();

    // Resolve perfis pelos códigos. RLS já filtra por tenant.
    const perfisExistentes = await tx.perfil.findMany({
      where: { codigo: { in: dto.perfis }, ativo: true },
      select: { id: true, codigo: true },
    });
    const codigosEncontrados = new Set(perfisExistentes.map((p) => p.codigo));
    const faltantes = dto.perfis.filter((c) => !codigosEncontrados.has(c));
    if (faltantes.length > 0) {
      throw new UnprocessableEntityException({
        code: 'USER_INVALID_PROFILES',
        message: `Perfis inexistentes ou inativos: ${faltantes.join(', ')}`,
      });
    }

    const senhaHash = await argon2.hash(dto.senha, {
      type: argon2.argon2id,
      memoryCost: 64 * 1024,
      timeCost: 3,
      parallelism: 4,
    });

    let usuario: UsuarioWithPerfis;
    try {
      usuario = (await tx.usuario.create({
        data: {
          tenantId: ctx.tenantId,
          email: dto.email.toLowerCase(),
          nome: dto.nome,
          senhaHash,
          precisaTrocarSenha: dto.precisaTrocarSenha ?? true,
          ativo: true,
          perfis: {
            create: perfisExistentes.map((p) => ({ perfilId: p.id })),
          },
        },
        include: {
          perfis: { include: { perfil: { select: { codigo: true } } } },
        },
      })) as unknown as UsuarioWithPerfis & { id: bigint };
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'USER_EMAIL_TAKEN',
          message: 'Já existe um usuário com este email no tenant.',
        });
      }
      throw err;
    }

    // Eventos de auditoria por perfil atribuído (RN-SEG-07).
    const usuarioId = (usuario as unknown as { id: bigint }).id;
    for (const p of perfisExistentes) {
      await this.auditoria.record({
        tabela: 'usuarios_perfis',
        registroId: usuarioId,
        operacao: 'I',
        diff: {
          evento: 'auth.profile.changed',
          acao: 'attach',
          alvo_usuario_id: usuarioId.toString(),
          perfil_id: p.id.toString(),
          perfil_codigo: p.codigo,
          admin_usuario_id: ctx.userId.toString(),
        },
        finalidade: 'admin.create-user',
      });
    }

    // Cache de permissões — usuário novo, nada a invalidar, mas o
    // mantemos consistente caso reuse de id ocorra (não deve, mas defensivo).
    await this.cache.invalidateUser(usuarioId);

    return presentUser(usuario);
  }
}
