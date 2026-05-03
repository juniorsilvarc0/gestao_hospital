/**
 * VisitasListPage — listagem paginada de visitas (Fase 10).
 *
 * Filtros: data range, paciente, leito.
 *
 * Visitas ativas (sem `dataSaida`) são destacadas em verde com botão "Saída".
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  DoorOpen,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { listVisitas, registrarSaida } from '@/lib/visitantes-api';
import { useToast } from '@/components/Toast';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function VisitasListPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [pacienteUuid, setPacienteUuid] = useState('');
  const [leitoUuid, setLeitoUuid] = useState('');
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      ...(dataInicio ? { dataInicio } : {}),
      ...(dataFim ? { dataFim } : {}),
      ...(pacienteUuid ? { pacienteUuid } : {}),
      ...(leitoUuid ? { leitoUuid } : {}),
      page,
      pageSize: 20,
    }),
    [dataInicio, dataFim, pacienteUuid, leitoUuid, page],
  );

  const visitasQuery = useQuery({
    queryKey: ['visitas', 'list', params],
    queryFn: () => listVisitas(params),
    staleTime: 10_000,
  });

  const saidaM = useMutation({
    mutationFn: (uuid: string) => registrarSaida(uuid),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Saída registrada',
        description: '',
      });
      void queryClient.invalidateQueries({ queryKey: ['visitas', 'list'] });
    },
    onError: (e) => {
      const detail =
        e instanceof ApiError ? e.detail ?? e.title ?? e.message : 'Erro.';
      showToast({
        variant: 'destructive',
        title: 'Falha ao registrar saída',
        description: detail,
      });
    },
  });

  const linhas = visitasQuery.data?.data ?? [];
  const meta = visitasQuery.data?.meta;

  return (
    <section className="space-y-4" aria-label="Listagem de visitas">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <DoorOpen aria-hidden="true" className="h-6 w-6" />
            Visitas
          </h1>
          <p className="text-sm text-muted-foreground">
            Entradas e saídas. Visitas ativas em verde.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ['visitas', 'list'] })
            }
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => navigate('/visitas/registrar')}
          >
            Registrar visita
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="vis-di">Data início</Label>
            <Input
              id="vis-di"
              type="date"
              value={dataInicio}
              onChange={(e) => {
                setDataInicio(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="vis-df">Data fim</Label>
            <Input
              id="vis-df"
              type="date"
              value={dataFim}
              onChange={(e) => {
                setDataFim(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="vis-pac">Paciente (UUID)</Label>
            <Input
              id="vis-pac"
              value={pacienteUuid}
              onChange={(e) => {
                setPacienteUuid(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="vis-leito">Leito (UUID)</Label>
            <Input
              id="vis-leito"
              value={leitoUuid}
              onChange={(e) => {
                setLeitoUuid(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="visitas-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Visitante</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Leito</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead>Saída</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visitasQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm">
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
                  colSpan={6}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  Nenhuma visita para os filtros.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((v) => {
                const ativa = !v.dataSaida;
                return (
                  <TableRow key={v.uuid} data-testid={`visita-row-${v.uuid}`}>
                    <TableCell className="text-xs">
                      {v.visitanteNome ?? v.visitanteUuid}
                      {v.visitanteCpfMascarado ? (
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {v.visitanteCpfMascarado}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {v.pacienteNome ?? v.pacienteUuid}
                    </TableCell>
                    <TableCell className="text-xs">
                      {v.leitoNumero ?? v.leitoUuid ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatDateTime(v.dataEntrada)}
                    </TableCell>
                    <TableCell
                      className={
                        ativa
                          ? 'text-xs font-semibold text-emerald-700'
                          : 'text-xs'
                      }
                    >
                      {ativa ? 'em andamento' : formatDateTime(v.dataSaida)}
                    </TableCell>
                    <TableCell className="text-right">
                      {ativa ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={saidaM.isPending}
                          onClick={() => saidaM.mutate(v.uuid)}
                          aria-label={`Registrar saída de ${v.visitanteNome ?? v.visitanteUuid}`}
                        >
                          <CheckCircle2 aria-hidden="true" />
                          Saída
                        </Button>
                      ) : null}
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
            Página {meta.page} de {meta.totalPages} · {meta.total} visita(s)
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
    </section>
  );
}

VisitasListPage.displayName = 'VisitasListPage';
