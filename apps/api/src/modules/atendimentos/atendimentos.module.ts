/**
 * Bounded Context: Reception / Atendimentos — Fase 5 / Trilha A.
 *
 * Trilha A entrega:
 *   - Abertura de atendimento (RN-ATE-01..03)
 *   - Triagem Manchester (RN-ATE-04)
 *   - Fila ordenada por cor (RN-ATE-05)
 *   - Internação com otimistic lock + SELECT FOR UPDATE (INVARIANTE #2)
 *   - Transferência interna/externa (RN-ATE-08)
 *   - Alta com liberação de leito
 *   - Cancelamento soft
 *
 * Trilha B (separada) entrega:
 *   - WebSocket gateway de leitos (mapa em tempo real)
 *   - ConvenioElegibilidadeService real (substitui o stub aqui)
 *   - Polling outbox → Redis Streams
 */
import { Module } from '@nestjs/common';

import { AtendimentosController } from './atendimentos.controller';
import { TriagensController } from './triagens.controller';

// Use cases — atendimentos
import { AbrirAtendimentoUseCase } from './application/abrir-atendimento.use-case';
import { AltaUseCase } from './application/alta.use-case';
import { CancelarAtendimentoUseCase } from './application/cancelar.use-case';
import { GetAtendimentoUseCase } from './application/get-atendimento.use-case';
import { GetTimelineUseCase } from './application/get-timeline.use-case';
import { InternarUseCase } from './application/internar.use-case';
import { ListAtendimentosUseCase } from './application/list-atendimentos.use-case';
import { ListarFilaUseCase } from './application/listar-fila.use-case';
import { RegistrarTriagemUseCase } from './application/registrar-triagem.use-case';
import { TransferirUseCase } from './application/transferir.use-case';
import { UpdateAtendimentoUseCase } from './application/update-atendimento.use-case';

// Use cases — triagens
import {
  GetTriagemUseCase,
  ListTriagensUseCase,
} from './application/triagens.use-cases';

// Infra
import { AtendimentoRepository } from './infrastructure/atendimento.repository';
import { ConvenioElegibilidadeService } from './infrastructure/convenio-elegibilidade.service';
import { LeitoAllocator } from './infrastructure/leito-allocator';
import { NumeroAtendimentoGenerator } from './infrastructure/numero-atendimento.generator';

@Module({
  controllers: [AtendimentosController, TriagensController],
  providers: [
    // Infra
    AtendimentoRepository,
    LeitoAllocator,
    NumeroAtendimentoGenerator,
    ConvenioElegibilidadeService,
    // Use cases
    AbrirAtendimentoUseCase,
    AltaUseCase,
    CancelarAtendimentoUseCase,
    GetAtendimentoUseCase,
    GetTimelineUseCase,
    InternarUseCase,
    ListAtendimentosUseCase,
    ListarFilaUseCase,
    RegistrarTriagemUseCase,
    TransferirUseCase,
    UpdateAtendimentoUseCase,
    GetTriagemUseCase,
    ListTriagensUseCase,
  ],
  exports: [
    AtendimentoRepository,
    LeitoAllocator,
    NumeroAtendimentoGenerator,
  ],
})
export class AtendimentosModule {}
