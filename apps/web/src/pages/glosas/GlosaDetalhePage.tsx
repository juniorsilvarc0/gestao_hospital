/**
 * GlosaDetalhePage — detalhe + recurso + finalização de uma glosa.
 *
 * Mostra dados da glosa, recurso (se cadastrado), resposta (se finalizada).
 * Botões contextuais:
 *   - "Cadastrar Recurso" — disponível em RECEBIDA / EM_ANALISE / EM_RECURSO.
 *   - "Finalizar"          — disponível em EM_RECURSO ou EM_ANALISE.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  FileWarning,
  Loader2,
  Save,
  Send,
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
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  createRecursoGlosa,
  finalizarGlosa,
  getGlosa,
} from '@/lib/glosas-api';
import { useToast } from '@/components/Toast';
import {
  GLOSA_ORIGEM_LABEL,
  GLOSA_STATUS_BADGE,
  GLOSA_STATUS_LABEL,
  type FinalizarGlosaInput,
  type Glosa,
} from '@/types/glosas';
import { cn } from '@/lib/utils';

function formatBR(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
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

export function GlosaDetalhePage(): JSX.Element {
  const { uuid = '' } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [recursoOpen, setRecursoOpen] = useState(false);
  const [finalizarOpen, setFinalizarOpen] = useState(false);

  const glosaQuery = useQuery({
    queryKey: ['glosa', uuid],
    queryFn: () => getGlosa(uuid),
    enabled: Boolean(uuid),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['glosa', uuid] });
  }

  const recursoM = useMutation({
    mutationFn: (input: { recurso: string; recursoDocumentoUrl?: string }) =>
      createRecursoGlosa(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Recurso cadastrado',
        description: '',
      });
      setRecursoOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao cadastrar recurso', showToast),
  });

  const finalizarM = useMutation({
    mutationFn: (input: FinalizarGlosaInput) => finalizarGlosa(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Glosa finalizada',
        description: '',
      });
      setFinalizarOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao finalizar glosa', showToast),
  });

  if (glosaQuery.isLoading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (glosaQuery.isError || !glosaQuery.data) {
    const msg =
      glosaQuery.error instanceof ApiError
        ? glosaQuery.error.detail ?? glosaQuery.error.message
        : 'Falha ao carregar glosa.';
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

  const glosa = glosaQuery.data;
  const podeRecurso =
    glosa.status === 'RECEBIDA' ||
    glosa.status === 'EM_ANALISE' ||
    glosa.status === 'EM_RECURSO';
  const podeFinalizar =
    glosa.status === 'EM_RECURSO' || glosa.status === 'EM_ANALISE';

  return (
    <section
      className="space-y-4"
      aria-label={`Detalhe da glosa da conta ${glosa.contaNumero}`}
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
            <FileWarning aria-hidden="true" className="h-6 w-6" />
            Glosa · Conta {glosa.contaNumero}
          </h1>
          <p className="text-sm text-muted-foreground">
            {glosa.convenioNome ?? glosa.convenioUuid}
            {glosa.pacienteNome ? ` · ${glosa.pacienteNome}` : ''}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium',
            GLOSA_STATUS_BADGE[glosa.status],
          )}
        >
          {GLOSA_STATUS_LABEL[glosa.status]}
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!podeRecurso}
          onClick={() => setRecursoOpen(true)}
        >
          <Send aria-hidden="true" />
          Cadastrar Recurso
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!podeFinalizar}
          onClick={() => setFinalizarOpen(true)}
        >
          <CheckCircle2 aria-hidden="true" />
          Finalizar
        </Button>
        <Link
          to={`/contas/${glosa.contaUuid}`}
          className="text-xs underline-offset-2 hover:underline"
        >
          Ver conta vinculada
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Identificação</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <Item label="Data da glosa" value={formatBR(glosa.dataGlosa)} />
            <Item label="Prazo de recurso" value={formatBR(glosa.prazoRecurso)} />
            <Item
              label="Origem"
              value={GLOSA_ORIGEM_LABEL[glosa.origem]}
            />
            <Item
              label="Código TISS"
              value={glosa.codigoGlosaTiss ?? '—'}
              mono
            />
            <Item label="Valor glosado" value={formatMoney(glosa.valorGlosado)} />
            <Item
              label="Valor revertido"
              value={formatMoney(glosa.valorRevertido)}
            />
            <Item
              label="Item da conta"
              value={glosa.contaItemDescricao ?? glosa.contaItemUuid ?? '—'}
            />
            <Item
              label="Guia TISS"
              value={glosa.guiaTissNumero ?? glosa.guiaTissUuid ?? '—'}
            />
          </dl>
          <div className="mt-3 rounded-md border bg-muted/40 p-2 text-xs">
            <strong>Motivo:</strong> {glosa.motivo}
          </div>
        </CardContent>
      </Card>

      {glosa.recurso ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recurso interposto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <p>
              <strong>Data:</strong> {formatBR(glosa.dataRecurso)}
            </p>
            {glosa.recursoDocumentoUrl ? (
              <p>
                <strong>Documento:</strong>{' '}
                <a
                  href={glosa.recursoDocumentoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  abrir
                </a>
              </p>
            ) : null}
            <div className="rounded-md border bg-muted/40 p-2">
              <strong>Argumentação:</strong>
              <p className="mt-1 whitespace-pre-line">{glosa.recurso}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {glosa.dataRespostaRecurso ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Resposta da operadora</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <p>
              <strong>Data:</strong> {formatBR(glosa.dataRespostaRecurso)}
            </p>
            <p>
              <strong>Resultado:</strong> {GLOSA_STATUS_LABEL[glosa.status]}
            </p>
            {glosa.motivoResposta ? (
              <div className="rounded-md border bg-muted/40 p-2">
                <strong>Motivo da resposta:</strong>
                <p className="mt-1 whitespace-pre-line">
                  {glosa.motivoResposta}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={recursoOpen} onOpenChange={setRecursoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar recurso</DialogTitle>
          </DialogHeader>
          <RecursoForm
            pending={recursoM.isPending}
            onSubmit={(input) => recursoM.mutate(input)}
            onCancel={() => setRecursoOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={finalizarOpen} onOpenChange={setFinalizarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar glosa</DialogTitle>
          </DialogHeader>
          <FinalizarForm
            glosa={glosa}
            pending={finalizarM.isPending}
            onSubmit={(input) => finalizarM.mutate(input)}
            onCancel={() => setFinalizarOpen(false)}
          />
        </DialogContent>
      </Dialog>
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
          mono ? 'font-mono text-[11px]' : '',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

interface RecursoFormProps {
  pending: boolean;
  onSubmit: (input: { recurso: string; recursoDocumentoUrl?: string }) => void;
  onCancel: () => void;
}

function RecursoForm({
  pending,
  onSubmit,
  onCancel,
}: RecursoFormProps): JSX.Element {
  const [recurso, setRecurso] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const valid = recurso.trim().length >= 10;

  return (
    <>
      <div className="space-y-3 text-sm">
        <div className="space-y-1">
          <Label htmlFor="rec-arg">Argumentação do recurso *</Label>
          <Textarea
            id="rec-arg"
            value={recurso}
            onChange={(e) => setRecurso(e.target.value)}
            rows={6}
            placeholder="Justifique tecnicamente a contestação."
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rec-doc">URL do documento de apoio</Label>
          <Input
            id="rec-doc"
            value={docUrl}
            onChange={(e) => setDocUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() =>
            onSubmit({
              recurso: recurso.trim(),
              ...(docUrl ? { recursoDocumentoUrl: docUrl } : {}),
            })
          }
          disabled={!valid || pending}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Cadastrar recurso
        </Button>
      </DialogFooter>
    </>
  );
}

interface FinalizarFormProps {
  glosa: Glosa;
  pending: boolean;
  onSubmit: (input: FinalizarGlosaInput) => void;
  onCancel: () => void;
}

function FinalizarForm({
  glosa,
  pending,
  onSubmit,
  onCancel,
}: FinalizarFormProps): JSX.Element {
  const [status, setStatus] = useState<FinalizarGlosaInput['status']>(
    'REVERTIDA',
  );
  const [valorRevertido, setValorRevertido] = useState(
    String(glosa.valorGlosado),
  );
  const [motivoResposta, setMotivoResposta] = useState('');

  const valor = Number(valorRevertido);
  const valid =
    status === 'REVERTIDA'
      ? Number.isFinite(valor) && valor >= 0 && valor <= Number(glosa.valorGlosado)
      : true;

  function handleSubmit(): void {
    onSubmit({
      status,
      ...(status === 'REVERTIDA' && Number.isFinite(valor)
        ? { valorRevertido: valor }
        : {}),
      ...(motivoResposta ? { motivoResposta } : {}),
    });
  }

  return (
    <>
      <div className="space-y-3 text-sm">
        <div className="space-y-1">
          <Label htmlFor="fin-status">Resultado *</Label>
          <Select
            id="fin-status"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as FinalizarGlosaInput['status'])
            }
          >
            <option key="rev" value="REVERTIDA">Revertida (operadora aceitou)</option>
            <option key="aca" value="ACATADA">Acatada (recurso negado)</option>
            <option key="per" value="PERDA_DEFINITIVA">Perda definitiva</option>
          </Select>
        </div>
        {status === 'REVERTIDA' ? (
          <div className="space-y-1">
            <Label htmlFor="fin-valor">Valor revertido *</Label>
            <Input
              id="fin-valor"
              type="number"
              min="0"
              step="0.01"
              max={Number(glosa.valorGlosado)}
              value={valorRevertido}
              onChange={(e) => setValorRevertido(e.target.value)}
              required
            />
            <p className="text-[10px] text-muted-foreground">
              Máximo glosado: {formatMoney(glosa.valorGlosado)}
            </p>
          </div>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="fin-mot">Motivo da resposta</Label>
          <Textarea
            id="fin-mot"
            value={motivoResposta}
            onChange={(e) => setMotivoResposta(e.target.value)}
            rows={3}
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
            <CheckCircle2 aria-hidden="true" />
          )}
          Finalizar
        </Button>
      </DialogFooter>
    </>
  );
}

GlosaDetalhePage.displayName = 'GlosaDetalhePage';
