/**
 * Bounded Context: Mapa de Leitos em Tempo Real — Fase 5 / Trilha B.
 *
 * Provê:
 *   - `MapaLeitosGateway` — Socket.IO em `/leitos` (escala via
 *     `SocketIoRedisAdapter` global registrado no `main.ts`).
 *   - `MapaLeitosService` — listeners de `EventEmitter2` que recebem
 *     eventos do domínio (`leito.alocado`, `leito.liberado`, etc.) e
 *     replicam para as rooms `setor:<id>` e `tenant:<id>`.
 *   - `MapaLeitosController` — `GET /v1/leitos/mapa-realtime` (snapshot
 *     inicial usado pela UI antes de assinar o WebSocket).
 *
 * Não publica eventos próprios — apenas consome do barramento. Os
 * publishers são:
 *   - `InternarUseCase`     (Trilha A) → `leito.alocado`
 *   - `DarAltaUseCase`      (Trilha A) → `leito.liberado`
 *   - `TransferirUseCase`   (Trilha A) → `leito.liberado` (origem) +
 *                                          `leito.alocado` (destino)
 *   - `ChangeLeitoStatusUseCase` (Fase 3 Trilha D, estendido) →
 *     `leito.higienizando` / `leito.disponivel` / `leito.manutencao` /
 *     `leito.bloqueado` / `leito.reservado`
 *
 * Contratos dos payloads em `events/leito.events.ts`.
 */
import { Module } from '@nestjs/common';

import { SnapshotMapaUseCase } from './application/snapshot-mapa.use-case';
import { MapaLeitosController } from './mapa-leitos.controller';
import { MapaLeitosGateway } from './mapa-leitos.gateway';
import { MapaLeitosService } from './mapa-leitos.service';

@Module({
  controllers: [MapaLeitosController],
  providers: [SnapshotMapaUseCase, MapaLeitosGateway, MapaLeitosService],
  exports: [MapaLeitosService, MapaLeitosGateway],
})
export class MapaLeitosModule {}
