/**
 * ProntuarioDetalhePage — detalhe de prontuário SAME (Fase 10).
 *
 * Exibe dados, histórico de empréstimos e botões: Digitalizar, Emprestar.
 *
 * Decisões:
 *  - Histórico de empréstimos vem de `/v1/same/emprestimos?prontuarioUuid=`.
 *  - Digitalização requer URL do PDF (upload completo é assunto de fase futura
 *    do módulo arquivos).
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowLeft,
  ClipboardList,
  FileDown,
  Loader2,
  Save,
  ScanLine,
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
  createEmprestimo,
  digitalizarProntuario,
  getProntuario,
  listEmprestimos,
} from '@/lib/same-api';
import { useToast } from '@/components/Toast';
import {
  EMPRESTIMO_STATUS_BADGE,
  EMPRESTIMO_STATUS_LABEL,
  PRONTUARIO_STATUS_BADGE,
  PRONTUARIO_STATUS_LABEL,
  type CreateEmprestimoInput,
  type DigitalizarProntuarioInput,
} from '@/types/same';
import { cn } from '@/lib/utils';

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

export function ProntuarioDetalhePage(): JSX.Element {
  const { uuid = '' } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [digitalizarOpen, setDigitalizarOpen] = useState(false);
  const [emprestarOpen, setEmprestarOpen] = useState(false);

  const prontQuery = useQuery({
    queryKey: ['same', 'prontuario', uuid],
    queryFn: () => getProntuario(uuid),
    enabled: Boolean(uuid),
  });

  const emprestQuery = useQuery({
    queryKey: ['same', 'prontuario', uuid, 'emprestimos'],
    queryFn: () => listEmprestimos({ prontuarioUuid: uuid, pageSize: 50 }),
    enabled: Boolean(uuid),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['same', 'prontuario', uuid] });
    void queryClient.invalidateQueries({
      queryKey: ['same', 'prontuario', uuid, 'emprestimos'],
    });
    void queryClient.invalidateQueries({
      queryKey: ['same', 'prontuarios', 'list'],
    });
    void queryClient.invalidateQueries({
      queryKey: ['same', 'emprestimos', 'list'],
    });
  }

  const digitalizarM = useMutation({
    mutationFn: (input: DigitalizarProntuarioInput) =>
      digitalizarProntuario(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Prontuário digitalizado',
        description: '',
      });
      setDigitalizarOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao digitalizar', showToast),
  });

  const emprestarM = useMutation({
    mutationFn: (input: CreateEmprestimoInput) => createEmprestimo(input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Empréstimo registrado',
        description: '',
      });
      setEmprestarOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao emprestar', showToast),
  });

  if (prontQuery.isLoading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }
  if (prontQuery.isError || !prontQuery.data) {
    const msg =
      prontQuery.error instanceof ApiError
        ? prontQuery.error.detail ?? prontQuery.error.message
        : 'Falha ao carregar prontuário.';
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

  const p = prontQuery.data;
  const podeDigitalizar = !p.digitalizado && p.status !== 'DESCARTADO';
  const podeEmprestar = p.status === 'ARQUIVADO';

  return (
    <section
      className="space-y-4"
      aria-label={`Detalhe do prontuário ${p.numeroPasta}`}
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
            <Archive aria-hidden="true" className="h-6 w-6" />
            Prontuário {p.numeroPasta}
          </h1>
          <p className="text-sm text-muted-foreground">
            {p.pacienteNome ?? p.pacienteUuid}
            {p.localizacao ? ` · ${p.localizacao}` : ''}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium',
            PRONTUARIO_STATUS_BADGE[p.status],
          )}
        >
          {PRONTUARIO_STATUS_LABEL[p.status]}
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!podeDigitalizar}
          onClick={() => setDigitalizarOpen(true)}
        >
          <ScanLine aria-hidden="true" />
          Digitalizar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!podeEmprestar}
          onClick={() => setEmprestarOpen(true)}
        >
          <ClipboardList aria-hidden="true" />
          Emprestar
        </Button>
        {p.pdfLegadoUrl ? (
          <a
            href={p.pdfLegadoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-accent"
          >
            <FileDown aria-hidden="true" className="h-3 w-3" />
            Ver PDF digitalizado
          </a>
        ) : null}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Histórico de empréstimos</CardTitle>
        </CardHeader>
        <CardContent>
          {emprestQuery.isLoading ? (
            <p className="flex items-center gap-2 py-2 text-sm">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Carregando...
            </p>
          ) : (emprestQuery.data?.data.length ?? 0) === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Sem empréstimos registrados.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Solicitante</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Devolver até</TableHead>
                    <TableHead>Devolvido em</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(emprestQuery.data?.data ?? []).map((e) => (
                    <TableRow key={e.uuid}>
                      <TableCell className="text-xs">
                        {e.solicitanteNome ?? e.solicitanteUuid}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs">
                        {e.motivo ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDateTime(e.dataEmprestimo)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatBR(e.dataDevolucaoPrevista)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDateTime(e.dataDevolucaoReal)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                            EMPRESTIMO_STATUS_BADGE[e.status],
                          )}
                        >
                          {EMPRESTIMO_STATUS_LABEL[e.status]}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={digitalizarOpen} onOpenChange={setDigitalizarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Digitalizar prontuário</DialogTitle>
          </DialogHeader>
          <DigitalizarForm
            pending={digitalizarM.isPending}
            onSubmit={(input) => digitalizarM.mutate(input)}
            onCancel={() => setDigitalizarOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={emprestarOpen} onOpenChange={setEmprestarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emprestar prontuário</DialogTitle>
          </DialogHeader>
          <EmprestarForm
            prontuarioUuid={uuid}
            pending={emprestarM.isPending}
            onSubmit={(input) => emprestarM.mutate(input)}
            onCancel={() => setEmprestarOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

ProntuarioDetalhePage.displayName = 'ProntuarioDetalhePage';

interface DigitalizarFormProps {
  pending: boolean;
  onSubmit: (input: DigitalizarProntuarioInput) => void;
  onCancel: () => void;
}

function DigitalizarForm({
  pending,
  onSubmit,
  onCancel,
}: DigitalizarFormProps): JSX.Element {
  const [pdfLegadoUrl, setPdfLegadoUrl] = useState('');
  const [observacao, setObservacao] = useState('');
  const valid = pdfLegadoUrl.trim().length >= 5;
  return (
    <>
      <div className="space-y-3 text-sm">
        <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-900">
          RN-SAM-03: digitalização gera PDF anexado ao paciente. Original pode
          ser descartado conforme política CFM 1.638.
        </p>
        <div className="space-y-1">
          <Label htmlFor="dig-url">URL do PDF *</Label>
          <Input
            id="dig-url"
            value={pdfLegadoUrl}
            onChange={(e) => setPdfLegadoUrl(e.target.value)}
            placeholder="https://..."
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dig-obs">Observação</Label>
          <Textarea
            id="dig-obs"
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
          onClick={() =>
            onSubmit({
              pdfLegadoUrl: pdfLegadoUrl.trim(),
              ...(observacao ? { observacao: observacao.trim() } : {}),
            })
          }
          disabled={!valid || pending}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <ScanLine aria-hidden="true" />
          )}
          Digitalizar
        </Button>
      </DialogFooter>
    </>
  );
}

interface EmprestarFormProps {
  prontuarioUuid: string;
  pending: boolean;
  onSubmit: (input: CreateEmprestimoInput) => void;
  onCancel: () => void;
}

function EmprestarForm({
  prontuarioUuid,
  pending,
  onSubmit,
  onCancel,
}: EmprestarFormProps): JSX.Element {
  const [solicitanteUuid, setSolicitanteUuid] = useState('');
  const [motivo, setMotivo] = useState('');
  const [dataDevolucaoPrevista, setDataDevolucaoPrevista] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const valid =
    solicitanteUuid.trim().length >= 8 &&
    motivo.trim().length >= 5 &&
    dataDevolucaoPrevista.length === 10;
  return (
    <>
      <div className="space-y-3 text-sm">
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          RN-SAM-01: empréstimo exige solicitante identificado e prazo.
        </p>
        <div className="space-y-1">
          <Label htmlFor="emp-sol">Solicitante (UUID) *</Label>
          <Input
            id="emp-sol"
            value={solicitanteUuid}
            onChange={(e) => setSolicitanteUuid(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="emp-mot">Motivo *</Label>
          <Textarea
            id="emp-mot"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="emp-dt">Devolver até *</Label>
          <Input
            id="emp-dt"
            type="date"
            value={dataDevolucaoPrevista}
            onChange={(e) => setDataDevolucaoPrevista(e.target.value)}
            required
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
              prontuarioUuid,
              solicitanteUuid: solicitanteUuid.trim(),
              motivo: motivo.trim(),
              dataDevolucaoPrevista,
            })
          }
          disabled={!valid || pending}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Registrar empréstimo
        </Button>
      </DialogFooter>
    </>
  );
}
