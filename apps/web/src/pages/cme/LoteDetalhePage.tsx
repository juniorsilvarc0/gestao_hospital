/**
 * LoteDetalhePage — detalhe de um lote do CME (Fase 10).
 *
 * Tabs:
 *   - Resumo: cards (método, datas, indicadores, responsável, status, qtd).
 *   - Artigos: tabela dos artigos vinculados (com link para detalhe).
 *   - Histórico: timeline simples de eventos do lote.
 *
 * Botões contextuais (RN-CME-01 / RN-CME-03):
 *   - Liberar (Dialog com indicadores + URL biológico) — habilitado em
 *     EM_PROCESSAMENTO ou AGUARDANDO_INDICADOR.
 *   - Reprovar (Dialog com motivo) — mesma janela; cascade descarta artigos.
 *   - Marcar Expirado — habilitado em LIBERADO com validade vencida.
 *   - Adicionar Artigo (Dialog) — habilitado em EM_PROCESSAMENTO.
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  FlaskConical,
  Loader2,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Timer,
  XCircle,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  addArtigoLote,
  getLote,
  liberarLote,
  listArtigos,
  marcarExpirado,
  reprovarLote,
} from '@/lib/cme-api';
import { useToast } from '@/components/Toast';
import {
  ETAPA_CME_BADGE,
  ETAPA_CME_LABEL,
  LOTE_STATUS_BADGE,
  LOTE_STATUS_LABEL,
  METODO_ESTERILIZACAO_LABEL,
  type AddArtigoLoteInput,
  type LiberarLoteInput,
  type LoteCme,
  type ReprovarLoteInput,
} from '@/types/cme';
import { cn } from '@/lib/utils';

type TabKey = 'resumo' | 'artigos' | 'historico';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'artigos', label: 'Artigos' },
  { key: 'historico', label: 'Histórico' },
];

function formatBR(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

function isVencido(validade: string): boolean {
  const v = new Date(validade);
  if (Number.isNaN(v.getTime())) return false;
  return v.getTime() < new Date().getTime();
}

function toastErr(
  err: unknown,
  fallback: string,
  showToast: ReturnType<typeof useToast>['show'],
): void {
  const detail =
    err instanceof ApiError
      ? err.detail ?? err.title ?? err.message
      : err instanceof Error
        ? err.message
        : 'Erro.';
  showToast({ variant: 'destructive', title: fallback, description: detail });
}

export function LoteDetalhePage(): JSX.Element {
  const { uuid = '' } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [tab, setTab] = useState<TabKey>('resumo');
  const [liberarOpen, setLiberarOpen] = useState(false);
  const [reprovarOpen, setReprovarOpen] = useState(false);
  const [novoArtigoOpen, setNovoArtigoOpen] = useState(false);

  const loteQuery = useQuery({
    queryKey: ['cme', 'lote', uuid],
    queryFn: () => getLote(uuid),
    enabled: Boolean(uuid),
  });

  const artigosQuery = useQuery({
    queryKey: ['cme', 'lote', uuid, 'artigos'],
    queryFn: () => listArtigos({ loteUuid: uuid, pageSize: 100 }),
    enabled: Boolean(uuid) && tab === 'artigos',
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['cme', 'lote', uuid] });
    void queryClient.invalidateQueries({ queryKey: ['cme', 'lotes', 'list'] });
  }

  const liberarM = useMutation({
    mutationFn: (input: LiberarLoteInput) => liberarLote(uuid, input),
    onSuccess: () => {
      showToast({ variant: 'success', title: 'Lote liberado', description: '' });
      setLiberarOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao liberar lote', showToast),
  });

  const reprovarM = useMutation({
    mutationFn: (input: ReprovarLoteInput) => reprovarLote(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Lote reprovado',
        description: 'Artigos foram descartados (RN-CME-03).',
      });
      setReprovarOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao reprovar lote', showToast),
  });

  const expirarM = useMutation({
    mutationFn: () => marcarExpirado(uuid),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Lote marcado como expirado',
        description: '',
      });
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao marcar como expirado', showToast),
  });

  const novoArtigoM = useMutation({
    mutationFn: (input: AddArtigoLoteInput) => addArtigoLote(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Artigo adicionado',
        description: '',
      });
      setNovoArtigoOpen(false);
      invalidate();
      void queryClient.invalidateQueries({
        queryKey: ['cme', 'lote', uuid, 'artigos'],
      });
    },
    onError: (e) => toastErr(e, 'Falha ao adicionar artigo', showToast),
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
  const podeLiberar =
    lote.status === 'EM_PROCESSAMENTO' || lote.status === 'AGUARDANDO_INDICADOR';
  const podeReprovar = podeLiberar;
  const podeExpirar = lote.status === 'LIBERADO' && isVencido(lote.validade);
  const podeAdicionarArtigo = lote.status === 'EM_PROCESSAMENTO';

  return (
    <section
      className="space-y-4"
      aria-label={`Detalhe do lote ${lote.numero}`}
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
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FlaskConical aria-hidden="true" className="h-6 w-6" />
            Lote {lote.numero}
          </h1>
          <p className="text-sm text-muted-foreground">
            {METODO_ESTERILIZACAO_LABEL[lote.metodo]} ·{' '}
            {lote.responsavelNome ?? lote.responsavelUuid}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium',
            LOTE_STATUS_BADGE[lote.status],
          )}
        >
          {LOTE_STATUS_LABEL[lote.status]}
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!podeLiberar}
          onClick={() => setLiberarOpen(true)}
        >
          <ShieldCheck aria-hidden="true" />
          Liberar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!podeReprovar}
          onClick={() => setReprovarOpen(true)}
        >
          <ShieldAlert aria-hidden="true" />
          Reprovar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!podeExpirar || expirarM.isPending}
          onClick={() => expirarM.mutate()}
        >
          <Timer aria-hidden="true" />
          Marcar expirado
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!podeAdicionarArtigo}
          onClick={() => setNovoArtigoOpen(true)}
        >
          <Plus aria-hidden="true" />
          Adicionar artigo
        </Button>
      </div>

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
        {tab === 'resumo' ? <ResumoTab lote={lote} /> : null}
        {tab === 'artigos' ? (
          <ArtigosTab
            uuid={uuid}
            isLoading={artigosQuery.isLoading}
            artigos={artigosQuery.data?.data ?? []}
            onOpen={(artUuid) => navigate(`/cme/artigos/${artUuid}`)}
          />
        ) : null}
        {tab === 'historico' ? <HistoricoTab lote={lote} /> : null}
      </div>

      <Dialog open={liberarOpen} onOpenChange={setLiberarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liberar lote (RN-CME-01)</DialogTitle>
          </DialogHeader>
          <LiberarForm
            pending={liberarM.isPending}
            onSubmit={(input) => liberarM.mutate(input)}
            onCancel={() => setLiberarOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={reprovarOpen} onOpenChange={setReprovarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprovar lote (RN-CME-03)</DialogTitle>
          </DialogHeader>
          <ReprovarForm
            pending={reprovarM.isPending}
            onSubmit={(motivo) => reprovarM.mutate({ motivo })}
            onCancel={() => setReprovarOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={novoArtigoOpen} onOpenChange={setNovoArtigoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar artigo ao lote</DialogTitle>
          </DialogHeader>
          <NovoArtigoForm
            pending={novoArtigoM.isPending}
            onSubmit={(input) => novoArtigoM.mutate(input)}
            onCancel={() => setNovoArtigoOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

LoteDetalhePage.displayName = 'LoteDetalhePage';

/* ============================== Tabs ============================== */

function ResumoTab({ lote }: { lote: LoteCme }): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Método
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <p className="text-sm font-semibold">
            {METODO_ESTERILIZACAO_LABEL[lote.metodo]}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Esterilização
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <p className="text-sm">{formatDateTime(lote.dataEsterilizacao)}</p>
        </CardContent>
      </Card>

      <Card className={cn(isVencido(lote.validade) && 'border-red-300')}>
        <CardHeader className="pb-1">
          <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Validade
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <p
            className={cn(
              'text-sm',
              isVencido(lote.validade) && 'font-semibold text-red-700',
            )}
          >
            {formatBR(lote.validade)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Indicador químico
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <IndicadorPill ok={lote.indicadorQuimicoOk} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Indicador biológico
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1 space-y-1">
          <IndicadorPill ok={lote.indicadorBiologicoOk} />
          {lote.indicadorBiologicoUrl ? (
            <a
              href={lote.indicadorBiologicoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              Ver evidência
            </a>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Artigos
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <p className="text-sm font-semibold tabular-nums">{lote.qtdArtigos}</p>
        </CardContent>
      </Card>

      {lote.motivoReprovacao ? (
        <Card className="sm:col-span-2 lg:col-span-3 border-red-300">
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] uppercase tracking-wide text-red-700">
              Motivo da reprovação
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <p className="text-sm">{lote.motivoReprovacao}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function IndicadorPill({ ok }: { ok: boolean | null }): JSX.Element {
  if (ok === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px]">
        <Clock aria-hidden="true" className="h-3 w-3" />
        Pendente
      </span>
    );
  }
  if (ok) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-900">
        <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
        OK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[11px] text-red-900">
      <XCircle aria-hidden="true" className="h-3 w-3" />
      Falhou
    </span>
  );
}

interface ArtigosTabProps {
  uuid: string;
  isLoading: boolean;
  artigos: import('@/types/cme').ArtigoCme[];
  onOpen: (uuid: string) => void;
}

function ArtigosTab({
  isLoading,
  artigos,
  onOpen,
}: ArtigosTabProps): JSX.Element {
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        Carregando artigos...
      </p>
    );
  }
  if (artigos.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Sem artigos neste lote.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table data-testid="lote-artigos-tabela">
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Etapa</TableHead>
            <TableHead>Última mov.</TableHead>
            <TableHead>Paciente</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {artigos.map((a) => (
            <TableRow key={a.uuid}>
              <TableCell className="text-xs font-mono">{a.codigoArtigo}</TableCell>
              <TableCell className="max-w-[260px] truncate text-xs">
                {a.descricao ?? '—'}
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                    ETAPA_CME_BADGE[a.etapaAtual],
                  )}
                >
                  {ETAPA_CME_LABEL[a.etapaAtual]}
                </span>
              </TableCell>
              <TableCell className="text-xs">
                {formatDateTime(a.ultimaMovimentacao)}
              </TableCell>
              <TableCell className="text-xs">
                {a.pacienteNome ?? a.pacienteUuid ?? '—'}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onOpen(a.uuid)}
                  aria-label={`Ver artigo ${a.codigoArtigo}`}
                >
                  <Eye aria-hidden="true" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function HistoricoTab({ lote }: { lote: LoteCme }): JSX.Element {
  // O backend pode evoluir para expor `historico` explícito; por hoje montamos
  // a partir de createdAt/updatedAt + estado atual.
  const eventos: Array<{ label: string; data: string; descricao?: string }> = [];
  eventos.push({
    label: 'Lote criado',
    data: lote.createdAt,
    descricao: `Método ${METODO_ESTERILIZACAO_LABEL[lote.metodo]}`,
  });
  if (lote.updatedAt && lote.updatedAt !== lote.createdAt) {
    eventos.push({
      label: 'Última atualização',
      data: lote.updatedAt,
      descricao: `Status ${LOTE_STATUS_LABEL[lote.status]}`,
    });
  }
  if (eventos.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Sem eventos registrados.
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {eventos.map((ev, idx) => (
        <li
          key={idx}
          className="flex items-start gap-3 rounded-md border bg-background p-3 text-xs"
        >
          <Clock aria-hidden="true" className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="font-medium">{ev.label}</p>
            <p className="text-[11px] text-muted-foreground">
              {formatDateTime(ev.data)}
            </p>
            {ev.descricao ? (
              <p className="mt-1 whitespace-pre-line">{ev.descricao}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ============================== Forms ============================== */

interface LiberarFormProps {
  pending: boolean;
  onSubmit: (input: LiberarLoteInput) => void;
  onCancel: () => void;
}

function LiberarForm({
  pending,
  onSubmit,
  onCancel,
}: LiberarFormProps): JSX.Element {
  const [quimicoOk, setQuimicoOk] = useState(true);
  const [biologicoOk, setBiologicoOk] = useState(true);
  const [indicadorBiologicoUrl, setIndicadorBiologicoUrl] = useState('');
  const [observacao, setObservacao] = useState('');

  // RN-CME-01: indicador biológico OK é obrigatório.
  const valid = biologicoOk;

  function handleSubmit(): void {
    if (!valid) return;
    onSubmit({
      indicadorQuimicoOk: quimicoOk,
      indicadorBiologicoOk: biologicoOk,
      ...(indicadorBiologicoUrl ? { indicadorBiologicoUrl } : {}),
      ...(observacao ? { observacao } : {}),
    });
  }

  return (
    <>
      <div className="space-y-3 text-sm">
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          RN-CME-01: liberação exige indicador biológico confirmado.
        </p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={quimicoOk}
            onChange={(e) => setQuimicoOk(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Indicador químico OK
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={biologicoOk}
            onChange={(e) => setBiologicoOk(e.target.checked)}
            className="h-4 w-4 rounded border-input"
            data-testid="lote-libera-bio"
          />
          Indicador biológico OK *
        </label>
        <div className="space-y-1">
          <Label htmlFor="lib-url">URL evidência biológico</Label>
          <Input
            id="lib-url"
            value={indicadorBiologicoUrl}
            onChange={(e) => setIndicadorBiologicoUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lib-obs">Observação</Label>
          <Textarea
            id="lib-obs"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={3}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Voltar
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!valid || pending}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck aria-hidden="true" />
          )}
          Liberar
        </Button>
      </DialogFooter>
    </>
  );
}

interface ReprovarFormProps {
  pending: boolean;
  onSubmit: (motivo: string) => void;
  onCancel: () => void;
}

function ReprovarForm({
  pending,
  onSubmit,
  onCancel,
}: ReprovarFormProps): JSX.Element {
  const [motivo, setMotivo] = useState('');
  const valid = motivo.trim().length >= 10;
  return (
    <>
      <div className="space-y-1 text-sm">
        <p className="rounded-md bg-red-50 p-2 text-xs text-red-900">
          RN-CME-03: lote reprovado descarta todos os artigos automaticamente.
        </p>
        <Label htmlFor="rep-motivo">Motivo (mín. 10 chars) *</Label>
        <Textarea
          id="rep-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={4}
          minLength={10}
          required
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Voltar
        </Button>
        <Button
          type="button"
          onClick={() => onSubmit(motivo.trim())}
          disabled={!valid || pending}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldAlert aria-hidden="true" />
          )}
          Reprovar lote
        </Button>
      </DialogFooter>
    </>
  );
}

interface NovoArtigoFormProps {
  pending: boolean;
  onSubmit: (input: AddArtigoLoteInput) => void;
  onCancel: () => void;
}

function NovoArtigoForm({
  pending,
  onSubmit,
  onCancel,
}: NovoArtigoFormProps): JSX.Element {
  const [codigoArtigo, setCodigoArtigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const valid = codigoArtigo.trim().length >= 1;
  return (
    <>
      <div className="space-y-3 text-sm">
        <div className="space-y-1">
          <Label htmlFor="art-cod">Código do artigo *</Label>
          <Input
            id="art-cod"
            value={codigoArtigo}
            onChange={(e) => setCodigoArtigo(e.target.value)}
            placeholder="Ex.: K-001"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="art-desc">Descrição</Label>
          <Input
            id="art-desc"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: Kit colecistectomia"
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Voltar
        </Button>
        <Button
          type="button"
          onClick={() =>
            onSubmit({
              codigoArtigo: codigoArtigo.trim(),
              ...(descricao ? { descricao: descricao.trim() } : {}),
            })
          }
          disabled={!valid || pending}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          Adicionar
        </Button>
      </DialogFooter>
    </>
  );
}
