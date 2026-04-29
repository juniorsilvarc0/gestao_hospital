/**
 * Apresentador: converte modelo Prisma em response público
 * (`UserResponse`). Centralizado para garantir que **nunca** vazemos
 * campos sensíveis (senhaHash, mfaSecret, tentativasLogin, etc.).
 */
import type { UserResponse } from '../dto/user.response';

export interface UsuarioWithPerfis {
  uuidExterno: string;
  email: string;
  nome: string;
  ativo: boolean;
  precisaTrocarSenha: boolean;
  mfaHabilitado: boolean;
  ultimoLoginEm: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
  perfis: Array<{ perfil: { codigo: string } }>;
}

export function presentUser(usuario: UsuarioWithPerfis): UserResponse {
  return {
    uuid: usuario.uuidExterno,
    email: usuario.email,
    nome: usuario.nome,
    ativo: usuario.ativo,
    precisaTrocarSenha: usuario.precisaTrocarSenha,
    mfaHabilitado: usuario.mfaHabilitado,
    perfis: usuario.perfis.map((up) => up.perfil.codigo),
    ultimoLoginEm: usuario.ultimoLoginEm
      ? usuario.ultimoLoginEm.toISOString()
      : null,
    createdAt: usuario.createdAt.toISOString(),
    updatedAt: usuario.updatedAt ? usuario.updatedAt.toISOString() : null,
  };
}
