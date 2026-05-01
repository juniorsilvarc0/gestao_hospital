/**
 * `MapaLeitosService` — bridge entre o domínio (eventos `EventEmitter2`
 * publicados pela Trilha A: `InternarUseCase`, `DarAltaUseCase`,
 * `TransferirUseCase`, e pelo controller administrativo de status) e
 * os clientes WebSocket conectados em `/leitos`.
 *
 * Responsabilidades:
 *   1. `@OnEvent('leito.alocado')` etc. — escuta o domínio.
 *   2. Adapta o payload (qualquer dado adicional que precise ir além
 *      do que o publisher emitiu).
 *   3. Emite via `MapaLeitosGateway` para as rooms `setor:<id>` e
 *      `tenant:<id>`.
 *
 * Por que ouvir EventEmitter2 e não chamar o gateway diretamente?
 *
 *   - Trilha A não conhece WebSocket — o domínio publica fato, e
 *     consumidores se inscrevem (princípio open-closed). Outros
 *     consumidores futuros (BI streaming, notificações pessoais ao
 *     médico de plantão) usam o mesmo evento.
 *
 *   - Como o `EventEmitterModule` está em `forRoot({ wildcard: true })`
 *     no AppModule, o handler é descoberto automaticamente quando o
 *     `MapaLeitosService` é provider de algum módulo importado pelo
 *     AppModule. Não precisa registrar nada extra.
 *
 * Cuidado:
 *   Trilha A **não pode** emitir o evento DENTRO da `prisma.$transaction`
 *   antes do COMMIT — se a transação fizer rollback, o evento já terá
 *   sido enviado. Padrão recomendado: `prisma.$transaction(...).then((res) => {
 *     this.eventEmitter.emit(LEITO_EVENT_NAMES.ALOCADO, payload);
 *     return res;
 *   })`.
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  LEITO_EVENT_NAMES,
  type LeitoAlocadoEventPayload,
  type LeitoBloqueadoEventPayload,
  type LeitoDisponivelEventPayload,
  type LeitoHigienizandoEventPayload,
  type LeitoLiberadoEventPayload,
  type LeitoManutencaoEventPayload,
  type LeitoReservadoEventPayload,
} from './events/leito.events';
import { MapaLeitosGateway } from './mapa-leitos.gateway';

@Injectable()
export class MapaLeitosService {
  private readonly logger = new Logger(MapaLeitosService.name);

  constructor(private readonly gateway: MapaLeitosGateway) {}

  @OnEvent(LEITO_EVENT_NAMES.ALOCADO)
  handleAlocado(payload: LeitoAlocadoEventPayload): void {
    this.relay(LEITO_EVENT_NAMES.ALOCADO, payload, payload.setorId, payload.tenantId);
  }

  @OnEvent(LEITO_EVENT_NAMES.LIBERADO)
  handleLiberado(payload: LeitoLiberadoEventPayload): void {
    this.relay(LEITO_EVENT_NAMES.LIBERADO, payload, payload.setorId, payload.tenantId);
  }

  @OnEvent(LEITO_EVENT_NAMES.HIGIENIZANDO)
  handleHigienizando(payload: LeitoHigienizandoEventPayload): void {
    this.relay(
      LEITO_EVENT_NAMES.HIGIENIZANDO,
      payload,
      payload.setorId,
      payload.tenantId,
    );
  }

  @OnEvent(LEITO_EVENT_NAMES.DISPONIVEL)
  handleDisponivel(payload: LeitoDisponivelEventPayload): void {
    this.relay(
      LEITO_EVENT_NAMES.DISPONIVEL,
      payload,
      payload.setorId,
      payload.tenantId,
    );
  }

  @OnEvent(LEITO_EVENT_NAMES.MANUTENCAO)
  handleManutencao(payload: LeitoManutencaoEventPayload): void {
    this.relay(
      LEITO_EVENT_NAMES.MANUTENCAO,
      payload,
      payload.setorId,
      payload.tenantId,
    );
  }

  @OnEvent(LEITO_EVENT_NAMES.BLOQUEADO)
  handleBloqueado(payload: LeitoBloqueadoEventPayload): void {
    this.relay(
      LEITO_EVENT_NAMES.BLOQUEADO,
      payload,
      payload.setorId,
      payload.tenantId,
    );
  }

  @OnEvent(LEITO_EVENT_NAMES.RESERVADO)
  handleReservado(payload: LeitoReservadoEventPayload): void {
    this.relay(
      LEITO_EVENT_NAMES.RESERVADO,
      payload,
      payload.setorId,
      payload.tenantId,
    );
  }

  /**
   * Wrapper único para todos os eventos. Exposto para uso no
   * controller administrativo (mudança manual de status) sem precisar
   * passar pelo EventEmitter2 — o status admin é trivial e não tem
   * outros consumidores além do mapa.
   */
  emitirEvento(
    nome: string,
    payload: unknown,
    setorId: string,
    tenantId: string,
  ): void {
    this.relay(nome, payload, setorId, tenantId);
  }

  private relay(
    nome: string,
    payload: unknown,
    setorId: string,
    tenantId: string,
  ): void {
    try {
      this.gateway.emitToSetorAndTenant(nome, setorId, tenantId, payload);
      // Log curto, sem PHI — o payload pode conter nome minimizado.
      this.logger.debug(
        { evento: nome, setorId, tenantId },
        'mapa-leitos: evento publicado em rooms',
      );
    } catch (err) {
      this.logger.warn(
        {
          evento: nome,
          setorId,
          tenantId,
          err: err instanceof Error ? err.message : String(err),
        },
        'mapa-leitos: falha ao emitir evento — engolida (não bloquear domínio)',
      );
    }
  }
}
