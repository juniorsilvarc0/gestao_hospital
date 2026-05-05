/**
 * MapaLeitosPage — mapa de leitos em tempo real (WebSocket).
 *
 * - Snapshot inicial via GET /v1/leitos/mapa.
 * - Conexão Socket.IO no namespace `/leitos` (auth token).
 * - `subscribe:setor` quando um setor é filtrado; em "todos" o backend
 *   replica eventos do tenant.
 * - Em desconexão, o cliente do socket reconecta automaticamente; ao
 *   reconectar dispara reload do snapshot.
 *
 * Eventos consumidos:
 *  - leito.alocado, leito.liberado, leito.higienizando, leito.disponivel,
 *    leito.manutencao, leito.bloqueado, leito.reservado.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { Bed, Loader2, RefreshCw, WifiOff, Wifi } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
} from '@/components/ui';
import { getMapaLeitos } from '@/lib/leitos-api';
import { listSetores } from '@/lib/atendimentos-api';
import { LeitoCard } from '@/components/leitos/LeitoCard';
import { LeitoActionsSheet } from '@/components/leitos/LeitoActionsSheet';
import { LEITO_STATUS_PALETTE } from '@/types/leitos';
import type {
  Leito,
  LeitoEvento,
  LeitoStatus,
  MapaLeitos,
} from '@/types/leitos';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

const STATUS_FILTROS: LeitoStatus[] = [
  'DISPONIVEL',
  'OCUPADO',
  'RESERVADO',
  'HIGIENIZACAO',
  'MANUTENCAO',
  'BLOQUEADO',
];

function resolveWsUrl(): string {
  const raw =
    (import.meta.env.VITE_WS_URL as string | undefined) ??
    (import.meta.env.VITE_API_URL as string | undefined) ??
    '';
  return raw.replace(/\/$/, '');
}

function applyEvent(mapa: MapaLeitos, ev: LeitoEvento): MapaLeitos {
  return {
    ...mapa,
    setores: mapa.setores.map((s) => {
      if (s.setorUuid !== ev.setorUuid) return s;
      const idx = s.leitos.findIndex((l) => l.uuid === ev.leitoUuid);
      if (idx < 0) return s;
      const current = s.leitos[idx];
      // Ignora se versão recebida é menor — evita regressão por evento atrasado.
      if (current && ev.versao < current.versao) return s;
      const updated: Leito = current
        ? {
            ...current,
            status: ev.status,
            versao: ev.versao,
            ocupacao: ev.ocupacao ?? null,
          }
        : {
            uuid: ev.leitoUuid,
            codigo: '?',
            setorUuid: ev.setorUuid,
            tipoAcomodacao: 'ENFERMARIA',
            status: ev.status,
            versao: ev.versao,
            ocupacao: ev.ocupacao ?? null,
          };
      const newLeitos = [...s.leitos];
      newLeitos[idx] = updated;
      return { ...s, leitos: newLeitos };
    }),
  };
}

export function MapaLeitosPage(): JSX.Element {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [setorUuid, setSetorUuid] = useState<string>('');
  const [statusToggles, setStatusToggles] = useState<Set<LeitoStatus>>(
    () => new Set<LeitoStatus>(),
  );
  const [snapshot, setSnapshot] = useState<MapaLeitos | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [openSheet, setOpenSheet] = useState(false);
  const [selectedLeito, setSelectedLeito] = useState<Leito | null>(null);

  const setoresQuery = useQuery({
    queryKey: ['setores'],
    queryFn: () => listSetores(),
    staleTime: 5 * 60_000,
  });

  const mapaQuery = useQuery({
    queryKey: ['mapa-leitos', { setor: setorUuid }],
    queryFn: () => getMapaLeitos(setorUuid || undefined),
    staleTime: 5_000,
  });

  // Sincroniza snapshot local com query.
  useEffect(() => {
    if (mapaQuery.data) {
      setSnapshot(mapaQuery.data);
    }
  }, [mapaQuery.data]);

  // Conecta socket.io.
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const wsUrl = resolveWsUrl();
    if (!wsUrl) {
      setWsError('VITE_WS_URL não configurado.');
      return;
    }
    const socket: Socket = io(`${wsUrl}/leitos`, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;

    function onConnect(): void {
      setWsConnected(true);
      setWsError(null);
      if (setorUuid) {
        socket.emit('subscribe:setor', { setorUuid });
      }
    }

    function onDisconnect(): void {
      setWsConnected(false);
    }

    function onConnectError(err: Error): void {
      setWsError(err.message);
      setWsConnected(false);
    }

    function onReconnect(): void {
      // Recarrega snapshot para evitar drift.
      void queryClient.invalidateQueries({ queryKey: ['mapa-leitos'] });
    }

    function onLeitoEvento(payload: LeitoEvento): void {
      setSnapshot((prev) => (prev ? applyEvent(prev, payload) : prev));
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect', onReconnect);

    socket.on('leito.alocado', onLeitoEvento);
    socket.on('leito.liberado', onLeitoEvento);
    socket.on('leito.higienizando', onLeitoEvento);
    socket.on('leito.disponivel', onLeitoEvento);
    socket.on('leito.manutencao', onLeitoEvento);
    socket.on('leito.bloqueado', onLeitoEvento);
    socket.on('leito.reservado', onLeitoEvento);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect', onReconnect);
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Subscribe quando muda o setor filtrado.
  useEffect(() => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    if (setorUuid) {
      s.emit('subscribe:setor', { setorUuid });
    } else {
      s.emit('unsubscribe:setor');
    }
  }, [setorUuid]);

  function toggleStatus(status: LeitoStatus): void {
    setStatusToggles((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const setoresFiltrados = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.setores.map((s) => ({
      ...s,
      leitos:
        statusToggles.size === 0
          ? s.leitos
          : s.leitos.filter((l) => statusToggles.has(l.status)),
    }));
  }, [snapshot, statusToggles]);

  function handleClickLeito(l: Leito): void {
    setSelectedLeito(l);
    setOpenSheet(true);
  }

  return (
    <section className="space-y-4" aria-label="Mapa de leitos">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Bed aria-hidden="true" className="h-6 w-6" />
            Mapa de leitos
          </h1>
          <p className="text-sm text-muted-foreground">
            Atualização em tempo real via WebSocket.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="filtro-setor-mapa">Setor</Label>
            <Select
              id="filtro-setor-mapa"
              value={setorUuid}
              onChange={(event) => setSetorUuid(event.target.value)}
            >
              <option key="__empty__" value="">Todos</option>
              {(setoresQuery.data ?? []).map((s) => (
                <option key={s.uuid} value={s.uuid}>
                  {s.nome}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ['mapa-leitos'] })
            }
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
          <span
            data-testid="ws-status"
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
              wsConnected
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : 'border-zinc-300 bg-zinc-50 text-zinc-700',
            )}
            title={wsError ?? undefined}
          >
            {wsConnected ? (
              <>
                <Wifi aria-hidden="true" className="h-3 w-3" />
                Online
              </>
            ) : (
              <>
                <WifiOff aria-hidden="true" className="h-3 w-3" />
                Reconectando
              </>
            )}
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2">
        <span className="mr-2 text-xs font-medium text-muted-foreground">
          Filtros:
        </span>
        {STATUS_FILTROS.map((s) => {
          const palette = LEITO_STATUS_PALETTE[s];
          const active = statusToggles.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all',
                palette.badge,
                active ? 'ring-2 ring-offset-1 ring-foreground' : 'opacity-70',
              )}
            >
              <span aria-hidden="true">{palette.emoji}</span>
              {palette.label}
            </button>
          );
        })}
      </div>

      {mapaQuery.isLoading && !snapshot ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando mapa...
        </p>
      ) : null}

      {snapshot && setoresFiltrados.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum setor com leitos para os filtros atuais.
        </p>
      ) : null}

      {setoresFiltrados.map((setor) => (
        <Card key={setor.setorUuid}>
          <CardHeader>
            <CardTitle className="text-base">
              {setor.setorNome}
              {setor.unidadeNome ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  · {setor.unidadeNome}
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {setor.leitos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem leitos para os filtros atuais.
              </p>
            ) : (
              <div
                role="list"
                aria-label={`Leitos do setor ${setor.setorNome}`}
                className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
              >
                {setor.leitos.map((l) => (
                  <div role="listitem" key={l.uuid}>
                    <LeitoCard leito={l} onClick={handleClickLeito} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <LeitoActionsSheet
        open={openSheet}
        onOpenChange={setOpenSheet}
        leito={selectedLeito}
      />
    </section>
  );
}
