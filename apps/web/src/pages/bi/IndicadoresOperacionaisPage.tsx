/**
 * IndicadoresOperacionaisPage — 3 tabs:
 *   - No-show               → /v1/indicadores/operacionais/no-show
 *   - Classificação de risco→ /v1/indicadores/operacionais/classificacao-risco
 *   - Cirurgias por sala    → /v1/indicadores/operacionais/cirurgias-sala
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gauge } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
} from '@/components/ui';
import {
  getIndicadorNoShow,
  getIndicadorClassificacaoRisco,
  getIndicadorCirurgiasSala,
} from '@/lib/bi-api';
import {
  extractRows,
  ExportButton,
  formatDate,
  formatNumber,
  formatPct,
  Tabs,
} from './bi-helpers';
import { IndicadorTable, type IndicadorColumn } from './IndicadorTable';

type TabKey = 'no-show' | 'classificacao' | 'cirurgias-sala';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'no-show', label: 'No-show' },
  { key: 'classificacao', label: 'Classificação de risco' },
  { key: 'cirurgias-sala', label: 'Cirurgias por sala' },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function defaultCompetenciaRangeStart(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 5);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function defaultCompetenciaRangeEnd(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function IndicadoresOperacionaisPage(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('no-show');
  return (
    <section className="space-y-4" aria-label="Indicadores operacionais">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Gauge aria-hidden="true" className="h-6 w-6" />
          Indicadores operacionais
        </h1>
        <p className="text-sm text-muted-foreground">
          No-show · classificação Manchester · cirurgias por sala.
        </p>
      </header>

      <Tabs
        tabs={TABS}
        active={tab}
        onChange={setTab}
        ariaLabel="Indicadores operacionais"
      />

      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'no-show' ? <NoShowTab /> : null}
        {tab === 'classificacao' ? <ClassificacaoTab /> : null}
        {tab === 'cirurgias-sala' ? <CirurgiasSalaTab /> : null}
      </div>
    </section>
  );
}

IndicadoresOperacionaisPage.displayName = 'IndicadoresOperacionaisPage';

/* ============================== Tabs ============================== */

function NoShowTab(): JSX.Element {
  const [competenciaInicio, setCompetenciaInicio] = useState<string>(
    defaultCompetenciaRangeStart,
  );
  const [competenciaFim, setCompetenciaFim] = useState<string>(
    defaultCompetenciaRangeEnd,
  );
  const [recursoUuid, setRecursoUuid] = useState<string>('');

  const filtros = {
    competenciaInicio,
    competenciaFim,
    ...(recursoUuid ? { recursoUuid } : {}),
  };

  const query = useQuery({
    queryKey: ['bi', 'indicador-noshow', competenciaInicio, competenciaFim, recursoUuid],
    queryFn: () => getIndicadorNoShow(filtros),
    staleTime: 60_000,
  });

  const rows = extractRows<Record<string, unknown>>(query.data);

  const columns: IndicadorColumn<Record<string, unknown>>[] = [
    {
      key: 'comp',
      label: 'Competência',
      render: (r) => formatDate(String(r['competencia'] ?? '')),
    },
    {
      key: 'rec',
      label: 'Recurso',
      render: (r) =>
        `${String(r['recursoNome'] ?? r['recursoUuid'] ?? '—')} ${
          r['recursoTipo'] ? `(${r['recursoTipo']})` : ''
        }`,
    },
    {
      key: 'tot',
      label: 'Agendamentos',
      render: (r) => formatNumber(r['totalAgendamentos'] ?? r['agendados']),
      className: 'tabular-nums',
    },
    {
      key: 'real',
      label: 'Realizados',
      render: (r) => formatNumber(r['realizados']),
      className: 'tabular-nums',
    },
    {
      key: 'ns',
      label: 'No-show',
      render: (r) => formatNumber(r['noShow']),
      className: 'tabular-nums text-orange-700',
    },
    {
      key: 'taxa',
      label: 'Taxa %',
      render: (r) => formatPct(r['taxaNoShowPct'] ?? r['taxa']),
      className: 'tabular-nums',
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="ns-ci" className="text-xs">
              De
            </Label>
            <Input
              id="ns-ci"
              type="month"
              value={competenciaInicio}
              onChange={(e) => setCompetenciaInicio(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="ns-cf" className="text-xs">
              Até
            </Label>
            <Input
              id="ns-cf"
              type="month"
              value={competenciaFim}
              onChange={(e) => setCompetenciaFim(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="ns-rec" className="text-xs">
              Recurso
            </Label>
            <Input
              id="ns-rec"
              value={recursoUuid}
              onChange={(e) => setRecursoUuid(e.target.value)}
              className="w-72"
            />
          </div>
        </div>
        <ExportButton view="mv_no_show" body={{ filtros }} />
      </CardHeader>
      <CardContent>
        <IndicadorTable
          columns={columns}
          rows={rows}
          isLoading={query.isLoading}
        />
      </CardContent>
    </Card>
  );
}

function ClassificacaoTab(): JSX.Element {
  const [dataInicio, setDataInicio] = useState<string>(() => isoNDaysAgo(30));
  const [dataFim, setDataFim] = useState<string>(() => todayIso());

  const filtros = { dataInicio, dataFim };

  const query = useQuery({
    queryKey: ['bi', 'indicador-classif', dataInicio, dataFim],
    queryFn: () => getIndicadorClassificacaoRisco(filtros),
    staleTime: 60_000,
  });

  const rows = extractRows<Record<string, unknown>>(query.data);

  const columns: IndicadorColumn<Record<string, unknown>>[] = [
    {
      key: 'dia',
      label: 'Dia',
      render: (r) => formatDate(String(r['dia'] ?? '')),
    },
    {
      key: 'classe',
      label: 'Classe',
      render: (r) => String(r['classe'] ?? r['prioridade'] ?? '—'),
    },
    {
      key: 'qtd',
      label: 'Qtd',
      render: (r) => formatNumber(r['qtd']),
      className: 'tabular-nums',
    },
    {
      key: 'tempo-cl',
      label: 'Tempo até classif. (min)',
      render: (r) => formatNumber(r['tempoAteClassificacaoMin']),
      className: 'tabular-nums',
    },
    {
      key: 'tempo-at',
      label: 'Atend. pós-classif. (min)',
      render: (r) =>
        formatNumber(
          r['tempoAtendimentoAposClassifMin'] ??
            r['tempoMedioAtendimentoMin'],
        ),
      className: 'tabular-nums',
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="cl-di" className="text-xs">
              De
            </Label>
            <Input
              id="cl-di"
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-44"
            />
          </div>
          <div>
            <Label htmlFor="cl-df" className="text-xs">
              Até
            </Label>
            <Input
              id="cl-df"
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-44"
            />
          </div>
        </div>
        <ExportButton view="mv_classificacao_risco" body={{ filtros }} />
      </CardHeader>
      <CardContent>
        <IndicadorTable
          columns={columns}
          rows={rows}
          isLoading={query.isLoading}
        />
      </CardContent>
    </Card>
  );
}

function CirurgiasSalaTab(): JSX.Element {
  const [dataInicio, setDataInicio] = useState<string>(() => isoNDaysAgo(30));
  const [dataFim, setDataFim] = useState<string>(() => todayIso());
  const [salaUuid, setSalaUuid] = useState<string>('');

  const filtros = {
    dataInicio,
    dataFim,
    ...(salaUuid ? { salaUuid } : {}),
  };

  const query = useQuery({
    queryKey: ['bi', 'indicador-cir-sala', dataInicio, dataFim, salaUuid],
    queryFn: () => getIndicadorCirurgiasSala(filtros),
    staleTime: 60_000,
  });

  const rows = extractRows<Record<string, unknown>>(query.data);

  const columns: IndicadorColumn<Record<string, unknown>>[] = [
    {
      key: 'dia',
      label: 'Dia',
      render: (r) => formatDate(String(r['dia'] ?? '')),
    },
    {
      key: 'sala',
      label: 'Sala',
      render: (r) => String(r['salaNome'] ?? r['salaUuid'] ?? '—'),
    },
    {
      key: 'ag',
      label: 'Agendadas',
      render: (r) => formatNumber(r['qtdAgendadas'] ?? r['qtdCirurgias']),
      className: 'tabular-nums',
    },
    {
      key: 'co',
      label: 'Concluídas',
      render: (r) => formatNumber(r['qtdConcluidas']),
      className: 'tabular-nums text-emerald-700',
    },
    {
      key: 'ca',
      label: 'Canceladas',
      render: (r) => formatNumber(r['qtdCanceladas']),
      className: 'tabular-nums text-red-700',
    },
    {
      key: 'dur',
      label: 'Duração média (min)',
      render: (r) => formatNumber(r['duracaoMediaMin']),
      className: 'tabular-nums',
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="cs-di" className="text-xs">
              De
            </Label>
            <Input
              id="cs-di"
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-44"
            />
          </div>
          <div>
            <Label htmlFor="cs-df" className="text-xs">
              Até
            </Label>
            <Input
              id="cs-df"
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-44"
            />
          </div>
          <div>
            <Label htmlFor="cs-sala" className="text-xs">
              Sala
            </Label>
            <Input
              id="cs-sala"
              value={salaUuid}
              onChange={(e) => setSalaUuid(e.target.value)}
              className="w-72"
            />
          </div>
        </div>
        <ExportButton view="mv_cirurgias_sala" body={{ filtros }} />
      </CardHeader>
      <CardContent>
        <IndicadorTable
          columns={columns}
          rows={rows}
          isLoading={query.isLoading}
        />
      </CardContent>
    </Card>
  );
}
