/**
 * Eventos de domínio do contexto de leitos consumidos pelo
 * `MapaLeitosService` — **contrato fechado** com a Trilha A
 * (use-cases de internar / dar alta / transferir).
 *
 * Por que documentar aqui (e não em `shared-types`)?
 *   Trilha B detém a fronteira do mapa de leitos. Trilha A é o
 *   "publisher" — qualquer mudança nos nomes/payloads precisa de PR
 *   coordenado. Concentrar a definição em um lugar evita drift.
 *
 * Como Trilha A publica:
 *
 *   ```ts
 *   import { EventEmitter2 } from '@nestjs/event-emitter';
 *   import {
 *     LEITO_EVENT_NAMES,
 *     type LeitoAlocadoEventPayload,
 *   } from '@/modules/mapa-leitos/events/leito.events';
 *
 *   const payload: LeitoAlocadoEventPayload = { ... };
 *   this.eventEmitter.emit(LEITO_EVENT_NAMES.ALOCADO, payload);
 *   ```
 *
 * Como Trilha B consome (interno ao módulo):
 *
 *   ```ts
 *   @OnEvent(LEITO_EVENT_NAMES.ALOCADO)
 *   handleAlocado(payload: LeitoAlocadoEventPayload): void { ... }
 *   ```
 *
 * Regras importantes:
 *   - **Não publicar via `EventEmitter2` dentro da mesma transação**
 *     que altera o leito **antes** do COMMIT. Em caso de rollback o
 *     evento não pode ter sido emitido. Trilha A deve emitir DEPOIS
 *     que `prisma.$transaction` resolveu (no `then` do use-case).
 *   - Payload **sem PHI completo**. Nome do paciente é minimizado para
 *     "Primeiro N." e idade fica como número (não data de nascimento).
 *   - `versao` é a `versao` final do leito (após o UPDATE) — o
 *     consumidor usa para detectar event ordering.
 */

/** Nomes canônicos dos eventos. */
export const LEITO_EVENT_NAMES = {
  ALOCADO: 'leito.alocado',
  LIBERADO: 'leito.liberado',
  HIGIENIZANDO: 'leito.higienizando',
  DISPONIVEL: 'leito.disponivel',
  MANUTENCAO: 'leito.manutencao',
  BLOQUEADO: 'leito.bloqueado',
  RESERVADO: 'leito.reservado',
} as const;

export type LeitoEventName =
  (typeof LEITO_EVENT_NAMES)[keyof typeof LEITO_EVENT_NAMES];

/**
 * Dados mínimos do paciente seguros para painel público interno.
 * Mantenha consistência com o snapshot REST (ver `snapshot-mapa.use-case.ts`).
 */
export interface LeitoPacienteSummary {
  /** UUID externo do paciente. */
  uuid: string;
  /** Nome minimizado: "Maria S." (LGPD — RN-LGP-01). */
  nome: string;
  /** Idade em anos completos no momento da emissão. */
  idade: number | null;
  /** Dias de internação (now - ocupacao_iniciada_em). */
  diasInternado: number | null;
  /** Lista curta de alergias (RN-PEP-05). Pode vir vazia. */
  alergias: string[];
}

/** Resumo do atendimento para exibição no card. */
export interface LeitoAtendimentoSummary {
  /** UUID externo do atendimento. */
  uuid: string;
  /** Tipo do atendimento (PA, AMBULATORIAL, INTERNACAO, etc.). */
  tipo: string;
  /** Data de entrada do atendimento (ISO 8601). */
  dataEntrada: string;
}

/**
 * Base comum de qualquer evento de leito. Trilha A **deve** preencher
 * `tenantId` (vem do `RequestContext`) e `setorId` (vem do leito).
 */
export interface LeitoEventBase {
  /** Identificador interno do tenant — usado para a room `tenant:<id>`. */
  tenantId: string;
  /** Identificador interno do leito (BIGINT como string). */
  leitoId: string;
  /** Código humano do leito (ex.: "201A"). */
  leitoCodigo: string;
  /** Identificador interno do setor — usado para a room `setor:<id>`. */
  setorId: string;
  /** Nome do setor para exibição. */
  setorNome: string;
  /** Versão do leito após o UPDATE (otimistic lock). */
  versao: number;
  /** Quando o evento foi emitido (ISO 8601). */
  emitidoEm: string;
}

/**
 * `leito.alocado` — paciente foi alocado em um leito (status passou
 * a `OCUPADO`). Publicado pelo `InternarUseCase` da Trilha A.
 */
export interface LeitoAlocadoEventPayload extends LeitoEventBase {
  /** Início real da ocupação (ISO 8601). */
  ocupacaoIniciadaEm: string;
  /** Previsão de fim, se conhecida. */
  ocupacaoPrevistaFim: string | null;
  /** Snapshot mínimo do paciente. */
  paciente: LeitoPacienteSummary;
  /** Snapshot mínimo do atendimento. */
  atendimento: LeitoAtendimentoSummary;
}

/**
 * `leito.liberado` — paciente saiu (alta, transferência, óbito).
 * Publicado pelos `DarAltaUseCase` / `TransferirUseCase`. O leito
 * tipicamente vai para `HIGIENIZACAO` em seguida (evento separado
 * `leito.higienizando`).
 */
export interface LeitoLiberadoEventPayload extends LeitoEventBase {
  /** Motivo: ALTA / TRANSFERENCIA / OBITO / EVASAO. */
  motivo: 'ALTA' | 'TRANSFERENCIA' | 'OBITO' | 'EVASAO' | 'OUTRO';
  /** UUID do atendimento que ocupava (rastreabilidade). */
  atendimentoUuid: string | null;
}

/** `leito.higienizando` — passou a `HIGIENIZACAO`. */
export interface LeitoHigienizandoEventPayload extends LeitoEventBase {
  /** Motivo opcional (registro). */
  motivo?: string;
}

/** `leito.disponivel` — voltou a `DISPONIVEL`. */
export interface LeitoDisponivelEventPayload extends LeitoEventBase {}

/** `leito.manutencao` — entrou em `MANUTENCAO`. */
export interface LeitoManutencaoEventPayload extends LeitoEventBase {
  motivo?: string;
}

/** `leito.bloqueado` — entrou em `BLOQUEADO`. */
export interface LeitoBloqueadoEventPayload extends LeitoEventBase {
  motivo?: string;
}

/** `leito.reservado` — entrou em `RESERVADO` (cirurgia eletiva). */
export interface LeitoReservadoEventPayload extends LeitoEventBase {
  motivo?: string;
}

/**
 * Union — útil para reducers no front. Não usado diretamente pelo
 * Nest (cada handler bate no nome específico).
 */
export type AnyLeitoEventPayload =
  | ({ type: typeof LEITO_EVENT_NAMES.ALOCADO } & LeitoAlocadoEventPayload)
  | ({ type: typeof LEITO_EVENT_NAMES.LIBERADO } & LeitoLiberadoEventPayload)
  | ({
      type: typeof LEITO_EVENT_NAMES.HIGIENIZANDO;
    } & LeitoHigienizandoEventPayload)
  | ({
      type: typeof LEITO_EVENT_NAMES.DISPONIVEL;
    } & LeitoDisponivelEventPayload)
  | ({
      type: typeof LEITO_EVENT_NAMES.MANUTENCAO;
    } & LeitoManutencaoEventPayload)
  | ({ type: typeof LEITO_EVENT_NAMES.BLOQUEADO } & LeitoBloqueadoEventPayload)
  | ({ type: typeof LEITO_EVENT_NAMES.RESERVADO } & LeitoReservadoEventPayload);
