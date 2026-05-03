/**
 * MedicoProducaoPage — produção do médico em determinada competência.
 *
 * Mostra cards-resumo + tabelas por tipo de atendimento e por função.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingUp } from 'lucide-react';
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
import { getMedicoProducao } from '@/lib/portal-medico-api';

function formatMoney(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function currentCompetencia(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

export function MedicoProducaoPage(): JSX.Element {
  const [competencia, setCompetencia] = useState(currentCompetencia());

  const query = useQuery({
    queryKey: ['portal-medico', 'producao', competencia],
    queryFn: () => getMedicoProducao(competencia),
    enabled: /^\d{4}-\d{2}$/u.test(competencia),
    staleTime: 60_000,
  });

  return (
    <section className="space-y-4" aria-label="Produção do médico">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <TrendingUp aria-hidden="true" className="h-6 w-6" />
          Produção
        </h1>
        <p className="text-sm text-muted-foreground">
          Visão consolidada da sua produção mensal.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Competência</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="space-y-1">
              <Label htmlFor="prod-comp">Mês/ano (YYYY-MM)</Label>
              <Input
                id="prod-comp"
                type="month"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                pattern="\d{4}-\d{2}"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCompetencia(currentCompetencia())}
            >
              Mês atual
            </Button>
          </form>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {query.error instanceof ApiError
            ? query.error.detail ?? query.error.message
            : 'Falha ao carregar produção.'}
        </p>
      ) : !query.data ? (
        <p className="text-sm text-muted-foreground">Sem dados.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ResumoCard
              label="Atendimentos"
              value={String(query.data.totalAtendimentos)}
            />
            <ResumoCard
              label="Cirurgias"
              value={String(query.data.totalCirurgias)}
            />
            <ResumoCard
              label="Laudos"
              value={String(query.data.totalLaudos)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Por tipo</CardTitle>
            </CardHeader>
            <CardContent>
              {query.data.porTipo.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table data-testid="producao-tabela-tipo">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {query.data.porTipo.map((row) => (
                        <TableRow key={row.tipo}>
                          <TableCell className="text-xs">{row.tipo}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {row.qtd}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {formatMoney(row.valor)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Por função</CardTitle>
            </CardHeader>
            <CardContent>
              {query.data.porFuncao.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table data-testid="producao-tabela-funcao">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Função</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {query.data.porFuncao.map((row) => (
                        <TableRow key={row.funcao}>
                          <TableCell className="text-xs">{row.funcao}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {row.qtd}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {formatMoney(row.valor)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}

MedicoProducaoPage.displayName = 'MedicoProducaoPage';

function ResumoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
