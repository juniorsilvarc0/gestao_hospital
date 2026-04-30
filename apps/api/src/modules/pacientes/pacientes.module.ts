/**
 * Bounded Context: Patient Registry — Fase 3 Trilha A.
 *
 * Módulo `pacientes/`:
 *   - CRUD completo + busca trigram + cripto LGPD.
 *   - Vínculo com convênios (M:N por `pacientes_convenios`).
 *   - Auditoria de acesso (`acessos_prontuario`) registrada no
 *     handler de `GET /pacientes/{uuid}` (RN-LGP-01).
 *
 * Endpoints LGPD (`/lgpd/*`) são fornecidos pelo `LgpdModule` separado,
 * mas reaproveitam o `PacientesRepository` e o `CpfCryptoService` daqui.
 * Portanto exportamos esses providers para uso entre contextos.
 */
import { Module } from '@nestjs/common';

import { PacientesController } from './pacientes.controller';
import { CreatePacienteUseCase } from './application/create-paciente.use-case';
import { UpdatePacienteUseCase } from './application/update-paciente.use-case';
import { DeletePacienteUseCase } from './application/delete-paciente.use-case';
import { ListPacientesUseCase } from './application/list-pacientes.use-case';
import { GetPacienteUseCase } from './application/get-paciente.use-case';
import { SearchPacienteUseCase } from './application/search-paciente.use-case';
import { LinkConvenioUseCase } from './application/link-convenio.use-case';
import { UnlinkConvenioUseCase } from './application/unlink-convenio.use-case';
import { ListConveniosUseCase } from './application/list-convenios.use-case';
import { HistoricoAtendimentosUseCase } from './application/historico-atendimentos.use-case';
import { PacientesRepository } from './infrastructure/pacientes.repository';
import { CpfCryptoService } from './infrastructure/cpf-crypto.service';

@Module({
  controllers: [PacientesController],
  providers: [
    CreatePacienteUseCase,
    UpdatePacienteUseCase,
    DeletePacienteUseCase,
    ListPacientesUseCase,
    GetPacienteUseCase,
    SearchPacienteUseCase,
    LinkConvenioUseCase,
    UnlinkConvenioUseCase,
    ListConveniosUseCase,
    HistoricoAtendimentosUseCase,
    PacientesRepository,
    CpfCryptoService,
  ],
  exports: [PacientesRepository, CpfCryptoService],
})
export class PacientesModule {}
