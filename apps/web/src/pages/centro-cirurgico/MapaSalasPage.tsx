/**
 * MapaSalasPage — mapa do centro cirúrgico (timeline horizontal por sala).
 *
 * Implementação atual: layout custom horizontal (uma linha por sala,
 * cirurgias renderizadas como blocos coloridos por status). FullCalendar
 * `resourceTimeline` está disponível só na versão Premium — usamos o
 * layout próprio para evitar a licença.
 *
 * Tempo real via `useMapaSalasWS`. Click em bloco → navega para
 * `/cirurgias/:uuid`.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HeartPulse, Loader2, RefreshCw } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@/components/ui';
import { getMapaSalas } from '@/lib/centro-cirurgico-api';
import { useMapaSalasWS } from '@/lib/ws-client';
import {
  CIRURGIA_STATUS_COLOR,
  CIRURGIA_STATUS_LABEL,
  type CirurgiaResumo,
  type CirurgiaStatus,
} from '@/types/centro-cirurgico';
import { cn } from '@/lib/utils';

const HOUR_PX = 60; // largura por hora
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(d.getDate()).padStart(2, '0')}`;
}

function minutesFromMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export function MapaSalasPage(): JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [data, setData] = useState<string>(todayISO());

  const mapaQuery = useQuery({
    queryKey: ['centro-cirurgico', 'mapa', { data }],
    queryFn: () => getMapaSalas(data),
    staleTime: 5_000,
  });

  useMapaSalasWS();

  const salas = useMemo(() => mapaQuery.data?.salas ?? [], [mapaQuery.data]);

  return (
    <section className="space-y-4" aria-label="Mapa de salas cirúrgicas">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <HeartPulse aria-hidden="true" className="h-6 w-6" />
            Mapa de salas
          </h1>
          <p className="text-sm text-muted-foreground">
            Cirurgias do dia em tempo real (RN-CC-08).
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="filtro-data-mapa">Data</Label>
            <Input
              id="filtro-data-mapa"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ['centro-cirurgico', 'mapa'],
              })
            }
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => navigate('/cirurgias/nova')}
          >
            Agendar cirurgia
          </Button>
        </div>
      </header>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 text-xs">
        <span className="mr-1 font-medium text-muted-foreground">
          Legenda:
        </span>
        {(Object.keys(CIRURGIA_STATUS_LABEL) as CirurgiaStatus[]).map((s) => (
          <span
            key={s}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
              CIRURGIA_STATUS_COLOR[s].badge,
            )}
          >
            {CIRURGIA_STATUS_LABEL[s]}
          </span>
        ))}
      </div>

      {mapaQuery.isLoading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando mapa...
        </p>
      ) : null}

      {mapaQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Falha ao carregar o mapa.
        </p>
      ) : null}

      {salas.length === 0 && !mapaQuery.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma sala configurada para o dia.
        </p>
      ) : null}

      {salas.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Timeline horizontal</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <div className="min-w-[1500px]">
              {/* Header de horas */}
              <div className="sticky top-0 z-10 flex border-b bg-background">
                <div className="w-40 shrink-0 border-r p-2 text-xs font-medium">
                  Sala
                </div>
                <div className="relative flex-1">
                  <div className="flex">
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        style={{ width: HOUR_PX }}
                        className="border-r py-1 text-center text-[10px] text-muted-foreground"
                      >
                        {String(h).padStart(2, '0')}h
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {salas.map((s) => (
                <div
                  key={s.salaUuid}
                  data-testid={`sala-${s.salaUuid}`}
                  className="flex border-b"
                >
                  <div className="w-40 shrink-0 border-r p-2 text-sm">
                    <p className="font-medium">{s.salaNome}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {s.cirurgias.length} cirurgia(s)
                    </p>
                  </div>
                  <div className="relative flex-1" style={{ height: 56 }}>
                    {/* Linhas de horas */}
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        style={{ left: h * HOUR_PX, width: HOUR_PX }}
                        className="absolute inset-y-0 border-r"
                      />
                    ))}
                    {/* Cirurgias */}
                    {s.cirurgias.map((c) => (
                      <CirurgiaBlock
                        key={c.uuid}
                        cirurgia={c}
                        onClick={() => navigate(`/cirurgias/${c.uuid}`)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

interface CirurgiaBlockProps {
  cirurgia: CirurgiaResumo;
  onClick: () => void;
}

function CirurgiaBlock({ cirurgia, onClick }: CirurgiaBlockProps): JSX.Element {
  const startMin = minutesFromMidnight(
    cirurgia.inicioReal ?? cirurgia.inicioPrevisto,
  );
  const endMin = minutesFromMidnight(
    cirurgia.fimReal ?? cirurgia.fimPrevisto,
  );
  const left = (startMin / 60) * HOUR_PX;
  const width = Math.max(60, ((endMin - startMin) / 60) * HOUR_PX);
  const palette = CIRURGIA_STATUS_COLOR[cirurgia.status];
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`cirurgia-block-${cirurgia.uuid}`}
      data-status={cirurgia.status}
      title={`${cirurgia.pacienteNome} — ${cirurgia.procedimentoPrincipalNome}`}
      style={{
        left,
        width,
        backgroundColor: palette.bg,
        borderColor: palette.border,
        color: palette.text,
      }}
      className="absolute top-1 bottom-1 truncate rounded-md border px-2 text-left text-[11px] shadow-sm transition-transform hover:translate-y-[-1px] hover:shadow-md"
    >
      <p className="truncate font-medium">{cirurgia.pacienteNome}</p>
      <p className="truncate opacity-90">
        {cirurgia.procedimentoPrincipalNome}
      </p>
    </button>
  );
}
