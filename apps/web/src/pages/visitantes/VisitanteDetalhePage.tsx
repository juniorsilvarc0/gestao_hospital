/**
 * VisitanteDetalhePage — detalhe do visitante (Fase 10).
 *
 * Mostra dados (CPF mascarado), histórico de visitas, e botões
 * Bloquear/Desbloquear (RN-VIS-03).
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  ShieldCheck,
  ShieldOff,
  Users,
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
  bloquearVisitante,
  desbloquearVisitante,
  getVisitante,
  listVisitas,
} from '@/lib/visitantes-api';
import { useToast } from '@/components/Toast';
import type { BloquearVisitanteInput } from '@/types/visitantes';

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

export function VisitanteDetalhePage(): JSX.Element {
  const { uuid = '' } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [bloquearOpen, setBloquearOpen] = useState(false);

  const visQuery = useQuery({
    queryKey: ['visitante', uuid],
    queryFn: () => getVisitante(uuid),
    enabled: Boolean(uuid),
  });

  const visitasQuery = useQuery({
    queryKey: ['visitas', 'do-visitante', uuid],
    queryFn: () => listVisitas({ visitanteUuid: uuid, pageSize: 50 }),
    enabled: Boolean(uuid),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['visitante', uuid] });
    void queryClient.invalidateQueries({ queryKey: ['visitantes', 'list'] });
  }

  const bloquearM = useMutation({
    mutationFn: (input: BloquearVisitanteInput) =>
      bloquearVisitante(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Visitante bloqueado',
        description: '',
      });
      setBloquearOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao bloquear', showToast),
  });

  const desbloquearM = useMutation({
    mutationFn: () => desbloquearVisitante(uuid),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Visitante desbloqueado',
        description: '',
      });
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao desbloquear', showToast),
  });

  if (visQuery.isLoading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (visQuery.isError || !visQuery.data) {
    const msg =
      visQuery.error instanceof ApiError
        ? visQuery.error.detail ?? visQuery.error.message
        : 'Falha ao carregar visitante.';
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

  const v = visQuery.data;

  return (
    <section className="space-y-4" aria-label={`Visitante ${v.nome}`}>
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
            <Users aria-hidden="true" className="h-6 w-6" />
            {v.nome}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            {v.cpfMascarado}
          </p>
        </div>
        {v.bloqueado ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-3 py-1 text-xs font-medium text-red-900">
            <ShieldOff aria-hidden="true" className="h-3 w-3" />
            Bloqueado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900">
            <ShieldCheck aria-hidden="true" className="h-3 w-3" />
            Liberado
          </span>
        )}
      </header>

      {v.documentoFotoUrl ? (
        <a
          href={v.documentoFotoUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary underline-offset-2 hover:underline"
        >
          Ver foto do documento
        </a>
      ) : null}

      {v.bloqueado && v.motivoBloqueio ? (
        <Card className="border-red-300">
          <CardHeader className="pb-1">
            <CardTitle className="text-[11px] uppercase tracking-wide text-red-700">
              Motivo do bloqueio
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1 space-y-1 text-xs">
            <p>{v.motivoBloqueio}</p>
            {v.bloqueadoEm ? (
              <p className="text-muted-foreground">
                Desde {formatDateTime(v.bloqueadoEm)}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {v.bloqueado ? (
          <Button
            type="button"
            size="sm"
            disabled={desbloquearM.isPending}
            onClick={() => desbloquearM.mutate()}
          >
            {desbloquearM.isPending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck aria-hidden="true" />
            )}
            Desbloquear
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setBloquearOpen(true)}
          >
            <ShieldOff aria-hidden="true" />
            Bloquear
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Histórico de visitas</CardTitle>
        </CardHeader>
        <CardContent>
          {visitasQuery.isLoading ? (
            <p className="flex items-center gap-2 py-2 text-sm">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Carregando...
            </p>
          ) : (visitasQuery.data?.data.length ?? 0) === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Sem visitas registradas.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Leito</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead>Saída</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(visitasQuery.data?.data ?? []).map((vi) => (
                    <TableRow key={vi.uuid}>
                      <TableCell className="text-xs">
                        {vi.pacienteNome ?? vi.pacienteUuid}
                      </TableCell>
                      <TableCell className="text-xs">
                        {vi.leitoNumero ?? vi.leitoUuid ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDateTime(vi.dataEntrada)}
                      </TableCell>
                      <TableCell
                        className={`text-xs ${
                          vi.dataSaida ? '' : 'font-semibold text-emerald-700'
                        }`}
                      >
                        {vi.dataSaida ? formatDateTime(vi.dataSaida) : 'em andamento'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={bloquearOpen} onOpenChange={setBloquearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear visitante (RN-VIS-03)</DialogTitle>
          </DialogHeader>
          <BloquearForm
            pending={bloquearM.isPending}
            onSubmit={(motivo) => bloquearM.mutate({ motivo })}
            onCancel={() => setBloquearOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

VisitanteDetalhePage.displayName = 'VisitanteDetalhePage';

interface BloquearFormProps {
  pending: boolean;
  onSubmit: (motivo: string) => void;
  onCancel: () => void;
}

function BloquearForm({
  pending,
  onSubmit,
  onCancel,
}: BloquearFormProps): JSX.Element {
  const [motivo, setMotivo] = useState('');
  const valid = motivo.trim().length >= 5;
  return (
    <>
      <div className="space-y-1 text-sm">
        <p className="rounded-md bg-red-50 p-2 text-xs text-red-900">
          Visitante bloqueado não pode entrar mesmo com paciente internado.
        </p>
        <Label htmlFor="bloq-motivo">Motivo *</Label>
        <Textarea
          id="bloq-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={4}
          minLength={5}
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
            <ShieldOff aria-hidden="true" />
          )}
          Bloquear
        </Button>
      </DialogFooter>
    </>
  );
}
