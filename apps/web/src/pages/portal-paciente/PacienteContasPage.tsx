/**
 * PacienteContasPage — histórico financeiro do paciente.
 *
 * Linguagem amigável: "Pagamentos" em vez de "Contas".
 * Mostra status com cor + link para espelho da conta.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CreditCard,
  Loader2,
  X as CloseIcon,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  getPacienteContas,
  getPacienteEspelhoConta,
} from '@/lib/portal-paciente-api';
import type { PacienteContaStatus } from '@/types/portal-paciente';

const STATUS_AMIGAVEL: Record<PacienteContaStatus, string> = {
  EM_ABERTO: 'Em aberto',
  PARCIALMENTE_PAGA: 'Parcialmente pago',
  QUITADA: 'Quitado',
  GLOSADA: 'Em análise pelo convênio',
  CANCELADA: 'Cancelado',
};

const STATUS_COR: Record<PacienteContaStatus, string> = {
  EM_ABERTO: 'border-amber-300 bg-amber-50 text-amber-900',
  PARCIALMENTE_PAGA: 'border-blue-300 bg-blue-50 text-blue-900',
  QUITADA: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  GLOSADA: 'border-orange-300 bg-orange-50 text-orange-900',
  CANCELADA: 'border-zinc-300 bg-zinc-100 text-zinc-700',
};

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

export function PacienteContasPage(): JSX.Element {
  const [espelhoUuid, setEspelhoUuid] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['portal-paciente', 'contas'],
    queryFn: getPacienteContas,
    staleTime: 60_000,
  });

  const espelhoQuery = useQuery({
    queryKey: ['portal-paciente', 'conta-espelho', espelhoUuid],
    queryFn: () =>
      espelhoUuid
        ? getPacienteEspelhoConta(espelhoUuid)
        : Promise.reject(new Error('sem uuid')),
    enabled: Boolean(espelhoUuid),
    staleTime: 60_000,
  });

  return (
    <section className="space-y-4" aria-label="Pagamentos">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <CreditCard aria-hidden="true" className="h-6 w-6" />
          Pagamentos
        </h1>
        <p className="text-base text-muted-foreground">
          Histórico das suas contas e atendimentos.
        </p>
      </header>

      {listQuery.isLoading ? (
        <div className="flex items-center gap-2 text-base text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando seus pagamentos...
        </div>
      ) : listQuery.isError ? (
        <p role="alert" className="text-base text-destructive">
          {listQuery.error instanceof ApiError
            ? listQuery.error.detail ?? listQuery.error.message
            : 'Não foi possível carregar seus pagamentos.'}
        </p>
      ) : !listQuery.data || listQuery.data.data.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-base text-muted-foreground">
            Nenhuma conta registrada.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conta</TableHead>
                <TableHead>Convênio</TableHead>
                <TableHead>Aberto em</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Em aberto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQuery.data.data.map((c) => (
                <TableRow key={c.uuid}>
                  <TableCell className="text-sm font-mono">
                    {c.numero}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.convenioNome ?? 'Particular'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(c.dataAbertura)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatMoney(c.valorTotal)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatMoney(c.valorAberto)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_COR[c.status]}`}
                    >
                      {STATUS_AMIGAVEL[c.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {c.espelhoDisponivel ? (
                      <button
                        type="button"
                        onClick={() => setEspelhoUuid(c.uuid)}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        Ver detalhes
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        —
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(espelhoUuid)} onOpenChange={(open) => !open && setEspelhoUuid(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhamento da conta</DialogTitle>
          </DialogHeader>
          {espelhoQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Carregando detalhamento...
            </div>
          ) : espelhoQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {espelhoQuery.error instanceof ApiError
                ? espelhoQuery.error.detail ?? espelhoQuery.error.message
                : 'Não foi possível carregar os detalhes.'}
            </p>
          ) : !espelhoQuery.data ? null : (
            <div className="space-y-3">
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">
                    Conta
                  </dt>
                  <dd className="font-mono">{espelhoQuery.data.contaNumero}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">
                    Total
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {formatMoney(espelhoQuery.data.valorTotal)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">
                    Em aberto
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {formatMoney(espelhoQuery.data.valorAberto)}
                  </dd>
                </div>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Unitário</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {espelhoQuery.data.itens.map((it, idx) => (
                      <TableRow key={`${idx}-${it.descricao}`}>
                        <TableCell className="text-sm">{it.descricao}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {it.quantidade}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {formatMoney(it.valorUnitario)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {formatMoney(it.valorTotal)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(it.data)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setEspelhoUuid(null)}
                >
                  <CloseIcon aria-hidden="true" />
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

PacienteContasPage.displayName = 'PacienteContasPage';
