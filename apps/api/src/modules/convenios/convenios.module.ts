/**
 * Bounded Context: Insurance Registry — Fase 3 / Trilha B.
 *
 * Endpoints `/v1/convenios/*` + sub-recursos planos e condicoes-contratuais
 * (versionadas).
 */
import { Module } from '@nestjs/common';

import { ConveniosController } from './convenios.controller';
import { CreateConvenioUseCase } from './application/create-convenio.use-case';
import { GetConvenioUseCase } from './application/get-convenio.use-case';
import { ListConveniosUseCase } from './application/list-convenios.use-case';
import { UpdateConvenioUseCase } from './application/update-convenio.use-case';
import { CreatePlanoUseCase } from './application/create-plano.use-case';
import { ListPlanosUseCase } from './application/list-planos.use-case';
import { CreateCondicaoContratualUseCase } from './application/create-condicao-contratual.use-case';
import {
  GetCondicaoContratualVigenteUseCase,
  ListCondicoesContratuaisUseCase,
} from './application/list-condicoes-contratuais.use-case';

@Module({
  controllers: [ConveniosController],
  providers: [
    CreateConvenioUseCase,
    GetConvenioUseCase,
    ListConveniosUseCase,
    UpdateConvenioUseCase,
    CreatePlanoUseCase,
    ListPlanosUseCase,
    CreateCondicaoContratualUseCase,
    ListCondicoesContratuaisUseCase,
    GetCondicaoContratualVigenteUseCase,
  ],
})
export class ConveniosModule {}
