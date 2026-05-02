/**
 * ContaDetalhePage — detalhe completo de uma conta hospitalar.
 *
 * Header: status + ações contextuais (Elaborar / Recalcular / Fechar /
 *         Reabrir / Cancelar / Espelho).
 *
 * Tabs:
 *   - Resumo:       cards granulares de valores (procedimentos, diárias, …).
 *   - Itens:        tabela paginada por filtro de grupo + Dialog "Lançar
 *                   item manual" (motivo obrigatório — RN-FAT-06).
 *   - Snapshots:    JSON read-only (tabela de preços, condição contratual,
 *                   versão TISS, ISS).
 *   - Inconsistências: severidade · código · mensagem · campo/item.
 *   - Glosas:       lista glosas vinculadas (link para detalhe).
 *   - TISS:         lista guias + lotes (link) e botão "Gerar Guias TISS"
 *                   abre Dialog com checkbox de tipos.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Lock,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Unlock,
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
  Select,
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
  cancelarConta,
  elaborarConta,
  fecharConta,
  getConta,
  getEspelhoUrl,
  lancarItemConta,
  reabrirConta,
  recalcularConta,
} from '@/lib/contas-api';
import { gerarGuias } from '@/lib/tiss-api';
import { useToast } from '@/components/Toast';
import {
  CONTA_STATUS_BADGE,
  CONTA_STATUS_LABEL,
  GRUPOS_GASTO,
  GRUPO_GASTO_LABEL,
  type ContaDetalhe,
  type ContaItem,
  type GrupoGasto,
  type LancarItemContaInput,
} from '@/types/contas';
import {
  TISS_TIPOS_GUIA,
  TISS_TIPO_GUIA_LABEL,
  type TissTipoGuia,
} from '@/types/tiss';
import { cn } from '@/lib/utils';

type TabKey =
  | 'resumo'
  | 'itens'
  | 'snapshots'
  | 'inconsistencias'
  | 'glosas'
  | 'tiss';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'itens', label: 'Itens' },
  { key: 'snapshots', label: 'Snapshots' },
  { key: 'inconsistencias', label: 'Inconsistências' },
  { key: 'glosas', label: 'Glosas' },
  { key: 'tiss', label: 'TISS' },
];

function formatBR(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function formatMoney(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
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

export function ContaDetalhePage(): JSX.Element {
  const { uuid = '' } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [tab, setTab] = useState<TabKey>('resumo');
  const [reabrirOpen, setReabrirOpen] = useState(false);
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [lancarOpen, setLancarOpen] = useState(false);
  const [gerarTissOpen, setGerarTissOpen] = useState(false);
  const [recalcOperacao, setRecalcOperacao] = useState<string | null>(null);

  const contaQuery = useQuery({
    queryKey: ['conta', uuid],
    queryFn: () => getConta(uuid),
    enabled: Boolean(uuid),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['conta', uuid] });
  }

  const elaborarM = useMutation({
    mutationFn: () => elaborarConta(uuid),
    onSuccess: (result) => {
      setRecalcOperacao(result.operacaoUuid);
      showToast({
        variant: 'success',
        title: 'Conta elaborada',
        description: `${result.inconsistencias.length} inconsistências detectadas.`,
      });
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao elaborar', showToast),
  });

  const recalcularM = useMutation({
    mutationFn: () =>
      recalcularConta(uuid, {
        operacaoUuid: recalcOperacao ?? '',
      }),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Conta recalculada',
        description: '',
      });
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao recalcular', showToast),
  });

  const fecharM = useMutation({
    mutationFn: () => fecharConta(uuid),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Conta fechada',
        description: '',
      });
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao fechar', showToast),
  });

  const reabrirM = useMutation({
    mutationFn: (motivo: string) => reabrirConta(uuid, { motivo }),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Conta reaberta',
        description: '',
      });
      setReabrirOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao reabrir', showToast),
  });

  const cancelarM = useMutation({
    mutationFn: (motivo: string) => cancelarConta(uuid, { motivo }),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Conta cancelada',
        description: '',
      });
      setCancelarOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao cancelar', showToast),
  });

  const lancarItemM = useMutation({
    mutationFn: (input: LancarItemContaInput) => lancarItemConta(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Item lançado',
        description: '',
      });
      setLancarOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao lançar item', showToast),
  });

  const gerarTissM = useMutation({
    mutationFn: (tipos: TissTipoGuia[]) =>
      gerarGuias({ contaUuid: uuid, tiposGuia: tipos }),
    onSuccess: (res) => {
      showToast({
        variant: 'success',
        title: 'Guias TISS geradas',
        description: `${res.guias.length} guia(s) · ${res.alertasXsd.length} alerta(s) XSD.`,
      });
      setGerarTissOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao gerar guias', showToast),
  });

  if (contaQuery.isLoading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (contaQuery.isError || !contaQuery.data) {
    const msg =
      contaQuery.error instanceof ApiError
        ? contaQuery.error.detail ?? contaQuery.error.message
        : 'Falha ao carregar conta.';
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

  const conta = contaQuery.data;

  const podeElaborar =
    conta.status === 'ABERTA' || conta.status === 'EM_ELABORACAO';
  const podeRecalcular =
    conta.status === 'EM_ELABORACAO' && Boolean(recalcOperacao);
  const podeFechar = conta.status === 'EM_ELABORACAO';
  const podeReabrir =
    conta.status === 'FECHADA' || conta.status === 'FATURADA';
  const podeCancelar = conta.status !== 'CANCELADA' && conta.status !== 'PAGA';
  const podeLancarItem =
    conta.status === 'ABERTA' || conta.status === 'EM_ELABORACAO';
  const podeGerarTiss =
    conta.status === 'FECHADA' ||
    conta.status === 'FATURADA' ||
    conta.status === 'GLOSADA_PARCIAL';

  return (
    <section
      className="space-y-4"
      aria-label={`Detalhe da conta ${conta.numero}`}
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
            <Receipt aria-hidden="true" className="h-6 w-6" />
            Conta {conta.numero}
          </h1>
          <p className="text-sm text-muted-foreground">
            {conta.pacienteNome} · Atend. {conta.atendimentoNumero} ·{' '}
            {conta.convenioNome}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium',
            CONTA_STATUS_BADGE[conta.status],
          )}
        >
          {CONTA_STATUS_LABEL[conta.status]}
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!podeElaborar || elaborarM.isPending}
          onClick={() => elaborarM.mutate()}
        >
          {elaborarM.isPending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <ClipboardList aria-hidden="true" />
          )}
          Elaborar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!podeRecalcular || recalcularM.isPending}
          onClick={() => recalcularM.mutate()}
          title={
            recalcOperacao
              ? undefined
              : 'Execute "Elaborar" primeiro para gerar a operação de cálculo.'
          }
        >
          {recalcularM.isPending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
          Recalcular
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!podeFechar || fecharM.isPending}
          onClick={() => fecharM.mutate()}
        >
          {fecharM.isPending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Lock aria-hidden="true" />
          )}
          Fechar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!podeReabrir}
          onClick={() => setReabrirOpen(true)}
        >
          <Unlock aria-hidden="true" />
          Reabrir
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!podeCancelar}
          onClick={() => setCancelarOpen(true)}
        >
          <X aria-hidden="true" />
          Cancelar
        </Button>
        <a
          href={getEspelhoUrl(conta.uuid, 'pdf')}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button type="button" size="sm" variant="outline">
            <FileText aria-hidden="true" />
            Espelho
          </Button>
        </a>
      </div>

      <nav
        role="tablist"
        aria-label="Seções da conta"
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
        {tab === 'resumo' ? <ResumoTab conta={conta} /> : null}
        {tab === 'itens' ? (
          <ItensTab
            conta={conta}
            podeLancarItem={podeLancarItem}
            onLancarItem={() => setLancarOpen(true)}
          />
        ) : null}
        {tab === 'snapshots' ? <SnapshotsTab conta={conta} /> : null}
        {tab === 'inconsistencias' ? (
          <InconsistenciasTab conta={conta} />
        ) : null}
        {tab === 'glosas' ? <GlosasTab conta={conta} /> : null}
        {tab === 'tiss' ? (
          <TissTab
            conta={conta}
            podeGerar={podeGerarTiss}
            onGerar={() => setGerarTissOpen(true)}
          />
        ) : null}
      </div>

      <Dialog open={reabrirOpen} onOpenChange={setReabrirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir conta</DialogTitle>
          </DialogHeader>
          <MotivoForm
            label="Motivo da reabertura *"
            placeholder="Justifique a reabertura"
            pending={reabrirM.isPending}
            onSubmit={(m) => reabrirM.mutate(m)}
            onCancel={() => setReabrirOpen(false)}
            confirmIcon={<Unlock aria-hidden="true" />}
            confirmLabel="Reabrir"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={cancelarOpen} onOpenChange={setCancelarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar conta</DialogTitle>
          </DialogHeader>
          <MotivoForm
            label="Motivo do cancelamento *"
            placeholder="Justifique (RN-FAT-09)"
            pending={cancelarM.isPending}
            onSubmit={(m) => cancelarM.mutate(m)}
            onCancel={() => setCancelarOpen(false)}
            confirmIcon={<X aria-hidden="true" />}
            confirmLabel="Cancelar conta"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={lancarOpen} onOpenChange={setLancarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lançar item manual</DialogTitle>
          </DialogHeader>
          <LancarItemForm
            pending={lancarItemM.isPending}
            onSubmit={(input) => lancarItemM.mutate(input)}
            onCancel={() => setLancarOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={gerarTissOpen} onOpenChange={setGerarTissOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar guias TISS</DialogTitle>
          </DialogHeader>
          <GerarGuiasForm
            pending={gerarTissM.isPending}
            onSubmit={(tipos) => gerarTissM.mutate(tipos)}
            onCancel={() => setGerarTissOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ============================== Resumo ============================== */

function ResumoTab({ conta }: { conta: ContaDetalhe }): JSX.Element {
  const cards: { label: string; value: string; highlight?: boolean }[] = [
    { label: 'Procedimentos', value: formatMoney(conta.resumo.procedimentos) },
    { label: 'Diárias', value: formatMoney(conta.resumo.diarias) },
    { label: 'Taxas', value: formatMoney(conta.resumo.taxas) },
    { label: 'Serviços', value: formatMoney(conta.resumo.servicos) },
    { label: 'Materiais', value: formatMoney(conta.resumo.materiais) },
    { label: 'Medicamentos', value: formatMoney(conta.resumo.medicamentos) },
    { label: 'OPME', value: formatMoney(conta.resumo.opme) },
    { label: 'Gases', value: formatMoney(conta.resumo.gases) },
    { label: 'Pacotes', value: formatMoney(conta.resumo.pacotes) },
    { label: 'Honorários', value: formatMoney(conta.resumo.honorarios) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label}>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-foreground/30">
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] uppercase tracking-wide">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <p className="text-base font-semibold tabular-nums">
              {formatMoney(conta.resumo.total)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Glosa
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <p className="text-sm font-semibold tabular-nums text-orange-700">
              {formatMoney(conta.resumo.glosa)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Recurso revertido
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <p className="text-sm font-semibold tabular-nums text-emerald-700">
              {formatMoney(conta.resumo.recursoRevertido)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/40">
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] uppercase tracking-wide">
              Líquido
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <p className="text-base font-semibold tabular-nums">
              {formatMoney(conta.resumo.liquido)}
            </p>
          </CardContent>
        </Card>
      </div>

      {conta.snapshots.iss ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ISS</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">
                Alíquota
              </p>
              <p className="font-medium">{conta.snapshots.iss.aliquota}%</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">
                Valor
              </p>
              <p className="font-medium">
                {formatMoney(conta.snapshots.iss.valor)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">
                Retido na fonte?
              </p>
              <p className="font-medium">
                {conta.snapshots.iss.retem ? 'Sim' : 'Não'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/* ============================== Itens ============================== */

interface ItensTabProps {
  conta: ContaDetalhe;
  podeLancarItem: boolean;
  onLancarItem: () => void;
}

function ItensTab({
  conta,
  podeLancarItem,
  onLancarItem,
}: ItensTabProps): JSX.Element {
  const [grupoFiltro, setGrupoFiltro] = useState<'TODOS' | GrupoGasto>('TODOS');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filtrados = useMemo(
    () =>
      grupoFiltro === 'TODOS'
        ? conta.itens
        : conta.itens.filter((i) => i.grupoGasto === grupoFiltro),
    [conta.itens, grupoFiltro],
  );

  const totalPages = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const paginados = filtrados.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Itens da conta</CardTitle>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="grupo-filtro">Grupo</Label>
              <Select
                id="grupo-filtro"
                value={grupoFiltro}
                onChange={(e) => {
                  setGrupoFiltro(e.target.value as 'TODOS' | GrupoGasto);
                  setPage(1);
                }}
              >
                <option value="TODOS">Todos</option>
                {GRUPOS_GASTO.map((g) => (
                  <option key={g} value={g}>
                    {GRUPO_GASTO_LABEL[g]}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={onLancarItem}
              disabled={!podeLancarItem}
              title={
                podeLancarItem
                  ? undefined
                  : 'Itens manuais só podem ser lançados em conta aberta ou em elaboração.'
              }
            >
              <Plus aria-hidden="true" />
              Lançar item manual
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="itens-tabela">
              <TableHeader>
                <TableRow>
                  <TableHead>Procedimento</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Unitário</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Pacote</TableHead>
                  <TableHead>Realização</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginados.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      Nenhum item para o filtro.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginados.map((i) => <ItemRow key={i.uuid} item={i} />)
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 ? (
            <footer className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Página {page} de {totalPages} · {filtrados.length} item(ns)
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Próxima
                </Button>
              </div>
            </footer>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ItemRow({ item }: { item: ContaItem }): JSX.Element {
  return (
    <TableRow data-testid={`item-row-${item.uuid}`}>
      <TableCell className="text-xs">
        <div className="flex flex-col">
          <span className="font-medium">{item.procedimentoNome}</span>
          {item.procedimentoCodigo ? (
            <span className="text-[10px] text-muted-foreground">
              cod. {item.procedimentoCodigo}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-xs">
        {GRUPO_GASTO_LABEL[item.grupoGasto]}
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums">
        {item.quantidade}
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums">
        {formatMoney(item.valorUnitario)}
      </TableCell>
      <TableCell className="text-right text-xs font-semibold tabular-nums">
        {formatMoney(item.valorTotal)}
      </TableCell>
      <TableCell className="text-xs">{item.origem}</TableCell>
      <TableCell className="text-xs">
        {item.pacote ? (item.foraPacote ? 'Fora' : 'Sim') : '—'}
      </TableCell>
      <TableCell className="text-xs">{formatBR(item.dataRealizacao)}</TableCell>
    </TableRow>
  );
}

/* ============================ Snapshots ============================ */

function SnapshotsTab({ conta }: { conta: ContaDetalhe }): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tabela de preços (snap)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-72 overflow-auto rounded-md bg-muted/40 p-2 text-[11px]">
            {JSON.stringify(conta.snapshots.tabelaPrecosSnap, null, 2)}
          </pre>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Condição contratual (snap)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-72 overflow-auto rounded-md bg-muted/40 p-2 text-[11px]">
            {JSON.stringify(conta.snapshots.condicaoContratualSnap, null, 2)}
          </pre>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Versão TISS (snap)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs">
            <strong>Versão:</strong>{' '}
            {conta.snapshots.versaoTissSnapshot ?? '—'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ========================= Inconsistências ========================= */

const SEVERIDADE_BADGE: Record<string, string> = {
  ERROR: 'bg-red-100 text-red-900 border-red-300',
  WARNING: 'bg-amber-100 text-amber-900 border-amber-300',
  INFO: 'bg-blue-100 text-blue-900 border-blue-300',
};

function InconsistenciasTab({ conta }: { conta: ContaDetalhe }): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Inconsistências</CardTitle>
      </CardHeader>
      <CardContent>
        {conta.inconsistencias.length === 0 ? (
          <p className="flex items-center gap-2 py-6 text-sm text-emerald-700">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            Nenhuma inconsistência detectada.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severidade</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Item / Campo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conta.inconsistencias.map((inc, idx) => (
                <TableRow key={`${inc.codigo}-${idx}`}>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        SEVERIDADE_BADGE[inc.severidade],
                      )}
                    >
                      {inc.severidade}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {inc.codigo}
                  </TableCell>
                  <TableCell className="text-xs">{inc.mensagem}</TableCell>
                  <TableCell className="text-xs">
                    {inc.itemUuid ?? inc.campo ?? '—'}
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

/* ============================== Glosas ============================== */

function GlosasTab({ conta }: { conta: ContaDetalhe }): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Glosas vinculadas</CardTitle>
      </CardHeader>
      <CardContent>
        {conta.glosaUuids.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Nenhuma glosa vinculada.
          </p>
        ) : (
          <ul className="space-y-1 text-xs">
            {conta.glosaUuids.map((id) => (
              <li
                key={id}
                className="flex items-center justify-between rounded-md border bg-background p-2"
              >
                <span className="font-mono">{id}</span>
                <Link
                  to={`/glosas/${id}`}
                  className="text-xs text-primary underline-offset-2 hover:underline"
                >
                  Ver glosa
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* =============================== TISS =============================== */

interface TissTabProps {
  conta: ContaDetalhe;
  podeGerar: boolean;
  onGerar: () => void;
}

function TissTab({ conta, podeGerar, onGerar }: TissTabProps): JSX.Element {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Guias TISS</CardTitle>
          <Button
            type="button"
            size="sm"
            onClick={onGerar}
            disabled={!podeGerar}
            title={
              podeGerar
                ? undefined
                : 'A conta precisa estar fechada/faturada para gerar guias.'
            }
          >
            <Send aria-hidden="true" />
            Gerar Guias TISS
          </Button>
        </CardHeader>
        <CardContent>
          {conta.guiaTissUuids.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Nenhuma guia TISS gerada.
            </p>
          ) : (
            <ul className="space-y-1 text-xs">
              {conta.guiaTissUuids.map((id) => (
                <li
                  key={id}
                  className="flex items-center justify-between rounded-md border bg-background p-2"
                >
                  <span className="font-mono">{id}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Lotes TISS</CardTitle>
        </CardHeader>
        <CardContent>
          {conta.loteTissUuids.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Nenhum lote vinculado.
            </p>
          ) : (
            <ul className="space-y-1 text-xs">
              {conta.loteTissUuids.map((id) => (
                <li
                  key={id}
                  className="flex items-center justify-between rounded-md border bg-background p-2"
                >
                  <span className="font-mono">{id}</span>
                  <Link
                    to={`/tiss/lotes/${id}`}
                    className="text-xs text-primary underline-offset-2 hover:underline"
                  >
                    Ver lote
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* =========================== Motivo Form =========================== */

interface MotivoFormProps {
  label: string;
  placeholder: string;
  pending: boolean;
  onSubmit: (motivo: string) => void;
  onCancel: () => void;
  confirmIcon: JSX.Element;
  confirmLabel: string;
}

function MotivoForm({
  label,
  placeholder,
  pending,
  onSubmit,
  onCancel,
  confirmIcon,
  confirmLabel,
}: MotivoFormProps): JSX.Element {
  const [motivo, setMotivo] = useState('');
  const valid = motivo.trim().length >= 5;
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="motivo-input">{label}</Label>
        <Textarea
          id="motivo-input"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          minLength={5}
          required
          placeholder={placeholder}
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
            confirmIcon
          )}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </>
  );
}

/* ========================= Lançar Item Form ========================= */

interface LancarItemFormProps {
  pending: boolean;
  onSubmit: (input: LancarItemContaInput) => void;
  onCancel: () => void;
}

function LancarItemForm({
  pending,
  onSubmit,
  onCancel,
}: LancarItemFormProps): JSX.Element {
  const [procedimentoUuid, setProcedimentoUuid] = useState('');
  const [grupoGasto, setGrupoGasto] = useState<GrupoGasto>('PROCEDIMENTOS');
  const [quantidade, setQuantidade] = useState('1');
  const [valorUnitario, setValorUnitario] = useState('0');
  const [motivo, setMotivo] = useState('');
  const [prestadorExecutanteUuid, setPrestador] = useState('');
  const [setorUuid, setSetor] = useState('');
  const [dataRealizacao, setDataRealizacao] = useState('');
  const [autorizacao, setAutorizacao] = useState('');

  const qtd = Number(quantidade);
  const valor = Number(valorUnitario);
  const valid =
    procedimentoUuid.length > 0 &&
    Number.isFinite(qtd) &&
    qtd > 0 &&
    Number.isFinite(valor) &&
    valor >= 0 &&
    motivo.trim().length >= 5;

  function handleSubmit(): void {
    if (!valid) return;
    onSubmit({
      procedimentoUuid,
      grupoGasto,
      quantidade: qtd,
      valorUnitario: valor,
      motivo: motivo.trim(),
      ...(prestadorExecutanteUuid ? { prestadorExecutanteUuid } : {}),
      ...(setorUuid ? { setorUuid } : {}),
      ...(dataRealizacao ? { dataRealizacao } : {}),
      ...(autorizacao ? { autorizacaoNumero: autorizacao } : {}),
    });
  }

  return (
    <>
      <div className="space-y-3 text-sm">
        <div className="space-y-1">
          <Label htmlFor="li-proc">Procedimento (UUID) *</Label>
          <Input
            id="li-proc"
            value={procedimentoUuid}
            onChange={(e) => setProcedimentoUuid(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="li-grupo">Grupo *</Label>
            <Select
              id="li-grupo"
              value={grupoGasto}
              onChange={(e) => setGrupoGasto(e.target.value as GrupoGasto)}
            >
              {GRUPOS_GASTO.map((g) => (
                <option key={g} value={g}>
                  {GRUPO_GASTO_LABEL[g]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="li-data">Data realização</Label>
            <Input
              id="li-data"
              type="date"
              value={dataRealizacao}
              onChange={(e) => setDataRealizacao(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="li-qtd">Quantidade *</Label>
            <Input
              id="li-qtd"
              type="number"
              min="0.0001"
              step="0.0001"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="li-vl">Valor unitário *</Label>
            <Input
              id="li-vl"
              type="number"
              min="0"
              step="0.01"
              value={valorUnitario}
              onChange={(e) => setValorUnitario(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="li-prest">Prestador executante (UUID)</Label>
          <Input
            id="li-prest"
            value={prestadorExecutanteUuid}
            onChange={(e) => setPrestador(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="li-setor">Setor (UUID)</Label>
          <Input
            id="li-setor"
            value={setorUuid}
            onChange={(e) => setSetor(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="li-aut">Autorização (número)</Label>
          <Input
            id="li-aut"
            value={autorizacao}
            onChange={(e) => setAutorizacao(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="li-motivo">Motivo *</Label>
          <Textarea
            id="li-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Justifique (RN-FAT-06)"
            minLength={5}
            required
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!valid || pending}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Lançar
        </Button>
      </DialogFooter>
    </>
  );
}

/* ========================= Gerar Guias Form ========================= */

interface GerarGuiasFormProps {
  pending: boolean;
  onSubmit: (tipos: TissTipoGuia[]) => void;
  onCancel: () => void;
}

function GerarGuiasForm({
  pending,
  onSubmit,
  onCancel,
}: GerarGuiasFormProps): JSX.Element {
  const [tipos, setTipos] = useState<Set<TissTipoGuia>>(
    () => new Set<TissTipoGuia>(['SP_SADT']),
  );

  function toggle(t: TissTipoGuia): void {
    setTipos((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const valid = tipos.size > 0;

  return (
    <>
      <div className="space-y-2 text-sm">
        <p className="text-xs text-muted-foreground">
          Selecione os tipos de guia a gerar para esta conta. Cada guia será
          validada contra o XSD da versão TISS antes de persistir.
        </p>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {TISS_TIPOS_GUIA.map((t) => (
            <label
              key={t}
              className="flex items-center gap-2 rounded-md border bg-background p-2 text-xs"
            >
              <input
                type="checkbox"
                checked={tipos.has(t)}
                onChange={() => toggle(t)}
              />
              {TISS_TIPO_GUIA_LABEL[t]}
            </label>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => onSubmit(Array.from(tipos))}
          disabled={!valid || pending}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw aria-hidden="true" />
          )}
          Gerar
        </Button>
      </DialogFooter>
    </>
  );
}

ContaDetalhePage.displayName = 'ContaDetalhePage';
