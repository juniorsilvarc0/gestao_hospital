/**
 * LoteTissDetalhePage — detalhe completo de um lote TISS.
 *
 * Header: número · convênio · competência · status · hash XML · lote anterior.
 * Tabs:
 *   - Guias:     tabela das guias do lote.
 *   - XML:       preview + botão Download (data-URI).
 *   - Histórico: timeline dos eventos (geração, validação, envio, …).
 *   - Erros XSD: lista (apenas se status=COM_ERRO).
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileCode2,
  History,
  ListChecks,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { getLote } from '@/lib/tiss-api';
import {
  TISS_GUIA_STATUS_BADGE,
  TISS_GUIA_STATUS_LABEL,
  TISS_LOTE_STATUS_BADGE,
  TISS_LOTE_STATUS_LABEL,
  TISS_TIPO_GUIA_LABEL,
  type TissLoteDetalhe,
} from '@/types/tiss';
import { cn } from '@/lib/utils';

type TabKey = 'guias' | 'xml' | 'historico' | 'erros';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

function formatMoney(raw: string | null): string {
  if (!raw) return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function LoteTissDetalhePage(): JSX.Element {
  const { uuid = '' } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('guias');

  const loteQuery = useQuery({
    queryKey: ['tiss', 'lote', uuid],
    queryFn: () => getLote(uuid),
    enabled: Boolean(uuid),
  });

  if (loteQuery.isLoading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (loteQuery.isError || !loteQuery.data) {
    const msg =
      loteQuery.error instanceof ApiError
        ? loteQuery.error.detail ?? loteQuery.error.message
        : 'Falha ao carregar lote.';
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

  const lote = loteQuery.data;

  const TABS: { key: TabKey; label: string; icon: typeof ListChecks }[] = [
    { key: 'guias', label: 'Guias', icon: ListChecks },
    { key: 'xml', label: 'XML', icon: FileCode2 },
    { key: 'historico', label: 'Histórico', icon: History },
    ...(lote.status === 'COM_ERRO'
      ? [{ key: 'erros' as TabKey, label: 'Erros XSD', icon: AlertTriangle }]
      : []),
  ];

  return (
    <section
      className="space-y-4"
      aria-label={`Detalhe do lote TISS ${lote.numero}`}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            <ArrowLeft aria-hidden="true" className="h-3 w-3" />
            Voltar
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">
            Lote {lote.numero}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lote.convenioNome ?? lote.convenioUuid} · Competência{' '}
            {lote.competencia} · Versão TISS {lote.versaoTiss}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium',
            TISS_LOTE_STATUS_BADGE[lote.status],
          )}
        >
          {TISS_LOTE_STATUS_LABEL[lote.status]}
        </span>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Identificação</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <Item label="Hash XML" value={lote.hashXml ?? '—'} mono />
            <Item
              label="Lote anterior"
              value={
                lote.loteAnteriorNumero
                  ? `${lote.loteAnteriorNumero} (${lote.loteAnteriorUuid?.slice(0, 8)}…)`
                  : '—'
              }
            />
            <Item
              label="Protocolo operadora"
              value={lote.protocoloOperadora ?? '—'}
            />
            <Item
              label="Data envio"
              value={formatDateTime(lote.dataEnvio)}
            />
            <Item
              label="Data processamento"
              value={formatDateTime(lote.dataProcessamento)}
            />
            <Item
              label="Total"
              value={`${lote.qtdGuias} guia(s) · ${formatMoney(lote.valorTotal)}`}
            />
          </dl>
        </CardContent>
      </Card>

      <nav
        role="tablist"
        aria-label="Seções do lote"
        className="flex flex-wrap gap-1 border-b"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            id={`tab-${t.key}`}
            onClick={() => setTab(t.key)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm transition-colors',
              tab === t.key
                ? 'border-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'guias' ? <GuiasTab lote={lote} /> : null}
        {tab === 'xml' ? <XmlTab lote={lote} /> : null}
        {tab === 'historico' ? <HistoricoTab lote={lote} /> : null}
        {tab === 'erros' ? <ErrosTab lote={lote} /> : null}
      </div>
    </section>
  );
}

function Item({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          'break-all font-medium',
          mono ? 'font-mono text-[10px]' : '',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function GuiasTab({ lote }: { lote: TissLoteDetalhe }): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Guias do lote</CardTitle>
      </CardHeader>
      <CardContent>
        {lote.guias.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Nenhuma guia neste lote.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Nº prestador</TableHead>
                <TableHead>Nº operadora</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>XSD</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lote.guias.map((g) => (
                <TableRow key={g.uuid}>
                  <TableCell className="text-xs">
                    {TISS_TIPO_GUIA_LABEL[g.tipoGuia]}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {g.numeroGuiaPrestador}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {g.numeroGuiaOperadora ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {g.contaNumero ?? g.contaUuid.slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {g.pacienteNome ?? '—'}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        TISS_GUIA_STATUS_BADGE[g.status],
                      )}
                    >
                      {TISS_GUIA_STATUS_LABEL[g.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {g.validacaoXsdOk ? 'OK' : 'Erro'}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatMoney(g.valorTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function XmlTab({ lote }: { lote: TissLoteDetalhe }): JSX.Element {
  const xml = lote.xmlPreview ?? '';
  const dataUrl =
    'data:application/xml;charset=utf-8,' + encodeURIComponent(xml);
  const fileName = `lote-tiss-${lote.numero}.xml`;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">XML do lote</CardTitle>
        <a
          href={dataUrl}
          download={fileName}
          aria-label="Baixar XML do lote"
        >
          <Button type="button" size="sm" variant="outline" disabled={!xml}>
            <Download aria-hidden="true" />
            Download
          </Button>
        </a>
      </CardHeader>
      <CardContent>
        {xml ? (
          <pre className="max-h-96 overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] leading-relaxed">
            {xml}
          </pre>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            XML não disponível (lote ainda em preparação).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function HistoricoTab({ lote }: { lote: TissLoteDetalhe }): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Histórico</CardTitle>
      </CardHeader>
      <CardContent>
        {lote.historico.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Sem eventos registrados.
          </p>
        ) : (
          <ol className="space-y-3 border-l-2 border-muted pl-4">
            {lote.historico.map((h, idx) => (
              <li key={`${h.evento}-${idx}`} className="relative">
                <span className="absolute -left-[19px] top-1 h-3 w-3 rounded-full border-2 border-foreground bg-background" />
                <p className="text-xs font-medium">{h.evento}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDateTime(h.timestamp)}
                  {h.userName ? ` · ${h.userName}` : ''}
                </p>
                {h.descricao ? (
                  <p className="mt-1 text-xs">{h.descricao}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function ErrosTab({ lote }: { lote: TissLoteDetalhe }): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-destructive">Erros XSD</CardTitle>
      </CardHeader>
      <CardContent>
        {lote.errosXsd.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Sem erros listados.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campo</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Caminho</TableHead>
                <TableHead>Guia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lote.errosXsd.map((e, idx) => (
                <TableRow key={`${e.campo}-${idx}`}>
                  <TableCell className="text-xs font-mono">{e.campo}</TableCell>
                  <TableCell className="text-xs">{e.mensagem}</TableCell>
                  <TableCell className="text-xs font-mono">
                    {e.caminho ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {e.guiaUuid ? e.guiaUuid.slice(0, 8) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

LoteTissDetalhePage.displayName = 'LoteTissDetalhePage';
