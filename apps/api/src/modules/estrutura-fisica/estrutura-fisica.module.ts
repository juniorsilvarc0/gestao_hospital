/**
 * Bounded Context: Estrutura Física — Fase 3 Trilha D.
 *
 * Provê endpoints para:
 *   - /v1/unidades-faturamento
 *   - /v1/unidades-atendimento
 *   - /v1/centros-custo (com /tree)
 *   - /v1/setores
 *   - /v1/leitos (com /mapa e /:id/status)
 *   - /v1/salas-cirurgicas (com /mapa)
 *
 * Não publica EventEmitter aqui — auditoria de CRUD é coberta pela
 * trigger `tg_audit` no banco (DB.md §6).
 */
import { Module } from '@nestjs/common';

import { UnidadesAtendimentoController, UnidadesFaturamentoController } from './unidades.controller';
import { CentrosCustoController } from './centros-custo.controller';
import { SetoresController } from './setores.controller';
import { LeitosController } from './leitos.controller';
import { SalasCirurgicasController } from './salas.controller';

import {
  CreateUnidadeFaturamentoUseCase,
  DeleteUnidadeFaturamentoUseCase,
  GetUnidadeFaturamentoUseCase,
  ListUnidadesFaturamentoUseCase,
  UpdateUnidadeFaturamentoUseCase,
} from './application/unidades/unidades-faturamento.use-cases';
import {
  CreateUnidadeAtendimentoUseCase,
  DeleteUnidadeAtendimentoUseCase,
  GetUnidadeAtendimentoUseCase,
  ListUnidadesAtendimentoUseCase,
  UpdateUnidadeAtendimentoUseCase,
} from './application/unidades/unidades-atendimento.use-cases';
import {
  CreateCentroCustoUseCase,
  DeleteCentroCustoUseCase,
  GetCentroCustoTreeUseCase,
  GetCentroCustoUseCase,
  ListCentrosCustoUseCase,
  UpdateCentroCustoUseCase,
} from './application/centros-custo/centros-custo.use-cases';
import {
  CreateSetorUseCase,
  DeleteSetorUseCase,
  GetSetorUseCase,
  ListSetoresUseCase,
  UpdateSetorUseCase,
} from './application/setores/setores.use-cases';
import {
  ChangeLeitoStatusUseCase,
  CreateLeitoUseCase,
  DeleteLeitoUseCase,
  GetLeitoUseCase,
  GetLeitosMapaUseCase,
  ListLeitosUseCase,
  UpdateLeitoUseCase,
} from './application/leitos/leitos.use-cases';
import {
  CreateSalaUseCase,
  DeleteSalaUseCase,
  GetSalaUseCase,
  GetSalasMapaUseCase,
  ListSalasUseCase,
  UpdateSalaUseCase,
} from './application/salas/salas.use-cases';

@Module({
  controllers: [
    UnidadesFaturamentoController,
    UnidadesAtendimentoController,
    CentrosCustoController,
    SetoresController,
    LeitosController,
    SalasCirurgicasController,
  ],
  providers: [
    // Unidades de faturamento
    ListUnidadesFaturamentoUseCase,
    GetUnidadeFaturamentoUseCase,
    CreateUnidadeFaturamentoUseCase,
    UpdateUnidadeFaturamentoUseCase,
    DeleteUnidadeFaturamentoUseCase,
    // Unidades de atendimento
    ListUnidadesAtendimentoUseCase,
    GetUnidadeAtendimentoUseCase,
    CreateUnidadeAtendimentoUseCase,
    UpdateUnidadeAtendimentoUseCase,
    DeleteUnidadeAtendimentoUseCase,
    // Centros de custo
    ListCentrosCustoUseCase,
    GetCentroCustoTreeUseCase,
    GetCentroCustoUseCase,
    CreateCentroCustoUseCase,
    UpdateCentroCustoUseCase,
    DeleteCentroCustoUseCase,
    // Setores
    ListSetoresUseCase,
    GetSetorUseCase,
    CreateSetorUseCase,
    UpdateSetorUseCase,
    DeleteSetorUseCase,
    // Leitos
    ListLeitosUseCase,
    GetLeitosMapaUseCase,
    GetLeitoUseCase,
    CreateLeitoUseCase,
    UpdateLeitoUseCase,
    ChangeLeitoStatusUseCase,
    DeleteLeitoUseCase,
    // Salas cirúrgicas
    ListSalasUseCase,
    GetSalasMapaUseCase,
    GetSalaUseCase,
    CreateSalaUseCase,
    UpdateSalaUseCase,
    DeleteSalaUseCase,
  ],
})
export class EstruturaFisicaModule {}
