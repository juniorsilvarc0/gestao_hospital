/**
 * Bounded Context: Auditoria — consulta (Fase 13 R-A).
 *
 * Diferente do `AuditoriaModule` (que GRAVA via `AuditoriaService`),
 * este expõe os endpoints de LEITURA das três trilhas de auditoria:
 *   - `auditoria_eventos`     (CRUD + lógicos)
 *   - `acessos_prontuario`    (LGPD trail — RN-LGP-01)
 *   - `audit_security_events` (RN-SEG-06/07)
 *
 * Mantemos o gravador desacoplado do consultador para que módulos de
 * domínio (PEP, prescrições, faturamento) não puxem transitivamente a
 * camada HTTP de auditoria.
 */
import { Module } from '@nestjs/common';

import { ListAcessosProntuarioUseCase } from './application/list-acessos-prontuario.use-case';
import { ListEventosUseCase } from './application/list-eventos.use-case';
import { ListSecurityEventsUseCase } from './application/list-security-events.use-case';
import { AuditoriaController } from './infrastructure/controllers/auditoria.controller';
import { AuditoriaConsultaRepository } from './infrastructure/auditoria-consulta.repository';

@Module({
  controllers: [AuditoriaController],
  providers: [
    AuditoriaConsultaRepository,
    ListEventosUseCase,
    ListAcessosProntuarioUseCase,
    ListSecurityEventsUseCase,
  ],
  exports: [AuditoriaConsultaRepository],
})
export class AuditoriaConsultaModule {}
