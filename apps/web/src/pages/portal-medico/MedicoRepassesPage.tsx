/**
 * MedicoRepassesPage — lista de repasses do prestador (Fase 11 R-C).
 *
 * Lista os repasses do médico autenticado e abre o detalhe da competência
 * em painel embutido (reusa o conceito da Fase 9 mas trabalha com a view
 * read-only do portal: sem ações de mudança de status).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Wallet } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  getMedicoRepasseByCompetencia,
  getMedicoRepasses,
} from '@/lib/portal-medico-api';
import {
  REPASSE_STATUS_BADGE,
  REPASSE_STATUS_LABEL,
} from '@/types/repasse';
import { cn } from '@/lib/utils';

function formatMoney(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

export function MedicoRepassesPage(): JSX.Element {
  const [selectedCompetencia, setSelectedCompetencia] = useState<string | null>(
    null,
  );

  const listQuery = useQuery({
    queryKey: ['portal-medico', 'repasses'],
    queryFn: getMedicoRepasses,
    staleTime: 60_000,
  });

  const detailQuery = useQuery({
    queryKey: ['portal-medico', 'repasses', selectedCompetencia],
    queryFn: () =>
      selectedCompetencia
        ? getMedicoRepasseByCompetencia(selectedCompetencia)
        : Promise.reject(new Error('sem competência')),
    enabled: Boolean(selectedCompetencia),
    staleTime: 60_000,
  });

  return (
    <section className="space-y-4" aria-label="Repasses do médico">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Wallet aria-hidden="true" className="h-6 w-6" />
          Repasses
        </h1>
        <p className="text-sm text-muted-foreground">
          Histórico de repasses apurados, conferidos e pagos.
        </p>
      </header>

      {listQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : listQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {listQuery.error instanceof ApiError
            ? listQuery.error.detail ?? listQuery.error.message
            : 'Falha ao carregar repasses.'}
        </p>
      ) : !listQuery.data || listQuery.data.data.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Sem repasses apurados.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table data-testid="repasses-medico-tabela">
            <TableHeader>
              <TableRow>
                <TableHead>Competência</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">Líquido</TableHead>
                <TableHead>Apuração</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQuery.data.data.map((r) => (
                <TableRow key={r.uuid}>
                  <TableCell className="text-xs font-mono">
                    {r.competencia}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        REPASSE_STATUS_BADGE[r.status],
                      )}
                    >
                      {REPASSE_STATUS_LABEL[r.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {r.qtdItens}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatMoney(r.valorBruto)}
                  </TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums">
                    {formatMoney(r.valorLiquido)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDate(r.dataApuracao)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDate(r.dataPagamento)}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedCompetencia(r.competencia)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Ver itens
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedCompetencia ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Detalhe · {selectedCompetencia}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {detailQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : detailQuery.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {detailQuery.error instanceof ApiError
                  ? detailQuery.error.detail ?? detailQuery.error.message
                  : 'Falha ao carregar detalhe.'}
              </p>
            ) : !detailQuery.data ? null : (
              <div className="space-y-3">
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Stat
                    label="Bruto"
                    value={formatMoney(detailQuery.data.repasse.valorBruto)}
                  />
                  <Stat
                    label="Descontos"
                    value={formatMoney(
                      detailQuery.data.repasse.valorDescontos,
                    )}
                  />
                  <Stat
                    label="Impostos"
                    value={formatMoney(
                      detailQuery.data.repasse.valorImpostos,
                    )}
                  />
                  <Stat
                    label="Líquido"
                    value={formatMoney(detailQuery.data.repasse.valorLiquido)}
                  />
                </dl>
                {detailQuery.data.itens.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem itens.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Conta</TableHead>
                          <TableHead>Paciente</TableHead>
                          <TableHead>Procedimento</TableHead>
                          <TableHead>Função</TableHead>
                          <TableHead className="text-right">Base</TableHead>
                          <TableHead className="text-right">
                            Calculado
                          </TableHead>
                          <TableHead>Flags</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailQuery.data.itens.map((it) => (
                          <TableRow key={it.uuid}>
                            <TableCell className="text-xs font-mono">
                              {it.contaNumero ?? '—'}
                            </TableCell>
                            <TableCell className="text-xs">
                              {it.pacienteNome ?? '—'}
                            </TableCell>
                            <TableCell className="text-xs">
                              {it.procedimentoCodigo
                                ? `${it.procedimentoCodigo} — `
                                : ''}
                              {it.procedimentoNome ?? '—'}
                            </TableCell>
                            <TableCell className="text-xs">
                              {it.funcao ?? '—'}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {formatMoney(it.baseCalculo)}
                            </TableCell>
                            <TableCell className="text-right text-xs font-semibold tabular-nums">
                              {formatMoney(it.valorCalculado)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {it.glosado ? (
                                <span className="rounded border border-orange-300 bg-orange-100 px-1 text-[10px] text-orange-900">
                                  Glosado
                                </span>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

MedicoRepassesPage.displayName = 'MedicoRepassesPage';

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-md border bg-card p-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
