/**
 * RepasseDetalhePage — detalhe de um repasse com tabs (Itens / Critério /
 * Histórico / Reapuração) e botões contextuais por status.
 *
 * Fluxo de status:
 *   APURADO → CONFERIDO (Conferir)
 *   CONFERIDO → LIBERADO (Liberar)
 *   LIBERADO → PAGO     (Marcar Pago)
 *   * → CANCELADO       (Cancelar — exceto PAGO)
 *
 * Reapuração: dispara `POST /repasse/reapurar` para uma conta específica
 * (RN-REP-06 — quando glosa associada é revertida).
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BadgeCheck,
  Calculator,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Wallet,
  X,
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
  cancelarRepasse,
  conferirRepasse,
  getRepasse,
  liberarRepasse,
  marcarPagoRepasse,
  reapurarConta,
} from '@/lib/repasse-api';
import { useToast } from '@/components/Toast';
import {
  REPASSE_STATUS_BADGE,
  REPASSE_STATUS_LABEL,
  TIPO_BASE_CALCULO_LABEL,
  type CancelarRepasseInput,
  type ConferirInput,
  type LiberarInput,
  type MarcarPagoInput,
  type ReapurarContaInput,
  type Repasse,
  type RepasseHistoricoEvento,
  type RepasseItem,
} from '@/types/repasse';
import { cn } from '@/lib/utils';

type TabKey = 'itens' | 'criterio' | 'historico' | 'reapuracao';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'itens', label: 'Itens' },
  { key: 'criterio', label: 'Critério' },
  { key: 'historico', label: 'Histórico' },
  { key: 'reapuracao', label: 'Reapuração' },
];

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

function formatMoney(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
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

export function RepasseDetalhePage(): JSX.Element {
  const { uuid = '' } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [tab, setTab] = useState<TabKey>('itens');
  const [conferirOpen, setConferirOpen] = useState(false);
  const [liberarOpen, setLiberarOpen] = useState(false);
  const [pagoOpen, setPagoOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const repasseQuery = useQuery({
    queryKey: ['repasse', 'detail', uuid],
    queryFn: () => getRepasse(uuid),
    enabled: Boolean(uuid),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({
      queryKey: ['repasse', 'detail', uuid],
    });
    void queryClient.invalidateQueries({ queryKey: ['repasse', 'list'] });
  }

  const conferirM = useMutation({
    mutationFn: (input: ConferirInput) => conferirRepasse(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Repasse conferido',
        description: '',
      });
      setConferirOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao conferir repasse', showToast),
  });

  const liberarM = useMutation({
    mutationFn: (input: LiberarInput) => liberarRepasse(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Repasse liberado',
        description: '',
      });
      setLiberarOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao liberar repasse', showToast),
  });

  const pagoM = useMutation({
    mutationFn: (input: MarcarPagoInput) => marcarPagoRepasse(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Repasse marcado como pago',
        description: '',
      });
      setPagoOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao marcar pago', showToast),
  });

  const cancelarM = useMutation({
    mutationFn: (input: CancelarRepasseInput) =>
      cancelarRepasse(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Repasse cancelado',
        description: '',
      });
      setCancelOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao cancelar repasse', showToast),
  });

  const reapurarM = useMutation({
    mutationFn: (input: ReapurarContaInput) => reapurarConta(input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Reapuração enfileirada',
        description: 'O repasse será atualizado quando o job concluir.',
      });
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao enfileirar reapuração', showToast),
  });

  if (repasseQuery.isLoading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (repasseQuery.isError || !repasseQuery.data) {
    const msg =
      repasseQuery.error instanceof ApiError
        ? repasseQuery.error.detail ?? repasseQuery.error.message
        : 'Falha ao carregar repasse.';
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

  const repasse = repasseQuery.data;

  const podeConferir = repasse.status === 'APURADO';
  const podeLiberar = repasse.status === 'CONFERIDO';
  const podePagar = repasse.status === 'LIBERADO';
  const podeCancelar = repasse.status !== 'PAGO' && repasse.status !== 'CANCELADO';

  return (
    <section
      className="space-y-4"
      aria-label={`Detalhe do repasse ${repasse.competencia} de ${repasse.prestadorNome ?? repasse.prestadorUuid}`}
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
            <Calculator aria-hidden="true" className="h-6 w-6" />
            Repasse · {repasse.competencia}
          </h1>
          <p className="text-sm text-muted-foreground">
            {repasse.prestadorNome ?? repasse.prestadorUuid}
            {repasse.prestadorConselho ? ` · ${repasse.prestadorConselho}` : ''}
            {repasse.unidadeFaturamentoNome
              ? ` · ${repasse.unidadeFaturamentoNome}`
              : ''}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium',
            REPASSE_STATUS_BADGE[repasse.status],
          )}
        >
          {REPASSE_STATUS_LABEL[repasse.status]}
        </span>
      </header>

      <ResumoCards repasse={repasse} />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!podeConferir}
          onClick={() => setConferirOpen(true)}
        >
          <ShieldCheck aria-hidden="true" />
          Conferir
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!podeLiberar}
          onClick={() => setLiberarOpen(true)}
        >
          <BadgeCheck aria-hidden="true" />
          Liberar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!podePagar}
          onClick={() => setPagoOpen(true)}
        >
          <Wallet aria-hidden="true" />
          Marcar Pago
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!podeCancelar}
          onClick={() => setCancelOpen(true)}
        >
          <X aria-hidden="true" />
          Cancelar
        </Button>
        <Link
          to={`/repasse/folha/${repasse.prestadorUuid}?competencia=${repasse.competencia}`}
          className="text-xs underline-offset-2 hover:underline"
        >
          Ver folha do prestador
        </Link>
      </div>

      <nav
        role="tablist"
        aria-label="Seções do repasse"
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
        {tab === 'itens' ? <ItensTab repasse={repasse} /> : null}
        {tab === 'criterio' ? <CriterioTab repasse={repasse} /> : null}
        {tab === 'historico' ? <HistoricoTab repasse={repasse} /> : null}
        {tab === 'reapuracao' ? (
          <ReapuracaoTab
            repasse={repasse}
            pending={reapurarM.isPending}
            onSubmit={(input) => reapurarM.mutate(input)}
          />
        ) : null}
      </div>

      <Dialog open={conferirOpen} onOpenChange={setConferirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conferir repasse</DialogTitle>
          </DialogHeader>
          <ObservacaoForm
            label="Observação (opcional)"
            placeholder="Ex.: conferência cruzada com folha anterior."
            pending={conferirM.isPending}
            confirmIcon={<ShieldCheck aria-hidden="true" />}
            confirmLabel="Conferir"
            onSubmit={(observacao) =>
              conferirM.mutate({
                ...(observacao ? { observacao } : {}),
              })
            }
            onCancel={() => setConferirOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={liberarOpen} onOpenChange={setLiberarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liberar repasse</DialogTitle>
          </DialogHeader>
          <ObservacaoForm
            label="Observação (opcional)"
            placeholder="Ex.: liberado pela diretoria financeira."
            pending={liberarM.isPending}
            confirmIcon={<BadgeCheck aria-hidden="true" />}
            confirmLabel="Liberar"
            onSubmit={(observacao) =>
              liberarM.mutate({
                ...(observacao ? { observacao } : {}),
              })
            }
            onCancel={() => setLiberarOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={pagoOpen} onOpenChange={setPagoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como pago</DialogTitle>
          </DialogHeader>
          <PagamentoForm
            pending={pagoM.isPending}
            onSubmit={(input) => pagoM.mutate(input)}
            onCancel={() => setPagoOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar repasse</DialogTitle>
          </DialogHeader>
          <CancelarForm
            pending={cancelarM.isPending}
            onSubmit={(motivo) => cancelarM.mutate({ motivo })}
            onCancel={() => setCancelOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

RepasseDetalhePage.displayName = 'RepasseDetalhePage';

/* ============================== Cards de resumo ============================== */

function ResumoCards({ repasse }: { repasse: Repasse }): JSX.Element {
  const cards: { label: string; value: string; tone?: string }[] = [
    { label: 'Bruto', value: formatMoney(repasse.valorBruto) },
    { label: 'Créditos', value: formatMoney(repasse.valorCreditos) },
    { label: 'Débitos', value: formatMoney(repasse.valorDebitos) },
    { label: 'Descontos', value: formatMoney(repasse.valorDescontos) },
    { label: 'Impostos', value: formatMoney(repasse.valorImpostos) },
    {
      label: 'Líquido',
      value: formatMoney(repasse.valorLiquido),
      tone: 'border-emerald-500/40',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => (
        <Card key={c.label} className={cn(c.tone)}>
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {c.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <p className="text-sm font-semibold tabular-nums">{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ============================== Tabs ============================== */

function ItensTab({ repasse }: { repasse: Repasse }): JSX.Element {
  if (repasse.itens.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Sem itens neste repasse.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table data-testid="repasse-itens-tabela">
        <TableHeader>
          <TableRow>
            <TableHead>Conta</TableHead>
            <TableHead>Item</TableHead>
            <TableHead>Função</TableHead>
            <TableHead>Base</TableHead>
            <TableHead className="text-right">% / Fixo</TableHead>
            <TableHead className="text-right">Valor base</TableHead>
            <TableHead className="text-right">Calculado</TableHead>
            <TableHead>Critério</TableHead>
            <TableHead>Flags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {repasse.itens.map((it) => (
            <ItemRow key={it.uuid} item={it} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ItemRow({ item }: { item: RepasseItem }): JSX.Element {
  return (
    <TableRow data-testid={`repasse-item-${item.uuid}`}>
      <TableCell className="text-xs font-mono">
        <Link
          to={`/contas/${item.contaUuid}`}
          className="text-primary underline-offset-2 hover:underline"
        >
          {item.contaNumero}
        </Link>
      </TableCell>
      <TableCell className="max-w-[220px] truncate text-xs">
        {item.contaItemDescricao ?? item.contaItemUuid ?? '—'}
      </TableCell>
      <TableCell className="text-xs">{item.funcao}</TableCell>
      <TableCell className="text-xs">
        {TIPO_BASE_CALCULO_LABEL[item.baseCalculoTipo]}
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums">
        {item.percentual ? `${Number(item.percentual)}%` : null}
        {item.valorFixo ? formatMoney(item.valorFixo) : null}
        {!item.percentual && !item.valorFixo ? '—' : null}
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums">
        {formatMoney(item.valorBase)}
      </TableCell>
      <TableCell className="text-right text-xs font-semibold tabular-nums">
        {formatMoney(item.valorCalculado)}
      </TableCell>
      <TableCell className="text-xs">
        {item.criterioDescricao ?? item.criterioUuid ?? '—'}
      </TableCell>
      <TableCell className="text-xs">
        <div className="flex flex-col gap-0.5">
          {item.glosado ? (
            <span className="rounded border border-orange-300 bg-orange-100 px-1 text-[10px] text-orange-900">
              Glosado
            </span>
          ) : null}
          {item.reapuradoDeId ? (
            <span className="rounded border border-blue-300 bg-blue-100 px-1 text-[10px] text-blue-900">
              Reapurado
            </span>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function CriterioTab({ repasse }: { repasse: Repasse }): JSX.Element {
  // Mostra o snapshot do primeiro item com criterio definido como referência.
  const snap = repasse.itens.find((i) => i.criterioSnapshot)?.criterioSnapshot;
  const criterioUuid = repasse.itens.find((i) => i.criterioUuid)?.criterioUuid;
  const criterioDescricao = repasse.itens.find(
    (i) => i.criterioDescricao,
  )?.criterioDescricao;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Critério aplicado (snapshot)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {criterioDescricao ? (
          <p className="text-xs">
            <strong>Descrição:</strong> {criterioDescricao}
          </p>
        ) : null}
        {criterioUuid ? (
          <p className="text-xs">
            <strong>UUID:</strong>{' '}
            <Link
              to={`/repasse/criterios/${criterioUuid}`}
              className="font-mono text-primary underline-offset-2 hover:underline"
            >
              {criterioUuid}
            </Link>
          </p>
        ) : null}
        {snap ? (
          <pre className="max-h-72 overflow-auto rounded-md bg-muted/40 p-2 text-[11px]">
            {JSON.stringify(snap, null, 2)}
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground">
            Sem snapshot disponível.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function HistoricoTab({ repasse }: { repasse: Repasse }): JSX.Element {
  if (repasse.historico.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Sem histórico registrado.
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {repasse.historico.map((ev, idx) => (
        <HistoricoLinha key={`${ev.evento}-${idx}`} ev={ev} />
      ))}
    </ol>
  );
}

function HistoricoLinha({ ev }: { ev: RepasseHistoricoEvento }): JSX.Element {
  const eventoIcon: Record<typeof ev.evento, JSX.Element> = {
    APURADO: <Calculator aria-hidden="true" className="h-4 w-4" />,
    CONFERIDO: <ShieldCheck aria-hidden="true" className="h-4 w-4" />,
    LIBERADO: <BadgeCheck aria-hidden="true" className="h-4 w-4" />,
    PAGO: <Wallet aria-hidden="true" className="h-4 w-4" />,
    CANCELADO: <X aria-hidden="true" className="h-4 w-4" />,
    REAPURADO: <RefreshCcw aria-hidden="true" className="h-4 w-4" />,
  };

  return (
    <li className="flex items-start gap-3 rounded-md border bg-background p-3 text-xs">
      <span className="mt-0.5 text-muted-foreground">
        {eventoIcon[ev.evento]}
      </span>
      <div className="flex-1">
        <p className="font-medium">{ev.evento}</p>
        <p className="text-[11px] text-muted-foreground">
          <Clock aria-hidden="true" className="mr-1 inline h-3 w-3" />
          {formatDateTime(ev.data)}
          {ev.usuarioNome ? ` · ${ev.usuarioNome}` : ''}
        </p>
        {ev.observacao ? (
          <p className="mt-1 whitespace-pre-line">{ev.observacao}</p>
        ) : null}
      </div>
    </li>
  );
}

interface ReapuracaoTabProps {
  repasse: Repasse;
  pending: boolean;
  onSubmit: (input: ReapurarContaInput) => void;
}

function ReapuracaoTab({
  repasse,
  pending,
  onSubmit,
}: ReapuracaoTabProps): JSX.Element {
  const [contaUuid, setContaUuid] = useState('');
  const [motivo, setMotivo] = useState('');

  const contasUnicas = Array.from(
    new Map(
      repasse.itens.map((i) => [i.contaUuid, i.contaNumero] as const),
    ).entries(),
  );

  const valid = contaUuid.length > 0 && motivo.trim().length >= 10;

  function handleSubmit(): void {
    if (!valid) return;
    onSubmit({ contaUuid, motivo: motivo.trim() });
    setMotivo('');
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Reapurar conta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Use quando uma glosa associada à conta foi revertida (RN-REP-06). O
          job recalcula os itens da conta e adiciona um histórico
          &laquo;REAPURADO&raquo;.
        </p>
        <div className="space-y-1">
          <Label htmlFor="rea-conta">Conta a reapurar *</Label>
          <select
            id="rea-conta"
            value={contaUuid}
            onChange={(e) => setContaUuid(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option key="__empty__" value="">— selecione —</option>
            {contasUnicas.map(([uuid, numero]) => (
              <option key={uuid} value={uuid}>
                {numero} ({uuid})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rea-mot">Motivo (mín. 10 chars) *</Label>
          <Textarea
            id="rea-mot"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            minLength={10}
            placeholder="Ex.: glosa 1909 revertida pela operadora em 2026-04-30."
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!valid || pending}
          >
            {pending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw aria-hidden="true" />
            )}
            Reapurar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================== Forms ============================== */

interface ObservacaoFormProps {
  label: string;
  placeholder: string;
  pending: boolean;
  confirmIcon: JSX.Element;
  confirmLabel: string;
  onSubmit: (obs: string) => void;
  onCancel: () => void;
}

function ObservacaoForm({
  label,
  placeholder,
  pending,
  confirmIcon,
  confirmLabel,
  onSubmit,
  onCancel,
}: ObservacaoFormProps): JSX.Element {
  const [observacao, setObservacao] = useState('');
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="obs-input">{label}</Label>
        <Textarea
          id="obs-input"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder={placeholder}
          rows={4}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Voltar
        </Button>
        <Button
          type="button"
          onClick={() => onSubmit(observacao.trim())}
          disabled={pending}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            confirmIcon
          )}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </>
  );
}

interface PagamentoFormProps {
  pending: boolean;
  onSubmit: (input: MarcarPagoInput) => void;
  onCancel: () => void;
}

function PagamentoForm({
  pending,
  onSubmit,
  onCancel,
}: PagamentoFormProps): JSX.Element {
  const [dataPagamento, setDataPagamento] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [comprovanteUrl, setComprovanteUrl] = useState('');
  const [observacao, setObservacao] = useState('');

  const valid = dataPagamento.length > 0;

  function handleSubmit(): void {
    if (!valid) return;
    onSubmit({
      dataPagamento,
      ...(comprovanteUrl ? { comprovanteUrl } : {}),
      ...(observacao ? { observacao } : {}),
    });
  }

  return (
    <>
      <div className="space-y-3 text-sm">
        <div className="space-y-1">
          <Label htmlFor="pag-data">Data do pagamento *</Label>
          <Input
            id="pag-data"
            type="date"
            value={dataPagamento}
            onChange={(e) => setDataPagamento(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pag-comp">URL do comprovante</Label>
          <Input
            id="pag-comp"
            value={comprovanteUrl}
            onChange={(e) => setComprovanteUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pag-obs">Observação</Label>
          <Textarea
            id="pag-obs"
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
            <CheckCircle2 aria-hidden="true" />
          )}
          Confirmar pagamento
        </Button>
      </DialogFooter>
    </>
  );
}

interface CancelarFormProps {
  pending: boolean;
  onSubmit: (motivo: string) => void;
  onCancel: () => void;
}

function CancelarForm({
  pending,
  onSubmit,
  onCancel,
}: CancelarFormProps): JSX.Element {
  const [motivo, setMotivo] = useState('');
  const valid = motivo.trim().length >= 10;
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="cancel-motivo">
          Motivo do cancelamento (mín. 10 chars) *
        </Label>
        <Textarea
          id="cancel-motivo"
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
            <X aria-hidden="true" />
          )}
          Cancelar repasse
        </Button>
      </DialogFooter>
    </>
  );
}
