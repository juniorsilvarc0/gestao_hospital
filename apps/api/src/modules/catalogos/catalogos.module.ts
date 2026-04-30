/**
 * Bounded Context: Catálogos (TUSS/CBHPM/CID/CBO + Tabelas de Preços).
 *
 * Provê:
 *   - Controllers `/tabelas-procedimentos`, `/tabelas-precos`, `/precos`.
 *   - Use cases para listagem/CRUD/upsert/resolução de preço.
 *   - Worker BullMQ para importação assíncrona de TUSS/CBHPM.
 *
 * Dependências:
 *   - `PrismaModule` (global): persistência.
 *   - `QueuesModule` (global): conexão BullMQ.
 *   - `AuditoriaModule`/`SecurityModule` cross-cutting (já globais).
 */
import { Module } from '@nestjs/common';

import { ProcedimentosController } from './procedimentos.controller';
import { TabelasPrecosController } from './tabelas-precos.controller';
import { PrecosController } from './precos.controller';

import { ListProcedimentosUseCase } from './application/procedimentos/list-procedimentos.use-case';
import { GetProcedimentoUseCase } from './application/procedimentos/get-procedimento.use-case';
import { CreateProcedimentoUseCase } from './application/procedimentos/create-procedimento.use-case';
import { UpdateProcedimentoUseCase } from './application/procedimentos/update-procedimento.use-case';
import { UpsertProcedimentoBulkUseCase } from './application/procedimentos/upsert-procedimento-bulk.use-case';
import { StartImportJobUseCase } from './application/procedimentos/start-import-job.use-case';
import { GetImportJobUseCase } from './application/procedimentos/get-import-job.use-case';

import { ListTabelasPrecosUseCase } from './application/tabelas-precos/list-tabelas.use-case';
import { GetTabelaUseCase } from './application/tabelas-precos/get-tabela.use-case';
import { CreateTabelaUseCase } from './application/tabelas-precos/create-tabela.use-case';
import { UpdateTabelaUseCase } from './application/tabelas-precos/update-tabela.use-case';
import { ListItensUseCase } from './application/tabelas-precos/list-itens.use-case';
import { UpsertItensBulkUseCase } from './application/tabelas-precos/upsert-itens-bulk.use-case';
import { LinkTabelaToConvenioUseCase } from './application/tabelas-precos/link-tabela-to-convenio.use-case';
import { ResolvePrecoUseCase } from './application/tabelas-precos/resolve-preco.use-case';

import { ProcedimentosImportWorker } from './infrastructure/procedimentos-import.worker';

@Module({
  controllers: [
    ProcedimentosController,
    TabelasPrecosController,
    PrecosController,
  ],
  providers: [
    // Procedimentos
    ListProcedimentosUseCase,
    GetProcedimentoUseCase,
    CreateProcedimentoUseCase,
    UpdateProcedimentoUseCase,
    UpsertProcedimentoBulkUseCase,
    StartImportJobUseCase,
    GetImportJobUseCase,
    // Tabelas de preços
    ListTabelasPrecosUseCase,
    GetTabelaUseCase,
    CreateTabelaUseCase,
    UpdateTabelaUseCase,
    ListItensUseCase,
    UpsertItensBulkUseCase,
    LinkTabelaToConvenioUseCase,
    ResolvePrecoUseCase,
    // Worker BullMQ
    ProcedimentosImportWorker,
  ],
})
export class CatalogosModule {}
