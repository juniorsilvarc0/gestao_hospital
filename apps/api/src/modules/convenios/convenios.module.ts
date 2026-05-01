/**
 * Bounded Context: Insurance Registry — Fase 3 / Trilha B + Fase 5 / Trilha B.
 *
 * Endpoints `/v1/convenios/*` + sub-recursos planos e condicoes-contratuais
 * (Fase 3) + `/v1/elegibilidade/verificar` (Fase 5 — RN-ATE-02).
 *
 * Provê também o `ConvenioElegibilidadeService` exportado para uso
 * pelo `IniciarAtendimentoUseCase` (Trilha A da Fase 5) — via import
 * deste módulo + injeção pelo nome da classe.
 */
import { Module } from '@nestjs/common';

import { ConveniosController } from './convenios.controller';
import { ElegibilidadeController } from './elegibilidade.controller';
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
import { VerificarElegibilidadeUseCase } from './application/verificar-elegibilidade.use-case';
import { ConvenioElegibilidadeService } from './infrastructure/elegibilidade.service';

@Module({
  controllers: [ConveniosController, ElegibilidadeController],
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
    VerificarElegibilidadeUseCase,
    ConvenioElegibilidadeService,
  ],
  exports: [ConvenioElegibilidadeService],
})
export class ConveniosModule {}
