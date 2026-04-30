/**
 * PainelChamadaPage — tela de TV (fullscreen) para chamadas de pacientes.
 *
 * Renderizada FORA do `AppLayout` (rota pública configurada em `App.tsx`).
 * Conecta ao namespace Socket.IO `/painel-chamada` com:
 *   - `setor` (query param) — sala/setor a assinar.
 *   - `token`  (query param opcional) — JWT da TV (perfil dedicado).
 *
 * Eventos consumidos:
 *   - `paciente.chamado` — payload { setorUuid, pacienteIniciais,
 *      pacienteCodigo, sala, prestadorNome, chamadoEm }
 *
 * UX:
 *   - Topo grande: ÚLTIMA CHAMADA + iniciais + sala.
 *   - Lateral: últimas 5 chamadas.
 *   - Beep sonoro ao receber novo chamado (WebAudio).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { BellRing, Hospital, Tv } from 'lucide-react';
import type { ChamadaPaciente } from '@/types/agenda';

const SOCKET_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const TOKEN_REFRESH_INTERVAL_MS = 14 * 60 * 1000; // 14min

function beep(): void {
  try {
    const AudioCtor =
      (window.AudioContext as typeof AudioContext | undefined) ??
      ((window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext);
    if (!AudioCtor) return;
    const ctx = new AudioCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.type = 'sine';
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // Browser sem suporte ou bloqueado por interação — ignora.
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PainelChamadaPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const setor = searchParams.get('setor') ?? '';
  const token = searchParams.get('token');
  const [history, setHistory] = useState<ChamadaPaciente[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!setor) {
      setError('Setor não informado. Adicione ?setor=<uuid> à URL.');
      return;
    }

    const socket = io(`${SOCKET_BASE}/painel-chamada`, {
      transports: ['websocket'],
      query: { setor },
      auth: token ? { token } : undefined,
      reconnection: true,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError(null);
      socket.emit('subscribe', { setor });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', (err: Error) => {
      setError(err.message);
      setConnected(false);
    });

    socket.on('paciente.chamado', (payload: ChamadaPaciente) => {
      setHistory((prev) => [payload, ...prev].slice(0, 6));
      beep();
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [setor, token]);

  // Auto-refresh de token: dispara um evento, backend pode responder com novo
  // token. Implementação completa fica para o backend (Trilha A/B).
  useEffect(() => {
    if (!socketRef.current || !token) return;
    const id = window.setInterval(() => {
      socketRef.current?.emit('refresh-token');
    }, TOKEN_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [token]);

  const last = useMemo(() => history[0] ?? null, [history]);
  const tail = useMemo(() => history.slice(1, 6), [history]);

  return (
    <main className="flex min-h-screen flex-col bg-slate-900 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-700 px-8 py-4">
        <div className="flex items-center gap-3">
          <Hospital aria-hidden="true" className="h-8 w-8 text-primary-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Painel de Chamada
          </h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Tv aria-hidden="true" className="h-4 w-4" />
          <span aria-live="polite">
            {connected ? 'Conectado' : 'Desconectado'}
            {setor ? ` · setor ${setor}` : ''}
          </span>
        </div>
      </header>

      {error ? (
        <div role="alert" className="m-8 rounded-md border border-red-500/30 bg-red-950/40 p-4 text-sm">
          {error}
        </div>
      ) : null}

      <div className="grid flex-1 gap-6 p-8 lg:grid-cols-[2fr_1fr]">
        <section
          aria-label="Última chamada"
          className="flex flex-col items-center justify-center rounded-2xl border border-slate-700 bg-slate-800/40 p-8 text-center"
        >
          <p className="text-sm uppercase tracking-widest text-slate-400">
            Última chamada
          </p>
          {last ? (
            <>
              <h2 className="mt-4 text-7xl font-bold tracking-tight md:text-8xl">
                {last.pacienteIniciais}
              </h2>
              {last.pacienteCodigo ? (
                <p className="mt-2 font-mono text-xl text-slate-300">
                  {last.pacienteCodigo}
                </p>
              ) : null}
              <p className="mt-6 text-3xl text-emerald-300">
                Sala <strong className="text-emerald-200">{last.sala}</strong>
              </p>
              {last.prestadorNome ? (
                <p className="mt-2 text-lg text-slate-300">
                  {last.prestadorNome}
                </p>
              ) : null}
              <p className="mt-4 text-sm text-slate-400">
                Chamado às {formatTime(last.chamadoEm)}
              </p>
            </>
          ) : (
            <p className="mt-6 text-2xl text-slate-400">
              Aguardando próxima chamada...
            </p>
          )}
        </section>

        <aside
          aria-label="Chamadas anteriores"
          className="rounded-2xl border border-slate-700 bg-slate-800/40 p-6"
        >
          <h3 className="flex items-center gap-2 text-sm uppercase tracking-widest text-slate-400">
            <BellRing aria-hidden="true" className="h-4 w-4" />
            Anteriores
          </h3>
          {tail.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">
              Sem histórico recente.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {tail.map((c, idx) => (
                <li
                  key={`${c.chamadoEm}-${idx}`}
                  className="flex items-center justify-between rounded-md bg-slate-900/40 px-3 py-2"
                >
                  <div>
                    <p className="font-semibold">{c.pacienteIniciais}</p>
                    <p className="text-xs text-slate-400">
                      {formatTime(c.chamadoEm)}
                    </p>
                  </div>
                  <span className="rounded-md bg-emerald-700/50 px-2 py-1 text-sm font-semibold text-emerald-100">
                    {c.sala}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </main>
  );
}
