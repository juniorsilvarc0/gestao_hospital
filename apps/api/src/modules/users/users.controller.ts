/**
 * `UsersController` — endpoints de `/users/*` (docs/05-apis-rest.md §2.1).
 *
 * Rotas:
 *   GET    /users/me                       — autenticado
 *   GET    /users                          — users:read
 *   POST   /users                          — users:write
 *   PATCH  /users/:uuid                    — users:write
 *   DELETE /users/:uuid                    — users:write (soft-delete)
 *   POST   /users/:uuid/perfis             — users:write (admin)
 *
 * Convenções:
 *   - Identificador externo é UUID (`uuid_externo`), nunca BIGINT.
 *   - Validação por `class-validator` (DTO).
 *   - Soft-delete: 204.
 *   - `me` não tem `@RequirePermission` — basta estar autenticado.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignProfileDto } from './dto/assign-profile.dto';
import { ListUsersQueryDto } from './dto/list-users.dto';
import type { PaginatedResponse, UserResponse } from './dto/user.response';
import { GetCurrentUserUseCase } from './application/get-current-user.use-case';
import { ListUsersUseCase } from './application/list-users.use-case';
import { CreateUserUseCase } from './application/create-user.use-case';
import { UpdateUserUseCase } from './application/update-user.use-case';
import { DeleteUserUseCase } from './application/delete-user.use-case';
import { AssignProfileUseCase } from './application/assign-profile.use-case';

@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly getMe: GetCurrentUserUseCase,
    private readonly listUsers: ListUsersUseCase,
    private readonly createUser: CreateUserUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly deleteUser: DeleteUserUseCase,
    private readonly assignProfile: AssignProfileUseCase,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  async me(@Req() req: Request): Promise<{ data: UserResponse }> {
    if (req.user === undefined) {
      throw new UnauthorizedException();
    }
    const data = await this.getMe.execute(req.user.sub);
    return { data };
  }

  @Get()
  @RequirePermission('users', 'read')
  @ApiOperation({ summary: 'Lista usuários do tenant (admin)' })
  async list(
    @Query() query: ListUsersQueryDto,
  ): Promise<PaginatedResponse<UserResponse>> {
    return this.listUsers.execute(query);
  }

  @Post()
  @RequirePermission('users', 'write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cria usuário (admin)' })
  async create(
    @Body() dto: CreateUserDto,
  ): Promise<{ data: UserResponse }> {
    const data = await this.createUser.execute(dto);
    return { data };
  }

  @Patch(':uuid')
  @RequirePermission('users', 'write')
  @ApiOperation({ summary: 'Atualiza usuário (admin)' })
  async update(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: UpdateUserDto,
  ): Promise<{ data: UserResponse }> {
    const data = await this.updateUser.execute(uuid, dto);
    return { data };
  }

  @Delete(':uuid')
  @RequirePermission('users', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete de usuário (admin)' })
  async remove(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
  ): Promise<void> {
    await this.deleteUser.execute(uuid);
  }

  @Post(':uuid/perfis')
  @RequirePermission('users', 'write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Vincula/revoga perfil (admin) — RN-SEG-07' })
  async manageProfile(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: AssignProfileDto,
  ): Promise<void> {
    await this.assignProfile.execute(uuid, dto);
  }
}
