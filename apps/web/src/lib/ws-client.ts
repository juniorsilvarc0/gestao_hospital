/**
 * Helpers para WebSocket (Socket.IO) do HMS-BR.
 *
 * Resolução da URL: prioriza `VITE_WS_URL`, fallback `VITE_API_URL`.
 *
 * Uso recomendado: importe os hooks dedicados (`useFarmaciaPainelWS`,
 * `useMapaSalasWS`) — `connectNamespace` é exposto para casos
 * específicos e para testes.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth-store';
import type {
  DispensacaoEventoPayload,
  DispensacaoEventoTipo,
  DispensacaoTurno,
} from '@/types/farmacia';
import type {
  CirurgiaEventoPayload,
  CirurgiaEventoTipo,
} from '@/types/centro-cirurgico';

export function resolveWsUrl(): string {
  const raw =
    (import.meta.env.VITE_WS_URL as string | undefined) ??
    (import.meta.env.VITE_API_URL as string | undefined) ??
    '';
  return raw.replace(/\/$/, '');
}

export interface ConnectNamespaceOptions {
  namespace: string;
  token: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (err: Error) => void;
}

/** Cria uma conexão Socket.IO autenticada. Caller é responsável por desconectar. */
export function connectNamespace(opts: ConnectNamespaceOptions): Socket {
  const wsUrl = resolveWsUrl();
  const socket: Socket = io(`${wsUrl}${opts.namespace}`, {
    auth: { token: opts.token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });
  if (opts.onConnect) socket.on('connect', opts.onConnect);
  if (opts.onDisconnect) socket.on('disconnect', opts.onDisconnect);
  if (opts.onError) socket.on('connect_error', opts.onError);
  return socket;
}

const FARMACIA_EVENTOS: DispensacaoEventoTipo[] = [
  'dispensacao.criada',
  'dispensacao.separada',
  'dispensacao.dispensada',
  'dispensacao.devolvida',
];

interface UseFarmaciaPainelWSOptions {
  /** Quando informado, o cliente entra na room específica do turno. */
  turno?: DispensacaoTurno;
  /** Callback opcional acionado a cada evento recebido. */
  onEvent?: (
    tipo: DispensacaoEventoTipo,
    payload: DispensacaoEventoPayload,
  ) => void;
  /** Habilita ou desabilita a conexão. */
  enabled?: boolean;
}

/**
 * Conecta no namespace `/farmacia` e invalida a query `['farmacia', 'painel']`
 * a cada evento `dispensacao.*`.
 */
export function useFarmaciaPainelWS(
  options: UseFarmaciaPainelWSOptions = {},
): void {
  const { turno, onEvent, enabled = true } = options;
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled || !accessToken) return;
    const wsUrl = resolveWsUrl();
    if (!wsUrl) return;

    const socket = connectNamespace({
      namespace: '/farmacia',
      token: accessToken,
    });
    socketRef.current = socket;

    function onConnect(): void {
      if (turno) {
        socket.emit('subscribe:turno', { turno });
      } else {
        socket.emit('subscribe:tenant');
      }
    }

    function onReconnect(): void {
      void queryClient.invalidateQueries({ queryKey: ['farmacia', 'painel'] });
    }

    socket.on('connect', onConnect);
    socket.io.on('reconnect', onReconnect);

    const handlers = FARMACIA_EVENTOS.map((tipo) => {
      const handler = (payload: DispensacaoEventoPayload): void => {
        if (onEvent) onEvent(tipo, payload);
        void queryClient.invalidateQueries({
          queryKey: ['farmacia', 'painel'],
        });
      };
      socket.on(tipo, handler);
      return { tipo, handler };
    });

    return () => {
      socket.off('connect', onConnect);
      socket.io.off('reconnect', onReconnect);
      for (const { tipo, handler } of handlers) {
        socket.off(tipo, handler);
      }
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, enabled, turno]);
}

const CIRURGIA_EVENTOS: CirurgiaEventoTipo[] = [
  'cirurgia.agendada',
  'cirurgia.confirmada',
  'cirurgia.iniciada',
  'cirurgia.encerrada',
  'cirurgia.cancelada',
];

interface UseMapaSalasWSOptions {
  enabled?: boolean;
  onEvent?: (
    tipo: CirurgiaEventoTipo,
    payload: CirurgiaEventoPayload,
  ) => void;
}

/**
 * Conecta no namespace `/centro-cirurgico` e invalida a query
 * `['centro-cirurgico', 'mapa']` a cada evento `cirurgia.*`.
 */
export function useMapaSalasWS(options: UseMapaSalasWSOptions = {}): void {
  const { enabled = true, onEvent } = options;
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled || !accessToken) return;
    const wsUrl = resolveWsUrl();
    if (!wsUrl) return;

    const socket = connectNamespace({
      namespace: '/centro-cirurgico',
      token: accessToken,
    });
    socketRef.current = socket;

    function onConnect(): void {
      socket.emit('subscribe:mapa-salas');
    }

    function onReconnect(): void {
      void queryClient.invalidateQueries({
        queryKey: ['centro-cirurgico', 'mapa'],
      });
      void queryClient.invalidateQueries({ queryKey: ['cirurgias'] });
    }

    socket.on('connect', onConnect);
    socket.io.on('reconnect', onReconnect);

    const handlers = CIRURGIA_EVENTOS.map((tipo) => {
      const handler = (payload: CirurgiaEventoPayload): void => {
        if (onEvent) onEvent(tipo, payload);
        void queryClient.invalidateQueries({
          queryKey: ['centro-cirurgico', 'mapa'],
        });
        void queryClient.invalidateQueries({ queryKey: ['cirurgias'] });
      };
      socket.on(tipo, handler);
      return { tipo, handler };
    });

    return () => {
      socket.off('connect', onConnect);
      socket.io.off('reconnect', onReconnect);
      for (const { tipo, handler } of handlers) {
        socket.off(tipo, handler);
      }
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, enabled]);
}
