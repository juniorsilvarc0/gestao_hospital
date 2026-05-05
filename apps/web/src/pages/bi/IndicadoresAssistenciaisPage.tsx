/**
 * IndicadoresAssistenciaisPage — 4 tabs:
 *   - Ocupação    → /v1/indicadores/assistenciais/taxa-ocupacao
 *   - Permanência → /v1/indicadores/assistenciais/permanencia
 *   - Mortalidade → /v1/indicadores/assistenciais/mortalidade
 *   - IRAS        → /v1/indicadores/assistenciais/iras
 *
 * Cada tab tem filtros próprios + tabela + botão "Exportar CSV" para
 * `/v1/bi/export?view=mv_xxx`.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HeartPulse } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
} from '@/components/ui';
import {
  getIndicadorTaxaOcupacao,
  getIndicadorPermanencia,
  getIndicadorMortalidade,
  getIndicadorIras,
  type CompetenciaRangeParams,
  type TaxaOcupacaoParams,
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

type TabKey = 'ocupacao' | 'permanencia' | 'mortalidade' | 'iras';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'ocupacao', label: 'Ocupação' },
  { key: 'permanencia', label: 'Permanência' },
  { key: 'mortalidade', label: 'Mortalidade' },
  { key: 'iras', label: 'IRAS' },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

export function IndicadoresAssistenciaisPage(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('ocupacao');

  return (
    <section className="space-y-4" aria-label="Indicadores assistenciais">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <HeartPulse aria-hidden="true" className="h-6 w-6" />
          Indicadores assistenciais
        </h1>
        <p className="text-sm text-muted-foreground">
          Ocupação · permanência · mortalidade · IRAS — uma fonte de verdade.
        </p>
      </header>

      <Tabs
        tabs={TABS}
        active={tab}
        onChange={setTab}
        ariaLabel="Indicadores assistenciais"
      />

      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'ocupacao' ? <OcupacaoTab /> : null}
        {tab === 'permanencia' ? <PermanenciaTab /> : null}
        {tab === 'mortalidade' ? <MortalidadeTab /> : null}
        {tab === 'iras' ? <IrasTab /> : null}
      </div>
    </section>
  );
}

IndicadoresAssistenciaisPage.displayName = 'IndicadoresAssistenciaisPage';

/* ============================== Tabs ============================== */

function OcupacaoTab(): JSX.Element {
  const [dia, setDia] = useState<string>(todayIso());
  const [setorUuid, setSetorUuid] = useState<string>('');

  const filtros: TaxaOcupacaoParams = {
    dia,
    ...(setorUuid ? { setorUuid } : {}),
  };

  const query = useQuery({
    queryKey: ['bi', 'indicador-ocupacao', dia, setorUuid],
    queryFn: () => getIndicadorTaxaOcupacao(filtros),
    staleTime: 60_000,
  });

  const rows = extractRows<Record<string, unknown>>(query.data);

  const columns: IndicadorColumn<Record<string, unknown>>[] = [
    {
      key: 'setor',
      label: 'Setor',
      render: (r) => String(r['setorNome'] ?? r['setorUuid'] ?? '—'),
    },
    {
      key: 'ocup',
      label: 'Ocupados',
      render: (r) => formatNumber(r['leitosOcupados']),
      className: 'tabular-nums',
    },
    {
      key: 'disp',
      label: 'Disponíveis',
      render: (r) => formatNumber(r['leitosDisponiveis']),
      className: 'tabular-nums',
    },
    {
      key: 'tot',
      label: 'Total',
      render: (r) => formatNumber(r['totalLeitos']),
      className: 'tabular-nums',
    },
    {
      key: 'taxa',
      label: 'Taxa %',
      render: (r) => formatPct(r['taxaOcupacaoPct']),
      className: 'tabular-nums',
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="ocup-dia" className="text-xs">
              Dia
            </Label>
            <Input
              id="ocup-dia"
              type="date"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className="w-44"
            />
          </div>
          <div>
            <Label htmlFor="ocup-setor" className="text-xs">
              Setor (UUID, opcional)
            </Label>
            <Input
              id="ocup-setor"
              value={setorUuid}
              onChange={(e) => setSetorUuid(e.target.value)}
              placeholder="ex.: 6e8f...-..."
              className="w-72"
            />
          </div>
        </div>
        <ExportButton
          view="mv_taxa_ocupacao_diaria"
          body={{ filtros: { dia, ...(setorUuid ? { setorUuid } : {}) } }}
        />
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

function PermanenciaTab(): JSX.Element {
  const [competenciaInicio, setCompetenciaInicio] = useState<string>(
    defaultCompetenciaRangeStart,
  );
  const [competenciaFim, setCompetenciaFim] = useState<string>(
    defaultCompetenciaRangeEnd,
  );
  const [setorUuid, setSetorUuid] = useState<string>('');

  const filtros: CompetenciaRangeParams = {
    competenciaInicio,
    competenciaFim,
    ...(setorUuid ? { setorUuid } : {}),
  };

  const query = useQuery({
    queryKey: ['bi', 'indicador-permanencia', competenciaInicio, competenciaFim, setorUuid],
    queryFn: () => getIndicadorPermanencia(filtros),
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
      key: 'setor',
      label: 'Setor',
      render: (r) => String(r['setorNome'] ?? r['setorUuid'] ?? '—'),
    },
    {
      key: 'qtd',
      label: 'Internações',
      render: (r) => formatNumber(r['qtdInternacoes']),
      className: 'tabular-nums',
    },
    {
      key: 'media',
      label: 'Média (dias)',
      render: (r) => formatNumber(r['permanenciaMediaDias']),
      className: 'tabular-nums',
    },
    {
      key: 'mediana',
      label: 'Mediana (dias)',
      render: (r) => formatNumber(r['permanenciaMedianaDias']),
      className: 'tabular-nums',
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="perm-ci" className="text-xs">
              De (YYYY-MM)
            </Label>
            <Input
              id="perm-ci"
              type="month"
              value={competenciaInicio}
              onChange={(e) => setCompetenciaInicio(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="perm-cf" className="text-xs">
              Até (YYYY-MM)
            </Label>
            <Input
              id="perm-cf"
              type="month"
              value={competenciaFim}
              onChange={(e) => setCompetenciaFim(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="perm-setor" className="text-xs">
              Setor
            </Label>
            <Input
              id="perm-setor"
              value={setorUuid}
              onChange={(e) => setSetorUuid(e.target.value)}
              className="w-72"
            />
          </div>
        </div>
        <ExportButton
          view="mv_permanencia_media"
          body={{ filtros: { ...filtros } }}
        />
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

function MortalidadeTab(): JSX.Element {
  const [competenciaInicio, setCompetenciaInicio] = useState<string>(
    defaultCompetenciaRangeStart,
  );
  const [competenciaFim, setCompetenciaFim] = useState<string>(
    defaultCompetenciaRangeEnd,
  );
  const [setorUuid, setSetorUuid] = useState<string>('');

  const filtros: CompetenciaRangeParams = {
    competenciaInicio,
    competenciaFim,
    ...(setorUuid ? { setorUuid } : {}),
  };

  const query = useQuery({
    queryKey: ['bi', 'indicador-mortalidade', competenciaInicio, competenciaFim, setorUuid],
    queryFn: () => getIndicadorMortalidade(filtros),
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
      key: 'setor',
      label: 'Setor',
      render: (r) => String(r['setorNome'] ?? r['setorUuid'] ?? '—'),
    },
    {
      key: 'altas',
      label: 'Altas',
      render: (r) => formatNumber(r['altasTotal']),
      className: 'tabular-nums',
    },
    {
      key: 'obitos',
      label: 'Óbitos',
      render: (r) => formatNumber(r['obitos']),
      className: 'tabular-nums text-red-700',
    },
    {
      key: 'taxa',
      label: 'Taxa %',
      render: (r) => formatPct(r['taxaMortalidadePct']),
      className: 'tabular-nums',
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="mort-ci" className="text-xs">
              De
            </Label>
            <Input
              id="mort-ci"
              type="month"
              value={competenciaInicio}
              onChange={(e) => setCompetenciaInicio(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="mort-cf" className="text-xs">
              Até
            </Label>
            <Input
              id="mort-cf"
              type="month"
              value={competenciaFim}
              onChange={(e) => setCompetenciaFim(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="mort-setor" className="text-xs">
              Setor
            </Label>
            <Input
              id="mort-setor"
              value={setorUuid}
              onChange={(e) => setSetorUuid(e.target.value)}
              className="w-72"
            />
          </div>
        </div>
        <ExportButton view="mv_mortalidade" body={{ filtros: { ...filtros } }} />
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

function IrasTab(): JSX.Element {
  const [competenciaInicio, setCompetenciaInicio] = useState<string>(
    defaultCompetenciaRangeStart,
  );
  const [competenciaFim, setCompetenciaFim] = useState<string>(
    defaultCompetenciaRangeEnd,
  );
  const [setorUuid, setSetorUuid] = useState<string>('');

  const filtros: CompetenciaRangeParams = {
    competenciaInicio,
    competenciaFim,
    ...(setorUuid ? { setorUuid } : {}),
  };

  const query = useQuery({
    queryKey: ['bi', 'indicador-iras', competenciaInicio, competenciaFim, setorUuid],
    queryFn: () => getIndicadorIras(filtros),
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
      key: 'setor',
      label: 'Setor',
      render: (r) => String(r['setorNome'] ?? r['setorUuid'] ?? '—'),
    },
    {
      key: 'casos',
      label: 'Casos IRAS',
      render: (r) => formatNumber(r['casosIras'] ?? r['casos']),
      className: 'tabular-nums',
    },
    {
      key: 'pacdias',
      label: 'Paciente-dias',
      render: (r) => formatNumber(r['diasPaciente'] ?? r['pacienteDias']),
      className: 'tabular-nums',
    },
    {
      key: 'taxa',
      label: 'Taxa /1000',
      render: (r) => formatNumber(r['taxaPor1000PacienteDias']),
      className: 'tabular-nums',
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="iras-ci" className="text-xs">
              De
            </Label>
            <Input
              id="iras-ci"
              type="month"
              value={competenciaInicio}
              onChange={(e) => setCompetenciaInicio(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="iras-cf" className="text-xs">
              Até
            </Label>
            <Input
              id="iras-cf"
              type="month"
              value={competenciaFim}
              onChange={(e) => setCompetenciaFim(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="iras-setor" className="text-xs">
              Setor
            </Label>
            <Input
              id="iras-setor"
              value={setorUuid}
              onChange={(e) => setSetorUuid(e.target.value)}
              className="w-72"
            />
          </div>
        </div>
        <ExportButton view="mv_iras" body={{ filtros: { ...filtros } }} />
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
