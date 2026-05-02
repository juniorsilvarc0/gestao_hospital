/**
 * CriteriosListPage — listagem paginada de critérios de repasse.
 *
 * Filtros: ativo (radio), unidadeFaturamentoUuid.
 * Tabela: descrição · vigência · base de cálculo · momento · prioridade ·
 *         status (ativo/inativo) · ações (ver/editar).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Loader2, Plus, RefreshCw, ScrollText } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { listCriterios } from '@/lib/repasse-api';
import {
  MOMENTO_REPASSE_LABEL,
  TIPO_BASE_CALCULO_LABEL,
} from '@/types/repasse';
import { cn } from '@/lib/utils';

function formatBR(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

export function CriteriosListPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [ativo, setAtivo] = useState<'TODOS' | 'ATIVO' | 'INATIVO'>('ATIVO');
  const [unidadeFaturamentoUuid, setUnidadeFaturamentoUuid] = useState('');
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      ...(ativo !== 'TODOS' ? { ativo: ativo === 'ATIVO' } : {}),
      ...(unidadeFaturamentoUuid ? { unidadeFaturamentoUuid } : {}),
      page,
      pageSize: 20,
    }),
    [ativo, unidadeFaturamentoUuid, page],
  );

  const criteriosQuery = useQuery({
    queryKey: ['repasse', 'criterios', 'list', params],
    queryFn: () => listCriterios(params),
    staleTime: 10_000,
  });

  const linhas = criteriosQuery.data?.data ?? [];
  const meta = criteriosQuery.data?.meta;

  return (
    <section className="space-y-4" aria-label="Critérios de repasse">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ScrollText aria-hidden="true" className="h-6 w-6" />
            Critérios de repasse
          </h1>
          <p className="text-sm text-muted-foreground">
            Regras versionadas que definem como o repasse médico é apurado a
            cada competência.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ['repasse', 'criterios', 'list'],
              })
            }
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => navigate('/repasse/criterios/novo')}
          >
            <Plus aria-hidden="true" />
            Novo critério
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="cri-ativo">Estado</Label>
              <Select
                id="cri-ativo"
                value={ativo}
                onChange={(e) => {
                  setAtivo(e.target.value as 'TODOS' | 'ATIVO' | 'INATIVO');
                  setPage(1);
                }}
              >
                <option value="TODOS">Todos</option>
                <option value="ATIVO">Ativos</option>
                <option value="INATIVO">Inativos</option>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="cri-und">Unidade faturamento (UUID)</Label>
              <Input
                id="cri-und"
                value={unidadeFaturamentoUuid}
                onChange={(e) => {
                  setUnidadeFaturamentoUuid(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="criterios-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead>Base de cálculo</TableHead>
              <TableHead>Momento</TableHead>
              <TableHead className="text-right">Prioridade</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {criteriosQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-sm">
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
                  colSpan={7}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  Nenhum critério para os filtros.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((c) => (
                <TableRow key={c.uuid} data-testid={`criterio-row-${c.uuid}`}>
                  <TableCell className="text-xs font-medium">
                    {c.descricao}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatBR(c.vigenciaInicio)}
                    {c.vigenciaFim ? ` → ${formatBR(c.vigenciaFim)}` : ' → ∞'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {TIPO_BASE_CALCULO_LABEL[c.tipoBaseCalculo]}
                  </TableCell>
                  <TableCell className="text-xs">
                    {MOMENTO_REPASSE_LABEL[c.momentoRepasse]}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {c.prioridade}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        c.ativo
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate(`/repasse/criterios/${c.uuid}`)
                      }
                      aria-label={`Editar critério ${c.descricao}`}
                    >
                      <Eye aria-hidden="true" />
                    </Button>
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
            Página {meta.page} de {meta.totalPages} · {meta.total} critério(s)
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

CriteriosListPage.displayName = 'CriteriosListPage';
