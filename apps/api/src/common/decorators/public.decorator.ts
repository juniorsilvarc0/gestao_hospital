/**
 * @Public — marca um handler/controller como público (sem auth).
 *
 * Esta é a interface de extensão usada pelo PermissionsGuard global
 * (Trilha C) para liberar rotas como /auth/login, /auth/refresh, /healthz.
 *
 * Trilha A (este arquivo) só DECLARA o decorator; o consumidor é a
 * Trilha C, que registra o guard global e checa a metadata.
 *
 * Uso:
 *   @Public()
 *   @Post('login')
 *   login(...) {}
 */
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
