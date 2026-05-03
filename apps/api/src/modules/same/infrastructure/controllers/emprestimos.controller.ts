/**
 * `EmprestimosController` — endpoints de empréstimos do SAME.
 *   GET  /v1/same/emprestimos
 *   POST /v1/same/emprestimos
 *   POST /v1/same/emprestimos/{uuid}/devolver
 *   GET  /v1/same/emprestimos/atrasados
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '../../../../common/decorators/require-permission.decorator';
import { CreateEmprestimoUseCase } from '../../application/emprestimos/create-emprestimo.use-case';
import { DevolverEmprestimoUseCase } from '../../application/emprestimos/devolver-emprestimo.use-case';
import { ListAtrasadosUseCase } from '../../application/emprestimos/list-atrasados.use-case';
import { ListEmprestimosUseCase } from '../../application/emprestimos/list-emprestimos.use-case';
import { CreateEmprestimoDto } from '../../dto/create-emprestimo.dto';
import { DevolverEmprestimoDto } from '../../dto/devolver-emprestimo.dto';
import { ListEmprestimosQueryDto } from '../../dto/list-emprestimos.dto';
import type {
  EmprestimoResponse,
  ListEmprestimosResponse,
} from '../../dto/responses';

@ApiTags('same')
@ApiBearerAuth()
@Controller({ path: 'same/emprestimos', version: '1' })
export class EmprestimosController {
  constructor(
    private readonly listUC: ListEmprestimosUseCase,
    private readonly atrasadosUC: ListAtrasadosUseCase,
    private readonly createUC: CreateEmprestimoUseCase,
    private readonly devolverUC: DevolverEmprestimoUseCase,
  ) {}

  @Get()
  @RequirePermission('same', 'read')
  @ApiOperation({ summary: 'Lista empréstimos com filtros.' })
  async list(
    @Query() query: ListEmprestimosQueryDto,
  ): Promise<ListEmprestimosResponse> {
    return this.listUC.execute(query);
  }

  @Get('atrasados')
  @RequirePermission('same', 'read')
  @ApiOperation({
    summary: 'Lista empréstimos atrasados (RN-SAM-02). Atualiza status.',
  })
  async atrasados(): Promise<ListEmprestimosResponse> {
    return this.atrasadosUC.execute();
  }

  @Post()
  @RequirePermission('same', 'emprestar')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Empresta prontuário físico (RN-SAM-01).' })
  async create(
    @Body() dto: CreateEmprestimoDto,
  ): Promise<{ data: EmprestimoResponse }> {
    const data = await this.createUC.execute(dto);
    return { data };
  }

  @Post(':uuid/devolver')
  @RequirePermission('same', 'devolver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Devolve prontuário ao arquivo.' })
  async devolver(
    @Param('uuid', new ParseUUIDPipe({ version: '4' })) uuid: string,
    @Body() dto: DevolverEmprestimoDto,
  ): Promise<{ data: EmprestimoResponse }> {
    const data = await this.devolverUC.execute(uuid, dto);
    return { data };
  }
}
