/**
 * Bounded Context: Infection Control (CCIH) — Fase 10 Trilha R-A.
 *
 * Entrega:
 *   - CRUD de casos IRAS com state machine (ABERTO → EM_TRATAMENTO →
 *     NOTIFICADO → ENCERRADO).
 *   - Antibiograma (campo `resistencia` JSONB) com schema validado.
 *   - Notificação compulsória (RN-CCI-03) — endpoint marca a flag e
 *     `data_notificacao=now()`. Envio efetivo ao SINAN/GAL fica para Fase 13.
 *   - Painel epidemiológico (RN-CCI-04) com taxa por setor (1000
 *     paciente-dias), top topografias/microorganismos, perfil de
 *     resistência e distribuição por origem.
 *   - Contatos de risco (RN-CCI-01) — janela de 14 dias antes do
 *     diagnóstico cruzando paciente × setor × leito × atendimento.
 *   - Eventos: `ccih.caso_registrado`, `ccih.caso_notificado`,
 *     `ccih.caso_encerrado` via EventEmitter2.
 */
import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CreateCasoUseCase } from './application/casos/create-caso.use-case';
import { EncerrarCasoUseCase } from './application/casos/encerrar-caso.use-case';
import { GetCasoUseCase } from './application/casos/get-caso.use-case';
import { GetContatosRiscoUseCase } from './application/casos/get-contatos-risco.use-case';
import { ListCasosUseCase } from './application/casos/list-casos.use-case';
import { NotificarCasoUseCase } from './application/casos/notificar-caso.use-case';
import { UpdateCasoUseCase } from './application/casos/update-caso.use-case';
import { GetPainelCcihUseCase } from './application/painel/get-painel-ccih.use-case';
import { CcihRepository } from './infrastructure/ccih.repository';
import { CcihController } from './infrastructure/controllers/ccih.controller';

@Module({
  imports: [AuditoriaModule],
  controllers: [CcihController],
  providers: [
    CcihRepository,
    ListCasosUseCase,
    GetCasoUseCase,
    CreateCasoUseCase,
    UpdateCasoUseCase,
    NotificarCasoUseCase,
    EncerrarCasoUseCase,
    GetContatosRiscoUseCase,
    GetPainelCcihUseCase,
  ],
  exports: [CcihRepository],
})
export class CcihModule {}
