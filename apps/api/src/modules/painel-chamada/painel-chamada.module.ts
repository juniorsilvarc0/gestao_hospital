/**
 * Bounded Context: Painel de Chamada.
 *
 * Provê:
 *   - `PainelChamadaGateway` — Socket.IO em `/painel-chamada` (com
 *     Redis Adapter ligado em `main.ts`).
 *   - `PainelChamadaService` — orquestra chamada (RLS + auditoria).
 *   - `PainelChamadaController` — `POST /v1/painel-chamada/chamar`.
 *
 * O gateway é exportado para que outros módulos (ex.: agendamento,
 * recepção) possam emitir chamadas via service injetando-o sem
 * conhecer Socket.IO.
 */
import { Module } from '@nestjs/common';

import { PainelChamadaController } from './painel-chamada.controller';
import { PainelChamadaGateway } from './painel-chamada.gateway';
import { PainelChamadaService } from './painel-chamada.service';

@Module({
  controllers: [PainelChamadaController],
  providers: [PainelChamadaGateway, PainelChamadaService],
  exports: [PainelChamadaService, PainelChamadaGateway],
})
export class PainelChamadaModule {}
