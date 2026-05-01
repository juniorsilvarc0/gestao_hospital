/**
 * Bounded Context: Centro Cirúrgico — Fase 7 (Trilha B).
 *
 * Entrega:
 *   - Cirurgias: agendamento, confirmação, início (RN-CC-05), encerramento
 *     (RN-CC-04, 06, 08), cancelamento (RN-CC-07).
 *   - Fichas cirúrgica e anestésica (JSONB livre).
 *   - Fluxo OPME: solicitar/autorizar/utilizar (RN-CC-03).
 *   - Kits Cirúrgicos (CRUD).
 *   - Cadernos de Gabarito (CRUD).
 *   - Mapa de salas (`GET /v1/centro-cirurgico/mapa`).
 *   - Gateway WebSocket no namespace `/centro-cirurgico` para o mapa.
 *   - Geração esqueleto de `contas_itens` no encerramento (RN-CC-06,
 *     `valor_unitario = 0` — Fase 8 calcula).
 *
 * Não cobre nesta fase:
 *   - Cálculo de valores (Fase 8 — Faturamento).
 *   - Apuração/folha de repasse (Fase 9 — RN-CC-08 deixa o
 *     `cirurgias_equipe.conta_item_id` populado).
 */
import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CancelarCirurgiaUseCase } from './application/cirurgias/cancelar-cirurgia.use-case';
import { ConfirmarCirurgiaUseCase } from './application/cirurgias/confirmar-cirurgia.use-case';
import { CreateCirurgiaUseCase } from './application/cirurgias/create-cirurgia.use-case';
import { EncerrarCirurgiaUseCase } from './application/cirurgias/encerrar-cirurgia.use-case';
import { FichaAnestesicaUseCase } from './application/cirurgias/ficha-anestesica.use-case';
import { FichaCirurgicaUseCase } from './application/cirurgias/ficha-cirurgica.use-case';
import { GetCirurgiaUseCase } from './application/cirurgias/get-cirurgia.use-case';
import { IniciarCirurgiaUseCase } from './application/cirurgias/iniciar-cirurgia.use-case';
import { ListCirurgiasUseCase } from './application/cirurgias/list-cirurgias.use-case';
import { UpdateCirurgiaUseCase } from './application/cirurgias/update-cirurgia.use-case';
import { CreateGabaritoUseCase } from './application/gabaritos/create-gabarito.use-case';
import { GetGabaritoUseCase } from './application/gabaritos/get-gabarito.use-case';
import { ListGabaritosUseCase } from './application/gabaritos/list-gabaritos.use-case';
import { UpdateGabaritoUseCase } from './application/gabaritos/update-gabarito.use-case';
import { CreateKitUseCase } from './application/kits/create-kit.use-case';
import { DeleteKitUseCase } from './application/kits/delete-kit.use-case';
import { GetKitUseCase } from './application/kits/get-kit.use-case';
import { ListKitsUseCase } from './application/kits/list-kits.use-case';
import { UpdateKitUseCase } from './application/kits/update-kit.use-case';
import { GetMapaSalasUseCase } from './application/mapa/get-mapa-salas.use-case';
import { AutorizarOpmeUseCase } from './application/opme/autorizar-opme.use-case';
import { SolicitarOpmeUseCase } from './application/opme/solicitar-opme.use-case';
import { UtilizarOpmeUseCase } from './application/opme/utilizar-opme.use-case';
import { CentroCirurgicoGateway } from './infrastructure/centro-cirurgico.gateway';
import { CentroCirurgicoRepository } from './infrastructure/centro-cirurgico.repository';
import { CirurgiasController } from './infrastructure/controllers/cirurgias.controller';
import { GabaritosController } from './infrastructure/controllers/gabaritos.controller';
import { KitsController } from './infrastructure/controllers/kits.controller';
import { MapaSalasController } from './infrastructure/controllers/mapa-salas.controller';

@Module({
  imports: [AuditoriaModule],
  controllers: [
    CirurgiasController,
    MapaSalasController,
    KitsController,
    GabaritosController,
  ],
  providers: [
    CentroCirurgicoRepository,
    CentroCirurgicoGateway,
    // Cirurgias
    ListCirurgiasUseCase,
    GetCirurgiaUseCase,
    CreateCirurgiaUseCase,
    UpdateCirurgiaUseCase,
    ConfirmarCirurgiaUseCase,
    IniciarCirurgiaUseCase,
    EncerrarCirurgiaUseCase,
    CancelarCirurgiaUseCase,
    FichaCirurgicaUseCase,
    FichaAnestesicaUseCase,
    // OPME
    SolicitarOpmeUseCase,
    AutorizarOpmeUseCase,
    UtilizarOpmeUseCase,
    // Mapa
    GetMapaSalasUseCase,
    // Kits
    ListKitsUseCase,
    GetKitUseCase,
    CreateKitUseCase,
    UpdateKitUseCase,
    DeleteKitUseCase,
    // Gabaritos
    ListGabaritosUseCase,
    GetGabaritoUseCase,
    CreateGabaritoUseCase,
    UpdateGabaritoUseCase,
  ],
  exports: [CentroCirurgicoRepository, CentroCirurgicoGateway],
})
export class CentroCirurgicoModule {}
