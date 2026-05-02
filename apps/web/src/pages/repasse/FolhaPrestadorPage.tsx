/**
 * FolhaPrestadorPage — folha detalhada de um prestador em uma competência.
 *
 * Exibe valores agregados (bruto, créditos, débitos, descontos, impostos,
 * líquido) e a lista de contas com agrupamento por função.
 *
 * `competencia` vem da query string; default = mês corrente.
 */
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  ScrollText,
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { getFolhaPrestador } from '@/lib/repasse-api';
import {
  REPASSE_STATUS_BADGE,
  REPASSE_STATUS_LABEL,
  type FolhaPrestadorGrupoConta,
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

export function FolhaPrestadorPage(): JSX.Element {
  const { prestadorUuid = '' } = useParams<{ prestadorUuid: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCompetencia =
    searchParams.get('competencia') ?? defaultCompetencia();

  const [competencia, setCompetencia] = useState(initialCompetencia);
  const [active, setActive] = useState(initialCompetencia);

  useEffect(() => {
    setActive(initialCompetencia);
    setCompetencia(initialCompetencia);
  }, [initialCompetencia]);

  const validCompetencia = /^\d{4}-\d{2}$/.test(active);

  const folhaQuery = useQuery({
    queryKey: ['repasse', 'folha', 'prestador', prestadorUuid, active],
    queryFn: () => getFolhaPrestador(prestadorUuid, active),
    enabled: validCompetencia && Boolean(prestadorUuid),
    staleTime: 10_000,
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!/^\d{4}-\d{2}$/.test(competencia)) return;
    setActive(competencia);
    setSearchParams({ competencia });
  }

  if (folhaQuery.isLoading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (folhaQuery.isError && validCompetencia) {
    const msg =
      folhaQuery.error instanceof ApiError
        ? folhaQuery.error.detail ?? folhaQuery.error.message
        : 'Falha ao carregar folha.';
    return (
      <section className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          {msg}
        </p>
        <Link
          to="/repasse/folha"
          className="text-xs text-primary underline-offset-2 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="mr-1 inline h-3 w-3" />
          Voltar para folha
        </Link>
      </section>
    );
  }

  const folha = folhaQuery.data;

  return (
    <section className="space-y-4" aria-label="Folha do prestador">
      <header className="space-y-1">
        <Link
          to="/repasse/folha"
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="h-3 w-3" />
          Voltar para resumo
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ScrollText aria-hidden="true" className="h-6 w-6" />
          Folha · {folha?.prestadorNome ?? prestadorUuid}
        </h1>
        <p className="text-sm text-muted-foreground">
          {folha?.prestadorConselho ?? ''}
          {folha ? ` · Competência ${folha.competencia}` : ''}
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Competência</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="space-y-1">
              <Label htmlFor="fp-comp">YYYY-MM</Label>
              <Input
                id="fp-comp"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                pattern="^\d{4}-\d{2}$"
                placeholder="2026-04"
              />
            </div>
            <Button type="submit">Aplicar</Button>
          </form>
        </CardContent>
      </Card>

      {folha ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <ResumoCard label="Bruto" value={formatMoney(folha.valorBruto)} />
            <ResumoCard
              label="Créditos"
              value={formatMoney(folha.valorCreditos)}
            />
            <ResumoCard
              label="Débitos"
              value={formatMoney(folha.valorDebitos)}
            />
            <ResumoCard
              label="Descontos"
              value={formatMoney(folha.valorDescontos)}
            />
            <ResumoCard
              label="Impostos"
              value={formatMoney(folha.valorImpostos)}
            />
            <ResumoCard
              label="Líquido"
              value={formatMoney(folha.valorLiquido)}
              highlight
            />
          </div>

          {folha.repasseUuid ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border bg-background p-3 text-xs">
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                  folha.repasseStatus
                    ? REPASSE_STATUS_BADGE[folha.repasseStatus]
                    : '',
                )}
              >
                {folha.repasseStatus
                  ? REPASSE_STATUS_LABEL[folha.repasseStatus]
                  : '—'}
              </span>
              <Link
                to={`/repasse/${folha.repasseUuid}`}
                className="text-primary underline-offset-2 hover:underline"
              >
                <Wallet aria-hidden="true" className="mr-1 inline h-3 w-3" />
                Abrir repasse
              </Link>
            </div>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Contas ({folha.contas.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {folha.contas.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">
                  Nenhuma conta com produção neste mês.
                </p>
              ) : (
                folha.contas.map((conta) => (
                  <ContaBloco key={conta.contaUuid} conta={conta} />
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : !validCompetencia ? (
        <p className="py-6 text-sm text-muted-foreground">
          Informe uma competência válida (YYYY-MM).
        </p>
      ) : (
        <p className="py-6 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="mr-2 inline h-4 w-4 animate-spin" />
          Carregando...
        </p>
      )}
    </section>
  );
}

FolhaPrestadorPage.displayName = 'FolhaPrestadorPage';

function ResumoCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}): JSX.Element {
  return (
    <Card className={cn(highlight ? 'border-emerald-500/40' : '')}>
      <CardHeader className="pb-1">
        <CardTitle className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-1">
        <p className="text-sm font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function ContaBloco({
  conta,
}: {
  conta: FolhaPrestadorGrupoConta;
}): JSX.Element {
  return (
    <div
      data-testid={`folha-conta-${conta.contaUuid}`}
      className="rounded-md border bg-muted/30 p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
        <div>
          <Link
            to={`/contas/${conta.contaUuid}`}
            className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
          >
            Conta {conta.contaNumero}
          </Link>
          {conta.pacienteNome ? (
            <p className="text-xs text-muted-foreground">
              {conta.pacienteNome}
            </p>
          ) : null}
        </div>
        <p className="text-sm font-semibold tabular-nums">
          {formatMoney(conta.totalConta)}
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Função</TableHead>
            <TableHead>Critério</TableHead>
            <TableHead className="text-right">Itens</TableHead>
            <TableHead className="text-right">Base</TableHead>
            <TableHead className="text-right">Calculado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {conta.funcoes.map((f, idx) => (
            <TableRow key={`${f.funcao}-${idx}`}>
              <TableCell className="text-xs">{f.funcao}</TableCell>
              <TableCell className="text-xs">
                {f.criterioDescricao ?? f.criterioUuid ?? '—'}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {f.qtdItens}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {formatMoney(f.valorBase)}
              </TableCell>
              <TableCell className="text-right text-xs font-semibold tabular-nums">
                {formatMoney(f.valorCalculado)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
