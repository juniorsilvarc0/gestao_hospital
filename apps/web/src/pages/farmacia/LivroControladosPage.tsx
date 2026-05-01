/**
 * LivroControladosPage — livro de controlados (Portaria 344/SVS-MS).
 *
 * Filtros: procedimento (UUID), data início/fim, lote, tipo de movimento.
 * Tabela: data_hora · procedimento · lote · tipo · qtd · saldo anterior →
 *         saldo atual · paciente · farmacêutico.
 *
 * Botão "Lançar movimento" abre Dialog para registrar entrada / saída /
 * ajuste / perda manual (RN-FAR-05).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Loader2, Plus, RefreshCw } from 'lucide-react';
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
  getLivroControlados,
  lancarMovimentoControlado,
} from '@/lib/farmacia-api';
import { useToast } from '@/components/Toast';
import {
  LIVRO_TIPOS_MOVIMENTO,
  type LivroTipoMovimento,
} from '@/types/farmacia';

const TIPO_LABEL: Record<LivroTipoMovimento, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
  PERDA: 'Perda',
};

const TIPO_BADGE: Record<LivroTipoMovimento, string> = {
  ENTRADA: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  SAIDA: 'bg-blue-100 text-blue-900 border-blue-300',
  AJUSTE: 'bg-amber-100 text-amber-900 border-amber-300',
  PERDA: 'bg-red-100 text-red-900 border-red-300',
};

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function LivroControladosPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [procedimentoUuid, setProcedimentoUuid] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [lote, setLote] = useState('');
  const [tipoMovimento, setTipoMovimento] = useState<
    'TODOS' | LivroTipoMovimento
  >('TODOS');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);

  const livroQuery = useQuery({
    queryKey: [
      'farmacia',
      'livro-controlados',
      {
        procedimentoUuid,
        dataInicio,
        dataFim,
        lote,
        tipoMovimento,
        page,
      },
    ],
    queryFn: () =>
      getLivroControlados({
        ...(procedimentoUuid ? { procedimentoUuid } : {}),
        ...(dataInicio ? { dataInicio } : {}),
        ...(dataFim ? { dataFim } : {}),
        ...(lote ? { lote } : {}),
        ...(tipoMovimento !== 'TODOS' ? { tipoMovimento } : {}),
        page,
        pageSize: 50,
      }),
    staleTime: 10_000,
  });

  const lancarMutation = useMutation({
    mutationFn: lancarMovimentoControlado,
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Movimento lançado',
        description: 'Saldo atualizado.',
      });
      setCreateOpen(false);
      void queryClient.invalidateQueries({
        queryKey: ['farmacia', 'livro-controlados'],
      });
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
        title: 'Falha ao lançar movimento',
        description: detail,
      });
    },
  });

  const linhas = useMemo(() => livroQuery.data?.data ?? [], [livroQuery.data]);
  const meta = livroQuery.data?.meta;

  return (
    <section className="space-y-4" aria-label="Livro de controlados">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <BookOpen aria-hidden="true" className="h-6 w-6" />
            Livro de controlados
          </h1>
          <p className="text-sm text-muted-foreground">
            Movimentações por procedimento e lote — Portaria 344/SVS-MS.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ['farmacia', 'livro-controlados'],
              })
            }
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            <Plus aria-hidden="true" />
            Lançar movimento
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
              void queryClient.invalidateQueries({
                queryKey: ['farmacia', 'livro-controlados'],
              });
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="filtro-proc">Procedimento (UUID)</Label>
              <Input
                id="filtro-proc"
                value={procedimentoUuid}
                onChange={(e) => setProcedimentoUuid(e.target.value)}
                placeholder="uuid"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-lote">Lote</Label>
              <Input
                id="filtro-lote"
                value={lote}
                onChange={(e) => setLote(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-data-ini">Data início</Label>
              <Input
                id="filtro-data-ini"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-data-fim">Data fim</Label>
              <Input
                id="filtro-data-fim"
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-tipo">Tipo</Label>
              <Select
                id="filtro-tipo"
                value={tipoMovimento}
                onChange={(e) =>
                  setTipoMovimento(
                    e.target.value as 'TODOS' | LivroTipoMovimento,
                  )
                }
              >
                <option value="TODOS">Todos</option>
                {LIVRO_TIPOS_MOVIMENTO.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_LABEL[t]}
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
        <Table data-testid="livro-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Procedimento</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Saldo ant.</TableHead>
              <TableHead className="text-right">Saldo atual</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Farmacêutico</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {livroQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-6 text-center text-sm">
                  <Loader2
                    aria-hidden="true"
                    className="mr-2 inline h-4 w-4 animate-spin"
                  />
                  Carregando...
                </TableCell>
              </TableRow>
            ) : linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum movimento para os filtros.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((l) => (
                <TableRow key={l.uuid}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatDateTime(l.dataHora)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {l.procedimentoNome ?? l.procedimentoUuid}
                  </TableCell>
                  <TableCell className="text-xs">{l.lote}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${TIPO_BADGE[l.tipoMovimento]}`}
                    >
                      {TIPO_LABEL[l.tipoMovimento]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {l.quantidade}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {l.saldoAnterior}
                  </TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums">
                    {l.saldoAtual}
                  </TableCell>
                  <TableCell className="text-xs">
                    {l.pacienteNome ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {l.farmaceuticoNome ?? l.farmaceuticoUuid}
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
            Página {meta.page} de {meta.totalPages} · {meta.total} movimentos
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

      <LancarMovimentoDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onConfirm={(input) => lancarMutation.mutate(input)}
        pending={lancarMutation.isPending}
      />
    </section>
  );
}

interface LancarMovimentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: {
    procedimentoUuid: string;
    lote: string;
    quantidade: number;
    tipoMovimento: LivroTipoMovimento;
    saldoAtualAjuste?: number;
    pacienteUuid?: string;
    observacao?: string;
  }) => void;
  pending: boolean;
}

function LancarMovimentoDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: LancarMovimentoDialogProps): JSX.Element {
  const [procedimento, setProcedimento] = useState('');
  const [lote, setLote] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [tipo, setTipo] = useState<LivroTipoMovimento>('ENTRADA');
  const [saldoAjuste, setSaldoAjuste] = useState('');
  const [paciente, setPaciente] = useState('');
  const [observacao, setObservacao] = useState('');

  function handleSubmit(): void {
    const qtd = Number(quantidade);
    if (
      !procedimento ||
      !lote ||
      !Number.isFinite(qtd) ||
      qtd <= 0
    ) {
      return;
    }
    const ajuste = Number(saldoAjuste);
    onConfirm({
      procedimentoUuid: procedimento,
      lote,
      quantidade: qtd,
      tipoMovimento: tipo,
      ...(tipo === 'AJUSTE' && Number.isFinite(ajuste) && ajuste >= 0
        ? { saldoAtualAjuste: ajuste }
        : {}),
      ...(paciente ? { pacienteUuid: paciente } : {}),
      ...(observacao ? { observacao } : {}),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lançar movimento no livro</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label htmlFor="mov-tipo">Tipo *</Label>
            <Select
              id="mov-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as LivroTipoMovimento)}
            >
              {LIVRO_TIPOS_MOVIMENTO.map((t) => (
                <option key={t} value={t}>
                  {TIPO_LABEL[t]}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="mov-proc">Procedimento (UUID) *</Label>
            <Input
              id="mov-proc"
              value={procedimento}
              onChange={(e) => setProcedimento(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="mov-lote">Lote *</Label>
              <Input
                id="mov-lote"
                value={lote}
                onChange={(e) => setLote(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mov-qtd">Quantidade *</Label>
              <Input
                id="mov-qtd"
                type="number"
                min="0"
                step="0.000001"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                required
              />
            </div>
          </div>

          {tipo === 'AJUSTE' ? (
            <div className="space-y-1">
              <Label htmlFor="mov-saldo">Saldo final (após ajuste) *</Label>
              <Input
                id="mov-saldo"
                type="number"
                min="0"
                step="0.000001"
                value={saldoAjuste}
                onChange={(e) => setSaldoAjuste(e.target.value)}
              />
            </div>
          ) : null}

          {tipo === 'SAIDA' ? (
            <div className="space-y-1">
              <Label htmlFor="mov-paciente">Paciente (UUID)</Label>
              <Input
                id="mov-paciente"
                value={paciente}
                onChange={(e) => setPaciente(e.target.value)}
              />
            </div>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="mov-obs">Observação</Label>
            <Textarea
              id="mov-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Plus aria-hidden="true" />
            )}
            Lançar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
