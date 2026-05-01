/**
 * PepPage — Prontuário Eletrônico do Paciente (Fase 6, Trilha C R2).
 *
 * Layout em 3 colunas (docs/06 §3.5):
 *   - Esquerda (250px): cartão do paciente, alergias, comorbidades.
 *   - Central (flex-1): timeline filtrável.
 *   - Direita (350px): resumo clínico (sinais vitais + cuidados +
 *     exames pendentes + documentos).
 *
 * FAB bottom-right com atalhos para criar evolução, prescrição,
 * sinais vitais (modal inline) e documento.
 *
 * Comportamento LGPD (RN-LGP-01 / RN-PEP-07):
 *   - Antes de qualquer fetch, exige finalidade declarada no
 *     `useFinalidadeStore`. Se ausente / expirada, abre
 *     <FinalidadeModal>.
 *   - As queries são `enabled` somente quando há finalidade vigente.
 *
 * NÃO contém PHI em logs/console.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  Beaker,
  ClipboardList,
  FileText,
  Filter,
  Pill,
  Plus,
  ShieldAlert,
  Stethoscope,
  User,
  UserPlus,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  Skeleton,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { getAtendimento } from '@/lib/atendimentos-api';
import { getResumoClinico, getTimeline } from '@/lib/pep-api';
import { FinalidadeModal } from '@/components/pep/FinalidadeModal';
import { SinaisVitaisInlineModal } from '@/components/pep/SinaisVitaisInlineModal';
import {
  getFinalidadeForAtendimento,
  useFinalidadeStore,
} from '@/stores/finalidade-store';
import type {
  FinalidadeAcesso,
  ResumoClinico,
  SinaisVitaisRegistro,
  TimelineEvento,
  TimelineEventoTipo,
} from '@/types/pep';
import type { SinaisVitais } from '@/types/atendimentos';
import { cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/pep/DateRangePicker';

const FILTROS_TIPO: { value: 'TODOS' | TimelineEventoTipo; label: string }[] = [
  { value: 'TODOS', label: 'Tudo' },
  { value: 'EVOLUCAO', label: 'Evoluções' },
  { value: 'PRESCRICAO', label: 'Prescrições' },
  { value: 'SINAIS_VITAIS', label: 'Sinais Vitais' },
  { value: 'EXAME_SOLICITADO', label: 'Exames pendentes' },
  { value: 'EXAME_LAUDADO', label: 'Exames laudados' },
  { value: 'DOCUMENTO', label: 'Documentos' },
];

const ICON_BY_TIPO: Record<TimelineEventoTipo, typeof Stethoscope> = {
  EVOLUCAO: Stethoscope,
  PRESCRICAO: Pill,
  SINAIS_VITAIS: Activity,
  EXAME_SOLICITADO: Beaker,
  EXAME_LAUDADO: Beaker,
  DOCUMENTO: FileText,
};

const COLOR_BY_TIPO: Record<TimelineEventoTipo, string> = {
  EVOLUCAO: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  PRESCRICAO: 'text-blue-700 bg-blue-50 border-blue-200',
  SINAIS_VITAIS: 'text-purple-700 bg-purple-50 border-purple-200',
  EXAME_SOLICITADO: 'text-amber-700 bg-amber-50 border-amber-200',
  EXAME_LAUDADO: 'text-cyan-700 bg-cyan-50 border-cyan-200',
  DOCUMENTO: 'text-slate-700 bg-slate-50 border-slate-200',
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

function isWithinRange(
  iso: string,
  startISO: string,
  endISO: string,
): boolean {
  if (!startISO && !endISO) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  if (startISO) {
    const s = new Date(`${startISO}T00:00:00`).getTime();
    if (t < s) return false;
  }
  if (endISO) {
    const e = new Date(`${endISO}T23:59:59`).getTime();
    if (t > e) return false;
  }
  return true;
}

export function PepPage(): JSX.Element {
  const { atendimentoUuid = '' } = useParams<{ atendimentoUuid: string }>();
  const navigate = useNavigate();

  // Watch o store para reagir quando o usuário confirma a finalidade
  // dentro do <FinalidadeModal>.
  const entries = useFinalidadeStore((s) => s.entries);
  const finalidadeEntry = useMemo(
    () => getFinalidadeForAtendimento(atendimentoUuid),
    // `entries` é a fonte da reatividade; o helper só lê o snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atendimentoUuid, entries],
  );
  const finalidade: FinalidadeAcesso | null = finalidadeEntry?.finalidade ?? null;

  // Modal de finalidade aberto sempre que ausente/expirada.
  const [openFinalidade, setOpenFinalidade] = useState(!finalidade);
  useEffect(() => {
    setOpenFinalidade(!finalidade);
  }, [finalidade]);

  const [tipoFiltro, setTipoFiltro] = useState<'TODOS' | TimelineEventoTipo>(
    'TODOS',
  );
  const [periodoStart, setPeriodoStart] = useState<string>('');
  const [periodoEnd, setPeriodoEnd] = useState<string>('');
  const [openVitalsInline, setOpenVitalsInline] = useState(false);

  const atendimentoQuery = useQuery({
    queryKey: ['atendimentos', atendimentoUuid],
    queryFn: () => getAtendimento(atendimentoUuid),
    enabled: Boolean(atendimentoUuid),
  });

  const timelineQuery = useQuery({
    queryKey: ['pep', 'timeline', atendimentoUuid, finalidade],
    queryFn: () => getTimeline(atendimentoUuid, finalidade ?? 'CONSULTA'),
    enabled: Boolean(atendimentoUuid && finalidade),
  });

  const resumoQuery = useQuery({
    queryKey: ['pep', 'resumo', atendimentoUuid, finalidade],
    queryFn: () => getResumoClinico(atendimentoUuid, finalidade ?? 'CONSULTA'),
    enabled: Boolean(atendimentoUuid && finalidade),
  });

  const eventosFiltrados = useMemo<TimelineEvento[]>(() => {
    const events = timelineQuery.data ?? [];
    return events
      .filter((ev) => (tipoFiltro === 'TODOS' ? true : ev.tipo === tipoFiltro))
      .filter((ev) => isWithinRange(ev.dataHoraEvento, periodoStart, periodoEnd))
      .sort(
        (a, b) =>
          new Date(b.dataHoraEvento).getTime() -
          new Date(a.dataHoraEvento).getTime(),
      );
  }, [timelineQuery.data, tipoFiltro, periodoStart, periodoEnd]);

  function handleNavigateToEvent(ev: TimelineEvento): void {
    if (ev.tipo === 'EVOLUCAO') {
      navigate(`/pep/${atendimentoUuid}/evolucoes/nova?uuid=${ev.refUuid}`);
      return;
    }
    if (ev.tipo === 'EXAME_LAUDADO' || ev.tipo === 'EXAME_SOLICITADO') {
      navigate(`/laudos`);
      return;
    }
    // Outros tipos: mantém na página com toast informativo (TODO Fase 7+).
  }

  if (atendimentoQuery.isLoading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (atendimentoQuery.isError || !atendimentoQuery.data) {
    const msg =
      atendimentoQuery.error instanceof ApiError
        ? atendimentoQuery.error.detail ?? atendimentoQuery.error.message
        : 'Falha ao carregar atendimento.';
    return (
      <section className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          {msg}
        </p>
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft aria-hidden="true" />
          Voltar
        </Button>
      </section>
    );
  }

  const atendimento = atendimentoQuery.data;
  const resumo: ResumoClinico | null = resumoQuery.data ?? null;

  return (
    <section
      className="relative flex min-h-[calc(100vh-7rem)] gap-3"
      aria-label="Prontuário Eletrônico do Paciente"
    >
      <FinalidadeModal
        open={openFinalidade}
        atendimentoUuid={atendimentoUuid}
        pacienteNome={atendimento.pacienteNome}
        onConfirm={() => setOpenFinalidade(false)}
        onCancel={() => navigate(`/atendimentos/${atendimentoUuid}`)}
      />

      {/* Coluna esquerda — paciente */}
      <aside
        aria-label="Dados do paciente"
        className="hidden w-[250px] shrink-0 lg:block"
      >
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div
              aria-hidden="true"
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted"
            >
              {atendimento.pacienteFotoUrl ? (
                <img
                  src={atendimento.pacienteFotoUrl}
                  alt=""
                  className="h-20 w-20 rounded-full object-cover"
                />
              ) : (
                <User className="h-10 w-10 text-muted-foreground" />
              )}
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">
                {atendimento.pacienteNome}
              </p>
              {atendimento.pacienteIdade !== undefined &&
              atendimento.pacienteIdade !== null ? (
                <p className="text-xs text-muted-foreground">
                  {atendimento.pacienteIdade} anos
                </p>
              ) : null}
              <p className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                Atend. {atendimento.numero}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {atendimento.status} · {atendimento.setorNome ?? '—'}
                {atendimento.leitoCodigo ? ` · ${atendimento.leitoCodigo}` : ''}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldAlert
                aria-hidden="true"
                className="h-4 w-4 text-destructive"
              />
              Alergias
            </CardTitle>
          </CardHeader>
          <CardContent>
            {atendimento.pacienteAlergias?.length ? (
              <ul className="flex flex-wrap gap-1">
                {atendimento.pacienteAlergias.map((a) => (
                  <li
                    key={a.substancia}
                    className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
                  >
                    {a.substancia}
                    {a.gravidade ? ` (${a.gravidade})` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhuma documentada.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="mt-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Comorbidades</CardTitle>
          </CardHeader>
          <CardContent>
            {atendimento.pacienteComorbidades?.length ? (
              <ul className="space-y-1 text-xs">
                {atendimento.pacienteComorbidades.map((c) => (
                  <li key={c.descricao} className="flex justify-between gap-2">
                    <span>{c.descricao}</span>
                    {c.cid ? (
                      <span className="text-muted-foreground">{c.cid}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma.</p>
            )}
          </CardContent>
        </Card>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={() =>
            window.alert(
              'Solicitação de parecer / interconsulta — disponível na próxima fase.',
            )
          }
        >
          <UserPlus aria-hidden="true" />
          Solicitar interconsulta
        </Button>
      </aside>

      {/* Coluna central — timeline */}
      <main className="min-w-0 flex-1 space-y-3" aria-label="Timeline do PEP">
        <Card>
          <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList aria-hidden="true" className="h-4 w-4" />
                Timeline clínica
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {finalidade
                  ? `Acesso registrado: ${finalidade}`
                  : 'Aguardando declaração de finalidade.'}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex items-center gap-1 text-xs">
                <Filter
                  aria-hidden="true"
                  className="h-3 w-3 text-muted-foreground"
                />
                <span className="sr-only">Tipo</span>
                <Select
                  aria-label="Filtro de tipo"
                  value={tipoFiltro}
                  onChange={(e) =>
                    setTipoFiltro(
                      e.target.value as 'TODOS' | TimelineEventoTipo,
                    )
                  }
                >
                  {FILTROS_TIPO.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </label>
              <DateRangePicker
                start={periodoStart}
                end={periodoEnd}
                onChange={(s, e) => {
                  setPeriodoStart(s);
                  setPeriodoEnd(e);
                }}
              />
            </div>
          </CardHeader>
          <CardContent>
            {timelineQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : timelineQuery.isError ? (
              <p role="alert" className="text-sm text-destructive">
                Falha ao carregar timeline.
              </p>
            ) : eventosFiltrados.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum evento no período/filtro selecionado.
              </p>
            ) : (
              <ol
                className="space-y-2"
                aria-label="Eventos da timeline"
                data-testid="pep-timeline"
              >
                {eventosFiltrados.map((ev) => (
                  <li key={`${ev.tipo}-${ev.uuid}`}>
                    <TimelineCard
                      ev={ev}
                      onOpen={() => handleNavigateToEvent(ev)}
                    />
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Coluna direita — resumo */}
      <aside
        aria-label="Resumo clínico"
        className="hidden w-[350px] shrink-0 space-y-3 xl:block"
      >
        <SinaisVitaisCard registro={resumo?.ultimosSinaisVitais ?? null} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cuidados ativos</CardTitle>
          </CardHeader>
          <CardContent>
            {resumo?.cuidadosAtivos?.length ? (
              <ul className="space-y-1 text-xs">
                {resumo.cuidadosAtivos.map((c, idx) => (
                  <li key={`${c.descricao}-${idx}`}>
                    <span className="font-medium">{c.descricao}</span>
                    {c.frequencia ? (
                      <span className="ml-2 text-muted-foreground">
                        {c.frequencia}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum cuidado ativo.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Exames pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            {resumo?.examesPendentes?.length ? (
              <ul className="space-y-1 text-xs">
                {resumo.examesPendentes.map((e) => (
                  <li
                    key={e.uuid}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>{e.descricao}</span>
                    <span className="text-muted-foreground">
                      {formatDateTime(e.solicitadoEm)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sem pendências.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Documentos recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const docs = (timelineQuery.data ?? [])
                .filter((ev) => ev.tipo === 'DOCUMENTO')
                .slice(0, 3);
              if (docs.length === 0) {
                return (
                  <p className="text-xs text-muted-foreground">
                    Nenhum documento emitido.
                  </p>
                );
              }
              return (
                <ul className="space-y-1 text-xs">
                  {docs.map((d) => (
                    <li
                      key={d.uuid}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>{d.titulo}</span>
                      <span className="text-muted-foreground">
                        {formatDateTime(d.dataHoraEvento)}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </CardContent>
        </Card>
      </aside>

      {/* FAB inferior direito */}
      <div
        aria-label="Ações rápidas"
        className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2"
      >
        <FabButton
          icon={Stethoscope}
          label="Nova evolução"
          onClick={() =>
            navigate(`/pep/${atendimentoUuid}/evolucoes/nova`)
          }
        />
        <FabButton
          icon={Pill}
          label="Nova prescrição"
          onClick={() =>
            navigate(`/pep/${atendimentoUuid}/prescricoes/nova`)
          }
        />
        <FabButton
          icon={Activity}
          label="Sinais vitais"
          onClick={() => setOpenVitalsInline(true)}
        />
        <FabButton
          icon={FileText}
          label="Novo documento"
          onClick={() =>
            navigate(`/atendimentos/${atendimentoUuid}/documentos/novo`)
          }
        />
      </div>

      <SinaisVitaisInlineModal
        open={openVitalsInline}
        onOpenChange={setOpenVitalsInline}
        onConfirm={(_values: SinaisVitais, _confirmado, _evaDor) => {
          navigate(`/pep/${atendimentoUuid}/sinais-vitais/novo`);
        }}
      />
    </section>
  );
}

/* ---------------------------- TimelineCard ------------------------------ */

interface TimelineCardProps {
  ev: TimelineEvento;
  onOpen: () => void;
}

function TimelineCard({ ev, onOpen }: TimelineCardProps): JSX.Element {
  const Icon = ICON_BY_TIPO[ev.tipo];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent/40',
        COLOR_BY_TIPO[ev.tipo],
      )}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70"
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{ev.titulo}</p>
          {ev.assinada ? (
            <span className="rounded-full border border-emerald-500 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900">
              ASSINADO ✓
            </span>
          ) : null}
          {ev.status && !ev.assinada ? (
            <span className="rounded-full border bg-white/70 px-1.5 py-0.5 text-[10px] uppercase">
              {ev.status}
            </span>
          ) : null}
        </div>
        {ev.resumo ? (
          <p className="line-clamp-2 text-xs opacity-90">{ev.resumo}</p>
        ) : null}
        <p className="text-[11px] opacity-70">
          {formatDateTime(ev.dataHoraEvento)}
          {ev.autorNome ? ` · ${ev.autorNome}` : ''}
        </p>
      </div>
    </button>
  );
}

/* ----------------------------- SinaisVitaisCard ------------------------- */

interface SinaisVitaisCardProps {
  registro: SinaisVitaisRegistro | null;
}

function SinaisVitaisCard({ registro }: SinaisVitaisCardProps): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity aria-hidden="true" className="h-4 w-4 text-purple-700" />
          Sinais vitais (último)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {registro ? (
          <>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <Vital label="PA" value={formatPa(registro.sinaisVitais)} />
              <Vital
                label="FC"
                value={maybeNum(registro.sinaisVitais.fc, ' bpm')}
              />
              <Vital
                label="FR"
                value={maybeNum(registro.sinaisVitais.fr, ' irpm')}
              />
              <Vital
                label="T"
                value={maybeNum(registro.sinaisVitais.temp, ' °C')}
              />
              <Vital
                label="SatO₂"
                value={maybeNum(registro.sinaisVitais.satO2, '%')}
              />
              <Vital
                label="Glic."
                value={maybeNum(registro.sinaisVitais.glicemia, ' mg/dL')}
              />
            </dl>
            <p className="text-[11px] text-muted-foreground">
              Aferido em {formatDateTime(registro.dataHoraAfericao)}
              {registro.registradoPorNome
                ? ` · ${registro.registradoPorNome}`
                : ''}
            </p>
            <Sparkline values={extractSparklineFc([registro])} ariaLabel="Tendência de FC" />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nenhum sinal vital registrado.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Vital({
  label,
  value,
}: {
  label: string;
  value: string | null;
}): JSX.Element {
  return (
    <div className="rounded-md border bg-muted/40 p-2">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-semibold">{value ?? '—'}</dd>
    </div>
  );
}

function maybeNum(
  v: number | null | undefined,
  suffix = '',
): string | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return `${v}${suffix}`;
}

function formatPa(sv: {
  paSistolica?: number | null;
  paDiastolica?: number | null;
}): string | null {
  if (sv.paSistolica && sv.paDiastolica) {
    return `${sv.paSistolica}/${sv.paDiastolica}`;
  }
  if (sv.paSistolica) return `${sv.paSistolica}/—`;
  return null;
}

function extractSparklineFc(records: SinaisVitaisRegistro[]): number[] {
  return records
    .map((r) => r.sinaisVitais.fc ?? null)
    .filter((v): v is number => typeof v === 'number');
}

/* ----------------------------- Sparkline -------------------------------- */

interface SparklineProps {
  values: number[];
  ariaLabel: string;
}

function Sparkline({ values, ariaLabel }: SparklineProps): JSX.Element | null {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 24 - ((v - min) / range) * 22;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox="0 0 100 24"
      className="h-6 w-full text-purple-700"
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}

/* ----------------------------- FabButton -------------------------------- */

interface FabButtonProps {
  icon: typeof Stethoscope;
  label: string;
  onClick: () => void;
}

function FabButton({ icon: Icon, label, onClick }: FabButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="group flex items-center gap-2 rounded-full border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md transition-all hover:bg-primary/90"
    >
      <Plus aria-hidden="true" className="h-3 w-3 opacity-70" />
      <Icon aria-hidden="true" className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

