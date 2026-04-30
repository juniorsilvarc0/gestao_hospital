/**
 * Bounded Context: Provider Registry — Fase 3 / Trilha B.
 *
 * Provê endpoints `/v1/prestadores/*` e `/v1/especialidades/*`
 * (catálogo CBOS administrado por ADMIN).
 *
 * `PrismaService`, `AuditoriaService` vêm de módulos globais.
 */
import { Module } from '@nestjs/common';

import {
  EspecialidadesController,
  PrestadoresController,
} from './prestadores.controller';
import { CreatePrestadorUseCase } from './application/create-prestador.use-case';
import { UpdatePrestadorUseCase } from './application/update-prestador.use-case';
import { DeletePrestadorUseCase } from './application/delete-prestador.use-case';
import { ListPrestadoresUseCase } from './application/list-prestadores.use-case';
import { GetPrestadorUseCase } from './application/get-prestador.use-case';
import { AddEspecialidadeUseCase } from './application/add-especialidade.use-case';
import { RemoveEspecialidadeUseCase } from './application/remove-especialidade.use-case';
import { ListEspecialidadesUseCase } from './application/list-especialidades.use-case';
import {
  CreateEspecialidadeUseCase,
  UpdateEspecialidadeUseCase,
} from './application/upsert-especialidade.use-case';

@Module({
  controllers: [PrestadoresController, EspecialidadesController],
  providers: [
    CreatePrestadorUseCase,
    UpdatePrestadorUseCase,
    DeletePrestadorUseCase,
    ListPrestadoresUseCase,
    GetPrestadorUseCase,
    AddEspecialidadeUseCase,
    RemoveEspecialidadeUseCase,
    ListEspecialidadesUseCase,
    CreateEspecialidadeUseCase,
    UpdateEspecialidadeUseCase,
  ],
})
export class PrestadoresModule {}
