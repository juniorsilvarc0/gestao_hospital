/**
 * LotesTissPage — listagem dos lotes TISS.
 *
 * Filtros: convênio (UUID), competência (YYYY-MM), status.
 * Ações por lote: Ver / Validar / Enviar / Reenviar / Registrar Protocolo.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Eye,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  StickyNote,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  enviarLote,
  listLotes,
  reenviarLote,
  registrarProtocoloLote,
  validarLote,
} from '@/lib/tiss-api';
import { useToast } from '@/components/Toast';
import {
  TISS_LOTE_STATUSES,
  TISS_LOTE_STATUS_BADGE,
  TISS_LOTE_STATUS_LABEL,
  type TissLoteStatus,
} from '@/types/tiss';
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

export function LotesTissPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [convenioUuid, setConvenioUuid] = useState('');
  const [competencia, setCompetencia] = useState('');
  const [status, setStatus] = useState<'TODOS' | TissLoteStatus>('TODOS');
  const [page, setPage] = useState(1);

  const [protocoloOpen, setProtocoloOpen] = useState(false);
  const [protocoloLoteUuid, setProtocoloLoteUuid] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      ...(convenioUuid ? { convenioUuid } : {}),
      ...(competencia ? { competencia } : {}),
      ...(status !== 'TODOS' ? { status } : {}),
      page,
      pageSize: 20,
    }),
    [convenioUuid, competencia, status, page],
  );

  const lotesQuery = useQuery({
    queryKey: ['tiss', 'lotes', params],
    queryFn: () => listLotes(params),
    staleTime: 10_000,
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['tiss', 'lotes'] });
  }

  const validarM = useMutation({
    mutationFn: (uuid: string) => validarLote(uuid),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Lote validado',
        description: '',
      });
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao validar lote', showToast),
  });

  const enviarM = useMutation({
    mutationFn: (uuid: string) => enviarLote(uuid),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Lote enviado',
        description: '',
      });
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao enviar lote', showToast),
  });

  const reenviarM = useMutation({
    mutationFn: (uuid: string) => reenviarLote(uuid),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Reenvio gerado',
        description: 'Novo lote criado referenciando o anterior.',
      });
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao reenviar lote', showToast),
  });

  const protocoloM = useMutation({
    mutationFn: ({
      uuid,
      protocolo,
    }: {
      uuid: string;
      protocolo: string;
    }) =>
      registrarProtocoloLote(uuid, {
        protocoloOperadora: protocolo,
      }),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Protocolo registrado',
        description: '',
      });
      setProtocoloOpen(false);
      setProtocoloLoteUuid(null);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao registrar protocolo', showToast),
  });

  const lotes = lotesQuery.data?.data ?? [];
  const meta = lotesQuery.data?.meta;

  return (
    <section className="space-y-4" aria-label="Lotes TISS">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Send aria-hidden="true" className="h-6 w-6" />
            Lotes TISS
          </h1>
          <p className="text-sm text-muted-foreground">
            Geração e envio de lotes para operadoras (XML validado contra XSD
            ANS).
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={invalidate}
        >
          <RefreshCw aria-hidden="true" />
          Atualizar
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="lote-conv">Convênio (UUID)</Label>
              <Input
                id="lote-conv"
                value={convenioUuid}
                onChange={(e) => {
                  setConvenioUuid(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lote-comp">Competência (AAAA-MM)</Label>
              <Input
                id="lote-comp"
                value={competencia}
                onChange={(e) => {
                  setCompetencia(e.target.value);
                  setPage(1);
                }}
                placeholder="2026-04"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lote-status">Status</Label>
              <Select
                id="lote-status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as 'TODOS' | TissLoteStatus);
                  setPage(1);
                }}
              >
                <option value="TODOS">Todos</option>
                {TISS_LOTE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TISS_LOTE_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="lotes-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Convênio</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead>Versão</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Guias</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Geração</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lotesQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-6 text-center text-sm">
                  <Loader2
                    aria-hidden="true"
                    className="mr-2 inline h-4 w-4 animate-spin"
                  />
                  Carregando...
                </TableCell>
              </TableRow>
            ) : lotes.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  Nenhum lote para os filtros.
                </TableCell>
              </TableRow>
            ) : (
              lotes.map((l) => {
                const podeValidar =
                  l.status === 'EM_PREPARACAO' || l.status === 'COM_ERRO';
                const podeEnviar = l.status === 'VALIDADO';
                const podeReenviar = l.status === 'PROCESSADO';
                const podeProtocolo = l.status === 'ENVIADO';
                return (
                  <TableRow key={l.uuid} data-testid={`lote-row-${l.uuid}`}>
                    <TableCell className="text-xs font-medium">
                      {l.numero}
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.convenioNome ?? l.convenioUuid}
                    </TableCell>
                    <TableCell className="text-xs">{l.competencia}</TableCell>
                    <TableCell className="text-xs">{l.versaoTiss}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          TISS_LOTE_STATUS_BADGE[l.status],
                        )}
                      >
                        {TISS_LOTE_STATUS_LABEL[l.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {l.qtdGuias}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatMoney(l.valorTotal)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatBR(l.dataGeracao)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label={`Ver lote ${l.numero}`}
                          onClick={() => navigate(`/tiss/lotes/${l.uuid}`)}
                        >
                          <Eye aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            !podeValidar ||
                            (validarM.isPending &&
                              validarM.variables === l.uuid)
                          }
                          onClick={() => validarM.mutate(l.uuid)}
                          aria-label={`Validar lote ${l.numero}`}
                        >
                          <ShieldCheck aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            !podeEnviar ||
                            (enviarM.isPending &&
                              enviarM.variables === l.uuid)
                          }
                          onClick={() => enviarM.mutate(l.uuid)}
                          aria-label={`Enviar lote ${l.numero}`}
                        >
                          <Send aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!podeReenviar || reenviarM.isPending}
                          onClick={() => reenviarM.mutate(l.uuid)}
                          aria-label={`Reenviar lote ${l.numero}`}
                        >
                          <RefreshCw aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!podeProtocolo}
                          onClick={() => {
                            setProtocoloLoteUuid(l.uuid);
                            setProtocoloOpen(true);
                          }}
                          aria-label={`Registrar protocolo do lote ${l.numero}`}
                        >
                          <StickyNote aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 ? (
        <footer className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Página {meta.page} de {meta.totalPages} · {meta.total} lotes
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
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.totalPages}
            >
              Próxima
            </Button>
          </div>
        </footer>
      ) : null}

      <Dialog
        open={protocoloOpen}
        onOpenChange={(o) => {
          setProtocoloOpen(o);
          if (!o) setProtocoloLoteUuid(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar protocolo da operadora</DialogTitle>
          </DialogHeader>
          <ProtocoloForm
            pending={protocoloM.isPending}
            onSubmit={(p) => {
              if (protocoloLoteUuid) {
                protocoloM.mutate({ uuid: protocoloLoteUuid, protocolo: p });
              }
            }}
            onCancel={() => {
              setProtocoloOpen(false);
              setProtocoloLoteUuid(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

interface ProtocoloFormProps {
  pending: boolean;
  onSubmit: (protocolo: string) => void;
  onCancel: () => void;
}

function ProtocoloForm({
  pending,
  onSubmit,
  onCancel,
}: ProtocoloFormProps): JSX.Element {
  const [protocolo, setProtocolo] = useState('');
  const valid = protocolo.trim().length > 0;
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="proto-input">Protocolo *</Label>
        <Input
          id="proto-input"
          value={protocolo}
          onChange={(e) => setProtocolo(e.target.value)}
          placeholder="Número devolvido pela operadora"
          required
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => onSubmit(protocolo.trim())}
          disabled={!valid || pending}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 aria-hidden="true" />
          )}
          Registrar
        </Button>
      </DialogFooter>
    </>
  );
}

LotesTissPage.displayName = 'LotesTissPage';
