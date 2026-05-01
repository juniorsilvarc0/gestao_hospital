/**
 * AgendaCirurgiasPage — listagem paginada de cirurgias com filtros.
 *
 * Filtros: data range, sala (UUID), cirurgião (UUID), status.
 * Ações por linha: ver detalhe, editar (próx fase), cancelar.
 * Botão "Agendar nova cirurgia" → `/cirurgias/nova`.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
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
  cancelarCirurgia,
  listCirurgias,
} from '@/lib/centro-cirurgico-api';
import { useToast } from '@/components/Toast';
import {
  CIRURGIA_STATUSES,
  CIRURGIA_STATUS_COLOR,
  CIRURGIA_STATUS_LABEL,
  type CirurgiaResumo,
  type CirurgiaStatus,
} from '@/types/centro-cirurgico';

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function AgendaCirurgiasPage(): JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { show: showToast } = useToast();

  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [salaUuid, setSalaUuid] = useState('');
  const [cirurgiaoUuid, setCirurgiaoUuid] = useState('');
  const [status, setStatus] = useState<'TODOS' | CirurgiaStatus>('TODOS');
  const [page, setPage] = useState(1);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cirurgiaSelecionada, setCirurgiaSelecionada] =
    useState<CirurgiaResumo | null>(null);

  const cirurgiasQuery = useQuery({
    queryKey: [
      'cirurgias',
      {
        dataInicio,
        dataFim,
        salaUuid,
        cirurgiaoUuid,
        status,
        page,
      },
    ],
    queryFn: () =>
      listCirurgias({
        ...(dataInicio ? { dataInicio } : {}),
        ...(dataFim ? { dataFim } : {}),
        ...(salaUuid ? { salaUuid } : {}),
        ...(cirurgiaoUuid ? { cirurgiaoUuid } : {}),
        ...(status !== 'TODOS' ? { status } : {}),
        page,
        pageSize: 25,
      }),
    staleTime: 10_000,
  });

  const cancelarMutation = useMutation({
    mutationFn: ({ uuid, motivo }: { uuid: string; motivo: string }) =>
      cancelarCirurgia(uuid, { motivo }),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Cirurgia cancelada',
        description: '',
      });
      setCancelOpen(false);
      setCirurgiaSelecionada(null);
      void queryClient.invalidateQueries({ queryKey: ['cirurgias'] });
    },
    onError: (err) => {
      const detail =
        err instanceof ApiError
          ? err.detail ?? err.title ?? err.message
          : err instanceof Error
            ? err.message
            : 'Erro.';
      showToast({
        variant: 'destructive',
        title: 'Falha ao cancelar',
        description: detail,
      });
    },
  });

  const linhas = useMemo(
    () => cirurgiasQuery.data?.data ?? [],
    [cirurgiasQuery.data],
  );
  const meta = cirurgiasQuery.data?.meta;

  return (
    <section className="space-y-4" aria-label="Agenda de cirurgias">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ClipboardList aria-hidden="true" className="h-6 w-6" />
            Agenda de cirurgias
          </h1>
          <p className="text-sm text-muted-foreground">
            Lista paginada de cirurgias com filtros operacionais.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ['cirurgias'] })
            }
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => navigate('/cirurgias/nova')}
          >
            <Plus aria-hidden="true" />
            Agendar nova cirurgia
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              void queryClient.invalidateQueries({ queryKey: ['cirurgias'] });
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="filtro-dini">Data início</Label>
              <Input
                id="filtro-dini"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-dfim">Data fim</Label>
              <Input
                id="filtro-dfim"
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-sala">Sala (UUID)</Label>
              <Input
                id="filtro-sala"
                value={salaUuid}
                onChange={(e) => setSalaUuid(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-cir">Cirurgião (UUID)</Label>
              <Input
                id="filtro-cir"
                value={cirurgiaoUuid}
                onChange={(e) => setCirurgiaoUuid(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-status">Status</Label>
              <Select
                id="filtro-status"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as 'TODOS' | CirurgiaStatus)
                }
              >
                <option value="TODOS">Todos</option>
                {CIRURGIA_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CIRURGIA_STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2 lg:col-span-5">
              <Button type="submit" size="sm">
                Aplicar filtros
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="agenda-cirurgias-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Início previsto</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Procedimento</TableHead>
              <TableHead>Sala</TableHead>
              <TableHead>Cirurgião</TableHead>
              <TableHead>Classif.</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cirurgiasQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-6 text-center text-sm">
                  <Loader2
                    aria-hidden="true"
                    className="mr-2 inline h-4 w-4 animate-spin"
                  />
                  Carregando...
                </TableCell>
              </TableRow>
            ) : linhas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  Nenhuma cirurgia encontrada para os filtros.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((c) => (
                <TableRow
                  key={c.uuid}
                  data-testid={`linha-cirurgia-${c.uuid}`}
                >
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatDateTime(c.inicioPrevisto)}
                  </TableCell>
                  <TableCell className="text-xs font-medium">
                    {c.pacienteNome}
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.procedimentoPrincipalNome}
                  </TableCell>
                  <TableCell className="text-xs">{c.salaNome}</TableCell>
                  <TableCell className="text-xs">{c.cirurgiaoNome}</TableCell>
                  <TableCell className="text-xs">{c.classificacao}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${CIRURGIA_STATUS_COLOR[c.status].badge}`}
                    >
                      {CIRURGIA_STATUS_LABEL[c.status]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/cirurgias/${c.uuid}`)}
                        aria-label={`Ver cirurgia de ${c.pacienteNome}`}
                      >
                        <Eye aria-hidden="true" />
                      </Button>
                      {!['CANCELADA', 'CONCLUIDA'].includes(c.status) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCirurgiaSelecionada(c);
                            setCancelOpen(true);
                          }}
                          aria-label={`Cancelar cirurgia de ${c.pacienteNome}`}
                        >
                          <X aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 ? (
        <footer className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Página {meta.page} de {meta.totalPages} · {meta.total} cirurgias
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

      <CancelarDialog
        open={cancelOpen}
        cirurgia={cirurgiaSelecionada}
        onOpenChange={(o) => {
          setCancelOpen(o);
          if (!o) setCirurgiaSelecionada(null);
        }}
        onConfirm={(motivo) =>
          cirurgiaSelecionada
            ? cancelarMutation.mutate({
                uuid: cirurgiaSelecionada.uuid,
                motivo,
              })
            : undefined
        }
        pending={cancelarMutation.isPending}
      />
    </section>
  );
}

interface CancelarDialogProps {
  open: boolean;
  cirurgia: CirurgiaResumo | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (motivo: string) => void;
  pending: boolean;
}

function CancelarDialog({
  open,
  cirurgia,
  onOpenChange,
  onConfirm,
  pending,
}: CancelarDialogProps): JSX.Element | null {
  const [motivo, setMotivo] = useState('');
  if (!cirurgia) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar cirurgia</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            Cancelar cirurgia de <strong>{cirurgia.pacienteNome}</strong>?
          </p>
          <div className="space-y-1">
            <Label htmlFor="cancel-motivo">Motivo *</Label>
            <Textarea
              id="cancel-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Justifique o cancelamento (RN-CC-07)"
              required
              minLength={5}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Manter
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(motivo.trim())}
            disabled={pending || motivo.trim().length < 5}
          >
            {pending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <X aria-hidden="true" />
            )}
            Confirmar cancelamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
