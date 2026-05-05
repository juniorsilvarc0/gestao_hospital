/**
 * IndicadoresFinanceirosPage — 3 tabs:
 *   - Faturamento → /v1/indicadores/financeiros/faturamento
 *   - Glosas      → /v1/indicadores/financeiros/glosas (com filtro status)
 *   - Repasse     → /v1/indicadores/financeiros/repasse
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
  Select,
} from '@/components/ui';
import {
  getIndicadorFaturamento,
  getIndicadorGlosas,
  getIndicadorRepasse,
} from '@/lib/bi-api';
import {
  extractRows,
  ExportButton,
  formatDate,
  formatMoney,
  formatNumber,
  formatPct,
  Tabs,
} from './bi-helpers';
import { IndicadorTable, type IndicadorColumn } from './IndicadorTable';

type TabKey = 'faturamento' | 'glosas' | 'repasse';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'faturamento', label: 'Faturamento' },
  { key: 'glosas', label: 'Glosas' },
  { key: 'repasse', label: 'Repasse' },
];

function defaultCompetenciaRangeStart(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 5);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function defaultCompetenciaRangeEnd(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function IndicadoresFinanceirosPage(): JSX.Element {
  const [tab, setTab] = useState<TabKey>('faturamento');
  return (
    <section className="space-y-4" aria-label="Indicadores financeiros">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <TrendingUp aria-hidden="true" className="h-6 w-6" />
          Indicadores financeiros
        </h1>
        <p className="text-sm text-muted-foreground">
          Faturamento por convênio · ciclo de glosas · repasse médico.
        </p>
      </header>

      <Tabs
        tabs={TABS}
        active={tab}
        onChange={setTab}
        ariaLabel="Indicadores financeiros"
      />

      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'faturamento' ? <FaturamentoTab /> : null}
        {tab === 'glosas' ? <GlosasTab /> : null}
        {tab === 'repasse' ? <RepasseTab /> : null}
      </div>
    </section>
  );
}

IndicadoresFinanceirosPage.displayName = 'IndicadoresFinanceirosPage';

/* ============================== Tabs ============================== */

function FaturamentoTab(): JSX.Element {
  const [competenciaInicio, setCompetenciaInicio] = useState<string>(
    defaultCompetenciaRangeStart,
  );
  const [competenciaFim, setCompetenciaFim] = useState<string>(
    defaultCompetenciaRangeEnd,
  );
  const [convenioUuid, setConvenioUuid] = useState<string>('');

  const filtros = {
    competenciaInicio,
    competenciaFim,
    ...(convenioUuid ? { convenioUuid } : {}),
  };

  const query = useQuery({
    queryKey: ['bi', 'indicador-faturamento', competenciaInicio, competenciaFim, convenioUuid],
    queryFn: () => getIndicadorFaturamento(filtros),
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
      key: 'conv',
      label: 'Convênio',
      render: (r) => String(r['convenioNome'] ?? r['convenioUuid'] ?? '—'),
    },
    {
      key: 'qtd',
      label: 'Contas',
      render: (r) => formatNumber(r['qtdContas']),
      className: 'tabular-nums',
    },
    {
      key: 'bruto',
      label: 'Bruto',
      render: (r) => formatMoney(r['valorBruto']),
      className: 'tabular-nums',
    },
    {
      key: 'glosa',
      label: 'Glosa',
      render: (r) => formatMoney(r['valorGlosa']),
      className: 'tabular-nums text-orange-700',
    },
    {
      key: 'liquido',
      label: 'Líquido',
      render: (r) => formatMoney(r['valorLiquido']),
      className: 'tabular-nums text-emerald-700',
    },
    {
      key: 'pct',
      label: 'Glosa %',
      render: (r) => formatPct(r['pctGlosa']),
      className: 'tabular-nums',
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="fat-ci" className="text-xs">
              De
            </Label>
            <Input
              id="fat-ci"
              type="month"
              value={competenciaInicio}
              onChange={(e) => setCompetenciaInicio(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="fat-cf" className="text-xs">
              Até
            </Label>
            <Input
              id="fat-cf"
              type="month"
              value={competenciaFim}
              onChange={(e) => setCompetenciaFim(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="fat-conv" className="text-xs">
              Convênio (UUID)
            </Label>
            <Input
              id="fat-conv"
              value={convenioUuid}
              onChange={(e) => setConvenioUuid(e.target.value)}
              className="w-72"
            />
          </div>
        </div>
        <ExportButton
          view="mv_faturamento_competencia"
          body={{ filtros }}
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

function GlosasTab(): JSX.Element {
  const [competenciaInicio, setCompetenciaInicio] = useState<string>(
    defaultCompetenciaRangeStart,
  );
  const [competenciaFim, setCompetenciaFim] = useState<string>(
    defaultCompetenciaRangeEnd,
  );
  const [convenioUuid, setConvenioUuid] = useState<string>('');
  const [status, setStatus] = useState<string>('');

  const filtros = {
    competenciaInicio,
    competenciaFim,
    ...(convenioUuid ? { convenioUuid } : {}),
    ...(status ? { status } : {}),
  };

  const query = useQuery({
    queryKey: ['bi', 'indicador-glosas', competenciaInicio, competenciaFim, convenioUuid, status],
    queryFn: () => getIndicadorGlosas(filtros),
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
      key: 'conv',
      label: 'Convênio',
      render: (r) => String(r['convenioNome'] ?? r['convenioUuid'] ?? '—'),
    },
    {
      key: 'st',
      label: 'Status',
      render: (r) => String(r['status'] ?? '—'),
    },
    {
      key: 'qtd',
      label: 'Qtd',
      render: (r) => formatNumber(r['qtd']),
      className: 'tabular-nums',
    },
    {
      key: 'glos',
      label: 'Valor glosado',
      render: (r) => formatMoney(r['valorGlosado'] ?? r['valor']),
      className: 'tabular-nums text-orange-700',
    },
    {
      key: 'rev',
      label: 'Revertido',
      render: (r) => formatMoney(r['valorRevertido']),
      className: 'tabular-nums text-emerald-700',
    },
    {
      key: 'rev-pct',
      label: 'Reversão %',
      render: (r) => formatPct(r['pctReversao']),
      className: 'tabular-nums',
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="glo-ci" className="text-xs">
              De
            </Label>
            <Input
              id="glo-ci"
              type="month"
              value={competenciaInicio}
              onChange={(e) => setCompetenciaInicio(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="glo-cf" className="text-xs">
              Até
            </Label>
            <Input
              id="glo-cf"
              type="month"
              value={competenciaFim}
              onChange={(e) => setCompetenciaFim(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="glo-st" className="text-xs">
              Status
            </Label>
            <Select
              id="glo-st"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-40"
            >
              <option key="__empty__" value="">Todos</option>
              <option value="RECEBIDA">Recebida</option>
              <option value="EM_RECURSO">Em recurso</option>
              <option value="REVERTIDA">Revertida</option>
              <option value="ACATADA">Acatada</option>
              <option value="PERDA_DEFINITIVA">Perda definitiva</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="glo-conv" className="text-xs">
              Convênio
            </Label>
            <Input
              id="glo-conv"
              value={convenioUuid}
              onChange={(e) => setConvenioUuid(e.target.value)}
              className="w-72"
            />
          </div>
        </div>
        <ExportButton view="mv_glosa_status" body={{ filtros }} />
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

function RepasseTab(): JSX.Element {
  const [competenciaInicio, setCompetenciaInicio] = useState<string>(
    defaultCompetenciaRangeStart,
  );
  const [competenciaFim, setCompetenciaFim] = useState<string>(
    defaultCompetenciaRangeEnd,
  );
  const [prestadorUuid, setPrestadorUuid] = useState<string>('');

  const filtros = {
    competenciaInicio,
    competenciaFim,
    ...(prestadorUuid ? { prestadorUuid } : {}),
  };

  const query = useQuery({
    queryKey: ['bi', 'indicador-repasse', competenciaInicio, competenciaFim, prestadorUuid],
    queryFn: () => getIndicadorRepasse(filtros),
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
      key: 'prest',
      label: 'Prestador',
      render: (r) => String(r['prestadorNome'] ?? r['prestadorUuid'] ?? '—'),
    },
    {
      key: 'st',
      label: 'Status',
      render: (r) => String(r['status'] ?? '—'),
    },
    {
      key: 'bruto',
      label: 'Bruto',
      render: (r) => formatMoney(r['valorBruto']),
      className: 'tabular-nums',
    },
    {
      key: 'liq',
      label: 'Líquido',
      render: (r) => formatMoney(r['valorLiquido']),
      className: 'tabular-nums text-emerald-700',
    },
    {
      key: 'pct',
      label: 'Líq./Bruto',
      render: (r) => formatPct(r['pctLiquidoBruto']),
      className: 'tabular-nums',
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="rep-ci" className="text-xs">
              De
            </Label>
            <Input
              id="rep-ci"
              type="month"
              value={competenciaInicio}
              onChange={(e) => setCompetenciaInicio(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="rep-cf" className="text-xs">
              Até
            </Label>
            <Input
              id="rep-cf"
              type="month"
              value={competenciaFim}
              onChange={(e) => setCompetenciaFim(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="rep-prest" className="text-xs">
              Prestador
            </Label>
            <Input
              id="rep-prest"
              value={prestadorUuid}
              onChange={(e) => setPrestadorUuid(e.target.value)}
              className="w-72"
            />
          </div>
        </div>
        <ExportButton
          view="mv_repasse_competencia"
          body={{ filtros }}
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
