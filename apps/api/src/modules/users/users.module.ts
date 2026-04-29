/**
 * Bounded Context: Identity & Access (Users) — Fase 2 Trilha C.
 *
 * Provê endpoints `/users/*` e os use cases correspondentes.
 * `PrismaService`, `AuditoriaService` e `PermissionsCacheService` vêm
 * via módulos globais (`PrismaModule`, `AuditoriaModule`, `SecurityModule`).
 */
import { Module } from '@nestjs/common';

import { UsersController } from './users.controller';
import { GetCurrentUserUseCase } from './application/get-current-user.use-case';
import { ListUsersUseCase } from './application/list-users.use-case';
import { CreateUserUseCase } from './application/create-user.use-case';
import { UpdateUserUseCase } from './application/update-user.use-case';
import { DeleteUserUseCase } from './application/delete-user.use-case';
import { AssignProfileUseCase } from './application/assign-profile.use-case';

@Module({
  controllers: [UsersController],
  providers: [
    GetCurrentUserUseCase,
    ListUsersUseCase,
    CreateUserUseCase,
    UpdateUserUseCase,
    DeleteUserUseCase,
    AssignProfileUseCase,
  ],
})
export class UsersModule {}
