/**
 * Bounded Context: Visitors — Fase 10 (Trilha R-B).
 *
 * Entrega:
 *   - CRUD de visitantes com hash SHA-256 do CPF (LGPD) + bloqueio.
 *   - Registro de entrada/saída de visitas atrelado a atendimento ativo,
 *     leito e setor (RN-VIS-01).
 *   - Limites por tipo de acomodação (RN-VIS-02): ENFERMARIA=2,
 *     APARTAMENTO=4, UTI=1+nominal (Fase 13).
 *   - Bloqueio sempre verificado: pré-check no use case + trigger DB
 *     `tg_visita_valida_visitante` como defesa final (RN-VIS-03).
 */
import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { BloquearVisitanteUseCase } from './application/visitantes/bloquear-visitante.use-case';
import { CreateVisitanteUseCase } from './application/visitantes/create-visitante.use-case';
import { DesbloquearVisitanteUseCase } from './application/visitantes/desbloquear-visitante.use-case';
import { GetVisitanteUseCase } from './application/visitantes/get-visitante.use-case';
import { ListVisitantesUseCase } from './application/visitantes/list-visitantes.use-case';
import { UpdateVisitanteUseCase } from './application/visitantes/update-visitante.use-case';
import { GetVisitaUseCase } from './application/visitas/get-visita.use-case';
import { GetVisitasAtivasLeitoUseCase } from './application/visitas/get-visitas-ativas-leito.use-case';
import { ListVisitasUseCase } from './application/visitas/list-visitas.use-case';
import { RegistrarEntradaUseCase } from './application/visitas/registrar-entrada.use-case';
import { RegistrarSaidaUseCase } from './application/visitas/registrar-saida.use-case';
import { VisitantesController } from './infrastructure/controllers/visitantes.controller';
import { VisitasController } from './infrastructure/controllers/visitas.controller';
import { VisitantesRepository } from './infrastructure/visitantes.repository';

@Module({
  imports: [AuditoriaModule],
  controllers: [VisitantesController, VisitasController],
  providers: [
    VisitantesRepository,
    // Visitantes
    ListVisitantesUseCase,
    GetVisitanteUseCase,
    CreateVisitanteUseCase,
    UpdateVisitanteUseCase,
    BloquearVisitanteUseCase,
    DesbloquearVisitanteUseCase,
    // Visitas
    ListVisitasUseCase,
    GetVisitaUseCase,
    RegistrarEntradaUseCase,
    RegistrarSaidaUseCase,
    GetVisitasAtivasLeitoUseCase,
  ],
  exports: [VisitantesRepository],
})
export class VisitantesModule {}
