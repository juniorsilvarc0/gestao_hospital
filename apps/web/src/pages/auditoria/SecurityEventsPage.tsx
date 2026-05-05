/**
 * SecurityEventsPage — eventos de segurança (login fail, MFA fail, brute-force,
 * password-reset, etc.) — Fase 13 R-A consumer.
 *
 * Filtros: tipo, severidade, intervalo de datas. Tabela com Badge por
 * severidade (CRITICO vermelho, ALERTA laranja, WARNING amarelo, INFO cinza).
 * Fonte: GET /v1/auditoria/security-events.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
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
import { listSecurityEvents } from '@/lib/auditoria-api';
import {
  SECURITY_SEVERIDADES,
  SECURITY_SEVERIDADE_BADGE,
  SECURITY_SEVERIDADE_LABEL,
  type SecuritySeveridade,
} from '@/types/auditoria';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function SecurityEventsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState('');
  const [severidade, setSeveridade] = useState<'TODAS' | SecuritySeveridade>(
    'TODAS',
  );
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      ...(tipo ? { tipo } : {}),
      ...(severidade !== 'TODAS' ? { severidade } : {}),
      ...(dataInicio ? { dataInicio } : {}),
      ...(dataFim ? { dataFim } : {}),
      page,
      pageSize: PAGE_SIZE,
    }),
    [tipo, severidade, dataInicio, dataFim, page],
  );

  const eventsQuery = useQuery({
    queryKey: ['auditoria', 'security-events', params],
    queryFn: () => listSecurityEvents(params),
    staleTime: 15_000,
  });

  const linhas = eventsQuery.data?.data ?? [];
  const meta = eventsQuery.data?.meta;

  return (
    <section
      className="space-y-4"
      aria-label="Auditoria — eventos de segurança"
      data-testid="auditoria-security-page"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck aria-hidden="true" className="h-6 w-6" />
            Eventos de segurança
          </h1>
          <p className="text-sm text-muted-foreground">
            Login, MFA, brute-force, alteração de senha, sessões revogadas.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: ['auditoria', 'security-events'],
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
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="se-tipo">Tipo</Label>
              <Input
                id="se-tipo"
                value={tipo}
                placeholder="LOGIN_FAIL, MFA_FAIL..."
                onChange={(e) => {
                  setTipo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="se-sev">Severidade</Label>
              <Select
                id="se-sev"
                value={severidade}
                onChange={(e) => {
                  setSeveridade(e.target.value as 'TODAS' | SecuritySeveridade);
                  setPage(1);
                }}
              >
                <option value="TODAS">Todas</option>
                {SECURITY_SEVERIDADES.map((s) => (
                  <option key={s} value={s}>
                    {SECURITY_SEVERIDADE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="se-ini">Data início</Label>
              <Input
                id="se-ini"
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="se-fim">Data fim</Label>
              <Input
                id="se-fim"
                type="date"
                value={dataFim}
                onChange={(e) => {
                  setDataFim(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="security-events-tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Severidade</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventsQuery.isLoading ? (
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
                  Nenhum evento de segurança para os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((ev) => {
                const sev = ev.severidade as SecuritySeveridade;
                const badgeCls =
                  SECURITY_SEVERIDADE_BADGE[sev] ??
                  'bg-zinc-100 text-zinc-900 border-zinc-300';
                const sevLabel =
                  SECURITY_SEVERIDADE_LABEL[sev] ?? String(ev.severidade);
                return (
                  <TableRow key={ev.uuid} data-testid={`security-row-${ev.uuid}`}>
                    <TableCell className="text-xs tabular-nums">
                      {formatDateTime(ev.ocorridoEm)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {ev.tipo}
                    </TableCell>
                    <TableCell>
                      <span
                        data-testid={`security-badge-${ev.uuid}`}
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          badgeCls,
                        )}
                      >
                        {sevLabel}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {ev.usuarioNome ?? ev.usuarioUuid ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ev.ip ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                      {ev.detalhes ? JSON.stringify(ev.detalhes) : '—'}
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
            Página {meta.page} de {meta.totalPages} · {meta.total} evento(s)
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

SecurityEventsPage.displayName = 'SecurityEventsPage';
