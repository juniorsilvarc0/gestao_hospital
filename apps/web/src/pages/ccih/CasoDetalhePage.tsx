/**
 * CasoDetalhePage — detalhe de um caso CCIH (Fase 10).
 *
 * Tabs: Resumo / Antibiograma / Contatos de Risco / Histórico.
 *
 * Botões contextuais:
 *   - Notificar (Dialog com observação + flag compulsória)
 *     habilitado em ABERTO ou EM_INVESTIGACAO.
 *   - Encerrar (Dialog com resultado: CURA/OBITO/ALTA_COM_INFECCAO).
 *
 * RN-CCI-01: a tab "Contatos de Risco" usa endpoint dedicado
 *   `/v1/ccih/casos/:uuid/contatos-risco`.
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  ShieldAlert,
  Skull,
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
  encerrarCaso,
  getCaso,
  getContatosRisco,
  notificarCaso,
} from '@/lib/ccih-api';
import { useToast } from '@/components/Toast';
import {
  ANTIBIOTICO_RESULTADO_BADGE,
  ANTIBIOTICO_RESULTADO_LABEL,
  CCIH_RESULTADOS,
  CCIH_RESULTADO_LABEL,
  CCIH_STATUS_BADGE,
  CCIH_STATUS_LABEL,
  ORIGEM_INFECCAO_LABEL,
  type CcihCaso,
  type CcihResultado,
  type EncerrarCasoInput,
  type NotificarCasoInput,
} from '@/types/ccih';
import { cn } from '@/lib/utils';

type TabKey = 'resumo' | 'antibiograma' | 'contatos' | 'historico';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'antibiograma', label: 'Antibiograma' },
  { key: 'contatos', label: 'Contatos de Risco' },
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

export function CasoDetalhePage(): JSX.Element {
  const { uuid = '' } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [tab, setTab] = useState<TabKey>('resumo');
  const [notificarOpen, setNotificarOpen] = useState(false);
  const [encerrarOpen, setEncerrarOpen] = useState(false);

  const casoQuery = useQuery({
    queryKey: ['ccih', 'caso', uuid],
    queryFn: () => getCaso(uuid),
    enabled: Boolean(uuid),
  });

  const contatosQuery = useQuery({
    queryKey: ['ccih', 'caso', uuid, 'contatos'],
    queryFn: () => getContatosRisco(uuid),
    enabled: Boolean(uuid) && tab === 'contatos',
    staleTime: 60_000,
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['ccih', 'caso', uuid] });
    void queryClient.invalidateQueries({ queryKey: ['ccih', 'casos', 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['ccih', 'painel'] });
  }

  const notificarM = useMutation({
    mutationFn: (input: NotificarCasoInput) => notificarCaso(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Caso notificado',
        description: '',
      });
      setNotificarOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao notificar caso', showToast),
  });

  const encerrarM = useMutation({
    mutationFn: (input: EncerrarCasoInput) => encerrarCaso(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Caso encerrado',
        description: '',
      });
      setEncerrarOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao encerrar caso', showToast),
  });

  if (casoQuery.isLoading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (casoQuery.isError || !casoQuery.data) {
    const msg =
      casoQuery.error instanceof ApiError
        ? casoQuery.error.detail ?? casoQuery.error.message
        : 'Falha ao carregar caso.';
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

  const caso = casoQuery.data;
  const podeNotificar =
    caso.status === 'ABERTO' || caso.status === 'EM_INVESTIGACAO';
  const podeEncerrar = caso.status !== 'ENCERRADO';

  return (
    <section
      className="space-y-4"
      aria-label={`Detalhe do caso CCIH ${caso.pacienteNome ?? caso.pacienteUuid}`}
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
            <ShieldAlert aria-hidden="true" className="h-6 w-6" />
            Caso CCIH · {caso.pacienteNome ?? caso.pacienteUuid}
          </h1>
          <p className="text-sm text-muted-foreground">
            {caso.setorNome ?? caso.setorUuid}
            {caso.leitoNumero ? ` · Leito ${caso.leitoNumero}` : ''}
            {' · diag. '}
            {formatBR(caso.dataDiagnostico)}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium',
            CCIH_STATUS_BADGE[caso.status],
          )}
        >
          {CCIH_STATUS_LABEL[caso.status]}
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!podeNotificar}
          onClick={() => setNotificarOpen(true)}
        >
          <Send aria-hidden="true" />
          Notificar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!podeEncerrar}
          onClick={() => setEncerrarOpen(true)}
        >
          <CheckCircle2 aria-hidden="true" />
          Encerrar
        </Button>
      </div>

      <nav
        role="tablist"
        aria-label="Seções do caso"
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
        {tab === 'resumo' ? <ResumoTab caso={caso} /> : null}
        {tab === 'antibiograma' ? <AntibiogramaTab caso={caso} /> : null}
        {tab === 'contatos' ? (
          <ContatosTab
            isLoading={contatosQuery.isLoading}
            data={contatosQuery.data ?? []}
          />
        ) : null}
        {tab === 'historico' ? <HistoricoTab caso={caso} /> : null}
      </div>

      <Dialog open={notificarOpen} onOpenChange={setNotificarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notificar caso</DialogTitle>
          </DialogHeader>
          <NotificarForm
            pending={notificarM.isPending}
            onSubmit={(input) => notificarM.mutate(input)}
            onCancel={() => setNotificarOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={encerrarOpen} onOpenChange={setEncerrarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar caso</DialogTitle>
          </DialogHeader>
          <EncerrarForm
            pending={encerrarM.isPending}
            onSubmit={(input) => encerrarM.mutate(input)}
            onCancel={() => setEncerrarOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

CasoDetalhePage.displayName = 'CasoDetalhePage';

/* ============================== Tabs ============================== */

function ResumoTab({ caso }: { caso: CcihCaso }): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Topografia
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <p className="text-sm">{caso.topografia ?? '—'}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
            CID-10
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <p className="text-sm font-mono">{caso.cid ?? '—'}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Microorganismo
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <p className="text-sm italic">{caso.microorganismo ?? '—'}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Origem da cultura
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <p className="text-sm">{caso.culturaOrigem ?? '—'}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Origem da infecção
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <p className="text-sm">
            {caso.origemInfeccao
              ? ORIGEM_INFECCAO_LABEL[caso.origemInfeccao]
              : '—'}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Resultado
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <p className="text-sm">
            {caso.resultado ? CCIH_RESULTADO_LABEL[caso.resultado] : '— (em curso)'}
          </p>
        </CardContent>
      </Card>
      {caso.observacao ? (
        <Card className="sm:col-span-2">
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Observação
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <p className="whitespace-pre-line text-sm">{caso.observacao}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function AntibiogramaTab({ caso }: { caso: CcihCaso }): JSX.Element {
  if (!caso.resistencia || caso.resistencia.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Sem antibiograma registrado.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table data-testid="ccih-antibiograma">
        <TableHeader>
          <TableRow>
            <TableHead>Antibiótico</TableHead>
            <TableHead>Resultado</TableHead>
            <TableHead>CMI</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {caso.resistencia.map((r, idx) => (
            <TableRow key={`${r.antibiotico}-${idx}`}>
              <TableCell className="text-xs">{r.antibiotico}</TableCell>
              <TableCell>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                    ANTIBIOTICO_RESULTADO_BADGE[r.resultado],
                  )}
                >
                  {ANTIBIOTICO_RESULTADO_LABEL[r.resultado]}
                </span>
              </TableCell>
              <TableCell className="text-xs font-mono">{r.cmi ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface ContatosTabProps {
  isLoading: boolean;
  data: import('@/types/ccih').CcihContatoRisco[];
}

function ContatosTab({ isLoading, data }: ContatosTabProps): JSX.Element {
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        Carregando contatos de risco...
      </p>
    );
  }
  if (data.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        RN-CCI-01: sem contatos de risco identificados (mesmo setor/leito no
        período).
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table data-testid="ccih-contatos-risco">
        <TableHeader>
          <TableRow>
            <TableHead>Paciente</TableHead>
            <TableHead>Setor</TableHead>
            <TableHead>Leito</TableHead>
            <TableHead>Início</TableHead>
            <TableHead>Fim</TableHead>
            <TableHead>Motivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((c) => (
            <TableRow key={`${c.pacienteUuid}-${c.inicio}`}>
              <TableCell className="text-xs">
                {c.pacienteNome ?? c.pacienteUuid}
              </TableCell>
              <TableCell className="text-xs">
                {c.setorNome ?? c.setorUuid ?? '—'}
              </TableCell>
              <TableCell className="text-xs">
                {c.leitoNumero ?? c.leitoUuid ?? '—'}
              </TableCell>
              <TableCell className="text-xs">{formatBR(c.inicio)}</TableCell>
              <TableCell className="text-xs">{formatBR(c.fim)}</TableCell>
              <TableCell className="text-xs">{c.motivo}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function HistoricoTab({ caso }: { caso: CcihCaso }): JSX.Element {
  const historico = caso.historico ?? [];
  if (historico.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Sem histórico registrado.
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {historico.map((ev, idx) => (
        <li
          key={`${ev.evento}-${idx}`}
          className="flex items-start gap-3 rounded-md border bg-background p-3 text-xs"
        >
          <Clock aria-hidden="true" className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="flex-1 space-y-1">
            <p className="font-medium">{ev.evento}</p>
            <p className="text-[11px] text-muted-foreground">
              {formatDateTime(ev.data)}
              {ev.usuarioNome ? ` · ${ev.usuarioNome}` : ''}
            </p>
            {ev.observacao ? (
              <p className="whitespace-pre-line">{ev.observacao}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ============================== Forms ============================== */

interface NotificarFormProps {
  pending: boolean;
  onSubmit: (input: NotificarCasoInput) => void;
  onCancel: () => void;
}

function NotificarForm({
  pending,
  onSubmit,
  onCancel,
}: NotificarFormProps): JSX.Element {
  const [observacao, setObservacao] = useState('');
  const [compulsoria, setCompulsoria] = useState(false);

  return (
    <>
      <div className="space-y-3 text-sm">
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          RN-CCI-03: notificação de doenças compulsórias gera alerta ao gestor.
        </p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={compulsoria}
            onChange={(e) => setCompulsoria(e.target.checked)}
            className="h-4 w-4 rounded border-input"
            data-testid="caso-compulsoria"
          />
          Notificação compulsória (MS / ANVISA)
        </label>
        <div className="space-y-1">
          <Label htmlFor="not-obs">Observação</Label>
          <Textarea
            id="not-obs"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={4}
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
              ...(observacao ? { observacao: observacao.trim() } : {}),
              ...(compulsoria ? { compulsoria } : {}),
            })
          }
          disabled={pending}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Send aria-hidden="true" />
          )}
          Notificar
        </Button>
      </DialogFooter>
    </>
  );
}

interface EncerrarFormProps {
  pending: boolean;
  onSubmit: (input: EncerrarCasoInput) => void;
  onCancel: () => void;
}

function EncerrarForm({
  pending,
  onSubmit,
  onCancel,
}: EncerrarFormProps): JSX.Element {
  const [resultado, setResultado] = useState<CcihResultado>('CURA');
  const [observacao, setObservacao] = useState('');

  const Icon =
    resultado === 'OBITO'
      ? Skull
      : resultado === 'ALTA_COM_INFECCAO'
        ? XCircle
        : CheckCircle2;

  return (
    <>
      <div className="space-y-3 text-sm">
        <div className="space-y-1">
          <Label htmlFor="enc-res">Resultado *</Label>
          <Select
            id="enc-res"
            value={resultado}
            onChange={(e) => setResultado(e.target.value as CcihResultado)}
          >
            {CCIH_RESULTADOS.map((r) => (
              <option key={r} value={r}>
                {CCIH_RESULTADO_LABEL[r]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="enc-obs">Observação</Label>
          <Textarea
            id="enc-obs"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={4}
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
              resultado,
              ...(observacao ? { observacao: observacao.trim() } : {}),
            })
          }
          disabled={pending}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Icon aria-hidden="true" />
          )}
          Encerrar caso
        </Button>
      </DialogFooter>
    </>
  );
}
