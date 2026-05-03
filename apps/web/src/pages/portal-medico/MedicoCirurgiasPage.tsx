/**
 * MedicoCirurgiasPage — cirurgias agendadas com participação do médico.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Stethoscope } from 'lucide-react';
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
import { getMedicoCirurgias } from '@/lib/portal-medico-api';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysISO(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MedicoCirurgiasPage(): JSX.Element {
  const [dataInicio, setDataInicio] = useState(todayISO());
  const [dataFim, setDataFim] = useState(plusDaysISO(todayISO(), 30));

  const query = useQuery({
    queryKey: ['portal-medico', 'cirurgias', dataInicio, dataFim],
    queryFn: () =>
      getMedicoCirurgias({
        dataInicio: `${dataInicio}T00:00:00.000Z`,
        dataFim: `${dataFim}T23:59:59.999Z`,
      }),
    staleTime: 60_000,
  });

  const linhas = useMemo(() => {
    if (!query.data) return [];
    return [...query.data.data].sort((a, b) =>
      a.dataHoraAgendada.localeCompare(b.dataHoraAgendada),
    );
  }, [query.data]);

  return (
    <section className="space-y-4" aria-label="Cirurgias agendadas">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Stethoscope aria-hidden="true" className="h-6 w-6" />
          Cirurgias agendadas
        </h1>
        <p className="text-sm text-muted-foreground">
          Cirurgias em que você é cirurgião ou parte da equipe.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Período</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="space-y-1">
              <Label htmlFor="cir-dini">Início</Label>
              <Input
                id="cir-dini"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cir-dfim">Fim</Label>
              <Input
                id="cir-dfim"
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            <div className="space-y-1 self-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDataInicio(todayISO());
                  setDataFim(plusDaysISO(todayISO(), 30));
                }}
              >
                Próximos 30 dias
              </Button>
            </div>
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
            : 'Falha ao carregar cirurgias.'}
        </p>
      ) : linhas.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Sem cirurgias no período.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table data-testid="medico-cirurgias-tabela">
            <TableHeader>
              <TableRow>
                <TableHead>Data/hora</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Procedimento</TableHead>
                <TableHead>Sala</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((c) => (
                <TableRow key={c.uuid}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatDateTime(c.dataHoraAgendada)}
                    {c.duracaoEstimadaMinutos
                      ? ` (~${c.duracaoEstimadaMinutos}min)`
                      : ''}
                  </TableCell>
                  <TableCell className="text-xs font-medium">
                    {c.pacienteNome ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.procedimentoNome ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">{c.salaNome}</TableCell>
                  <TableCell className="text-xs">
                    <span
                      className={
                        c.papel === 'CIRURGIAO'
                          ? 'rounded border border-rose-300 bg-rose-50 px-1 text-[11px] text-rose-900'
                          : 'rounded border bg-muted/40 px-1 text-[11px]'
                      }
                    >
                      {c.papel === 'CIRURGIAO' ? 'Cirurgião' : 'Equipe'}
                    </span>
                    {c.funcao ? (
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        {c.funcao}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">{c.status}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      to={`/cirurgias/${c.uuid}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Detalhes
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

MedicoCirurgiasPage.displayName = 'MedicoCirurgiasPage';
