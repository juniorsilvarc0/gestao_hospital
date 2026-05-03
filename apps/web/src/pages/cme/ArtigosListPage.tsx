/**
 * ArtigosListPage — listagem paginada de artigos do CME (Fase 10).
 *
 * Filtros: etapa (multi), loteUuid, pacienteUuid.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Loader2, Package, RefreshCw } from 'lucide-react';
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
import { listArtigos } from '@/lib/cme-api';
import {
  ETAPAS_CME,
  ETAPA_CME_BADGE,
  ETAPA_CME_LABEL,
  type EtapaCme,
} from '@/types/cme';
import { cn } from '@/lib/utils';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function ArtigosListPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [etapaSel, setEtapaSel] = useState<Set<EtapaCme>>(() => new Set());
  const [loteUuid, setLoteUuid] = useState('');
  const [pacienteUuid, setPacienteUuid] = useState('');
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      ...(etapaSel.size > 0 ? { etapa: Array.from(etapaSel) } : {}),
      ...(loteUuid ? { loteUuid } : {}),
      ...(pacienteUuid ? { pacienteUuid } : {}),
      page,
      pageSize: 20,
    }),
    [etapaSel, loteUuid, pacienteUuid, page],
  );

  const artigosQuery = useQuery({
    queryKey: ['cme', 'artigos', 'list', params],
    queryFn: () => listArtigos(params),
    staleTime: 10_000,
  });

  function toggleEtapa(e: EtapaCme): void {
    setEtapaSel((prev) => {
      const next = new Set(prev);
      if (next.has(e)) next.delete(e);
      else next.add(e);
      return next;
    });
    setPage(1);
  }

  const linhas = artigosQuery.data?.data ?? [];
  const meta = artigosQuery.data?.meta;

  return (
    <section className="space-y-4" aria-label="Listagem de artigos do CME">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Package aria-hidden="true" className="h-6 w-6" />
            Artigos CME
          </h1>
          <p className="text-sm text-muted-foreground">
            Rastreabilidade do ciclo do artigo (RECEPCAO → DISTRIBUICAO).
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: ['cme', 'artigos', 'list'],
            })
          }
        >
          <RefreshCw aria-hidden="true" />
          Atualizar
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="art-lote">Lote (UUID)</Label>
              <Input
                id="art-lote"
                value={loteUuid}
                onChange={(e) => {
                  setLoteUuid(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="art-pac">Paciente (UUID)</Label>
              <Input
                id="art-pac"
                value={pacienteUuid}
                onChange={(e) => {
                  setPacienteUuid(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background p-2">
            <span className="mr-2 text-xs font-medium text-muted-foreground">
              Etapa:
            </span>
            {ETAPAS_CME.map((s) => {
              const active = etapaSel.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleEtapa(s)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all',
                    ETAPA_CME_BADGE[s],
                    active ? 'ring-2 ring-offset-1 ring-foreground' : 'opacity-60',
                  )}
                >
                  {ETAPA_CME_LABEL[s]}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="artigos-cme-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Última mov.</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {artigosQuery.isLoading ? (
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
                  Nenhum artigo para os filtros.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((a) => (
                <TableRow key={a.uuid} data-testid={`artigo-row-${a.uuid}`}>
                  <TableCell className="text-xs font-mono">
                    {a.codigoArtigo}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate text-xs">
                    {a.descricao ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {a.loteNumero ?? a.loteUuid}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        ETAPA_CME_BADGE[a.etapaAtual],
                      )}
                    >
                      {ETAPA_CME_LABEL[a.etapaAtual]}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {a.pacienteNome ?? a.pacienteUuid ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDateTime(a.ultimaMovimentacao)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/cme/artigos/${a.uuid}`)}
                      aria-label={`Ver artigo ${a.codigoArtigo}`}
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
            Página {meta.page} de {meta.totalPages} · {meta.total} artigo(s)
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

ArtigosListPage.displayName = 'ArtigosListPage';
