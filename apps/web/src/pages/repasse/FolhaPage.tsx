/**
 * FolhaPage — folha de produção (resumo) por competência.
 *
 * Exibe um total de prestadores, total bruto e líquido, e a tabela com
 * uma linha por prestador. Cada linha leva à folha detalhada.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Eye,
  Loader2,
  ScrollText,
  Search,
  Wallet,
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
import { getFolhaResumo } from '@/lib/repasse-api';
import {
  REPASSE_STATUS_BADGE,
  REPASSE_STATUS_LABEL,
} from '@/types/repasse';
import { cn } from '@/lib/utils';

function defaultCompetencia(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMoney(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function FolhaPage(): JSX.Element {
  const navigate = useNavigate();

  const [competencia, setCompetencia] = useState<string>(defaultCompetencia());
  const [prestadorUuid, setPrestadorUuid] = useState('');
  const [unidadeFaturamentoUuid, setUnidadeFaturamentoUuid] = useState('');
  const [submitted, setSubmitted] = useState({
    competencia: defaultCompetencia(),
    prestadorUuid: '',
    unidadeFaturamentoUuid: '',
  });

  const validCompetencia = /^\d{4}-\d{2}$/.test(submitted.competencia);

  const folhaQuery = useQuery({
    queryKey: ['repasse', 'folha', submitted],
    queryFn: () =>
      getFolhaResumo({
        competencia: submitted.competencia,
        ...(submitted.prestadorUuid
          ? { prestadorUuid: submitted.prestadorUuid }
          : {}),
        ...(submitted.unidadeFaturamentoUuid
          ? { unidadeFaturamentoUuid: submitted.unidadeFaturamentoUuid }
          : {}),
      }),
    enabled: validCompetencia,
    staleTime: 10_000,
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setSubmitted({ competencia, prestadorUuid, unidadeFaturamentoUuid });
  }

  const linhas = useMemo(() => folhaQuery.data?.linhas ?? [], [folhaQuery.data]);

  return (
    <section className="space-y-4" aria-label="Folha de produção">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ScrollText aria-hidden="true" className="h-6 w-6" />
          Folha de produção
        </h1>
        <p className="text-sm text-muted-foreground">
          Resumo por competência — uma linha por prestador. Clique para ver
          a folha detalhada.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4"
          >
            <div className="space-y-1">
              <Label htmlFor="fl-comp">Competência (YYYY-MM) *</Label>
              <Input
                id="fl-comp"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                placeholder="2026-04"
                pattern="^\d{4}-\d{2}$"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fl-prest">Prestador (UUID)</Label>
              <Input
                id="fl-prest"
                value={prestadorUuid}
                onChange={(e) => setPrestadorUuid(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fl-und">Unidade fat. (UUID)</Label>
              <Input
                id="fl-und"
                value={unidadeFaturamentoUuid}
                onChange={(e) => setUnidadeFaturamentoUuid(e.target.value)}
              />
            </div>
            <Button type="submit">
              <Search aria-hidden="true" />
              Buscar
            </Button>
          </form>
        </CardContent>
      </Card>

      {folhaQuery.data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Prestadores
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <p className="text-base font-semibold tabular-nums">
                {folhaQuery.data.totalPrestadores}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Bruto total
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <p className="text-base font-semibold tabular-nums">
                {formatMoney(folhaQuery.data.valorBrutoTotal)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/40">
            <CardHeader className="pb-1">
              <CardTitle className="text-[11px] uppercase tracking-wide">
                Líquido total
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <p className="text-base font-semibold tabular-nums">
                {formatMoney(folhaQuery.data.valorLiquidoTotal)}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="folha-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Prestador</TableHead>
              <TableHead>Conselho</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Itens</TableHead>
              <TableHead className="text-right">Bruto</TableHead>
              <TableHead className="text-right">Líquido</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!validCompetencia ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-6 text-center text-xs text-muted-foreground"
                >
                  Informe uma competência válida (YYYY-MM).
                </TableCell>
              </TableRow>
            ) : folhaQuery.isLoading ? (
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
                  Nenhum prestador para os filtros.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((l) => (
                <TableRow
                  key={l.prestadorUuid}
                  data-testid={`folha-row-${l.prestadorUuid}`}
                >
                  <TableCell className="text-xs font-medium">
                    {l.prestadorNome ?? l.prestadorUuid}
                  </TableCell>
                  <TableCell className="text-xs">
                    {l.prestadorConselho ?? '—'}
                  </TableCell>
                  <TableCell>
                    {l.repasseStatus ? (
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          REPASSE_STATUS_BADGE[l.repasseStatus],
                        )}
                      >
                        {REPASSE_STATUS_LABEL[l.repasseStatus]}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {l.qtdItens}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatMoney(l.valorBruto)}
                  </TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums">
                    {formatMoney(l.valorLiquido)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate(
                            `/repasse/folha/${l.prestadorUuid}?competencia=${l.competencia}`,
                          )
                        }
                        aria-label={`Ver folha de ${l.prestadorNome ?? l.prestadorUuid}`}
                      >
                        <Eye aria-hidden="true" />
                      </Button>
                      {l.repasseUuid ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigate(`/repasse/${l.repasseUuid}`)
                          }
                          aria-label="Ver repasse"
                        >
                          <Wallet aria-hidden="true" />
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
    </section>
  );
}

FolhaPage.displayName = 'FolhaPage';
