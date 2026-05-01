/**
 * RecepcaoPage — fila/lista do dia para o setor selecionado.
 *
 * Header:
 *  - Filtros: data (default hoje), setor, status.
 *  - Busca por paciente.
 *  - Botão "Atualizar" (manual) e refresh automático a cada 30s.
 *  - Botão "Novo atendimento" abre <AbrirAtendimentoModal>.
 *
 * Tabela:
 *  - Paciente · Hora · Médico · Tipo · Status · Ações.
 *
 * Ações por linha (perfis RECEPCAO/ADMIN):
 *  - "Abrir" → navega para `/atendimentos/:uuid`.
 *  - "Triagem" → navega para `/triagem`.
 *  - "Cancelar".
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ClipboardList,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
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
import { ApiError } from '@/lib/api-client';
import {
  cancelarAtendimento,
  listAtendimentos,
  listSetores,
} from '@/lib/atendimentos-api';
import { useToast } from '@/components/Toast';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { AbrirAtendimentoModal } from '@/components/recepcao/AbrirAtendimentoModal';
import type {
  AtendimentoResumo,
  AtendimentoStatus,
} from '@/types/atendimentos';

const STATUS_FILTROS: (AtendimentoStatus | 'TODOS')[] = [
  'TODOS',
  'AGENDADO',
  'EM_ESPERA',
  'EM_TRIAGEM',
  'EM_ATENDIMENTO',
  'INTERNADO',
  'ALTA',
  'CANCELADO',
];

const STATUS_LABEL: Record<AtendimentoStatus, string> = {
  AGENDADO: 'Agendado',
  EM_ESPERA: 'Em espera',
  EM_TRIAGEM: 'Em triagem',
  EM_ATENDIMENTO: 'Em atendimento',
  INTERNADO: 'Internado',
  ALTA: 'Alta',
  CANCELADO: 'Cancelado',
  NAO_COMPARECEU: 'Não compareceu',
};

function StatusBadge({
  status,
}: {
  status: AtendimentoStatus;
}): JSX.Element {
  const map: Record<AtendimentoStatus, string> = {
    AGENDADO: 'bg-slate-200 text-slate-900',
    EM_ESPERA: 'bg-amber-200 text-amber-900',
    EM_TRIAGEM: 'bg-yellow-200 text-yellow-900',
    EM_ATENDIMENTO: 'bg-emerald-200 text-emerald-900',
    INTERNADO: 'bg-blue-200 text-blue-900',
    ALTA: 'bg-emerald-100 text-emerald-900',
    CANCELADO: 'bg-red-200 text-red-900 line-through',
    NAO_COMPARECEU: 'bg-orange-200 text-orange-900',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function formatHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function todayLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

const REFRESH_INTERVAL_MS = 30_000;

export function RecepcaoPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [data, setData] = useState<string>(() => todayLocal());
  const [setorUuid, setSetorUuid] = useState<string>('');
  const [statusFiltro, setStatusFiltro] = useState<
    AtendimentoStatus | 'TODOS'
  >('TODOS');
  const [search, setSearch] = useState<string>('');
  const [novoOpen, setNovoOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 350);

  const setoresQuery = useQuery({
    queryKey: ['setores'],
    queryFn: () => listSetores(),
    staleTime: 5 * 60_000,
  });

  const atendimentosQuery = useQuery({
    queryKey: [
      'atendimentos',
      'recepcao',
      { data, setorUuid, statusFiltro, q: debouncedSearch },
    ],
    queryFn: () =>
      listAtendimentos({
        data,
        ...(setorUuid ? { setorUuid } : {}),
        ...(statusFiltro !== 'TODOS' ? { status: statusFiltro } : {}),
        ...(debouncedSearch ? { q: debouncedSearch } : {}),
        page: 1,
        pageSize: 100,
      }),
    staleTime: 10_000,
  });

  // Refresh automático a cada 30s.
  useEffect(() => {
    const handle = setInterval(() => {
      void queryClient.invalidateQueries({
        queryKey: ['atendimentos', 'recepcao'],
      });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [queryClient]);

  const cancelMutation = useMutation({
    mutationFn: ({ uuid, motivo }: { uuid: string; motivo: string }) =>
      cancelarAtendimento(uuid, motivo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['atendimentos'] });
      showToast({
        variant: 'success',
        title: 'Atendimento cancelado',
        description: '',
      });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? err.detail ?? err.message
          : 'Falha ao cancelar.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
    },
  });

  const items: AtendimentoResumo[] = useMemo(
    () => atendimentosQuery.data?.data ?? [],
    [atendimentosQuery.data],
  );

  function handleManualRefresh(): void {
    void queryClient.invalidateQueries({
      queryKey: ['atendimentos', 'recepcao'],
    });
  }

  function handleCancel(uuid: string): void {
    const motivo = window.prompt('Motivo do cancelamento (mín. 3 caracteres):');
    if (!motivo || motivo.trim().length < 3) return;
    cancelMutation.mutate({ uuid, motivo: motivo.trim() });
  }

  return (
    <section className="space-y-4" aria-label="Recepção">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ClipboardList aria-hidden="true" className="h-6 w-6" />
            Recepção
          </h1>
          <p className="text-sm text-muted-foreground">
            Fila do dia · check-in e abertura de atendimento.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            aria-label="Atualizar"
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
          <Button type="button" onClick={() => setNovoOpen(true)}>
            <Plus aria-hidden="true" />
            Novo atendimento
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="filtro-data">Data</Label>
              <Input
                id="filtro-data"
                type="date"
                value={data}
                onChange={(event) => setData(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-setor">Setor</Label>
              <Select
                id="filtro-setor"
                value={setorUuid}
                onChange={(event) => setSetorUuid(event.target.value)}
              >
                <option value="">Todos</option>
                {(setoresQuery.data ?? []).map((s) => (
                  <option key={s.uuid} value={s.uuid}>
                    {s.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-status">Status</Label>
              <Select
                id="filtro-status"
                value={statusFiltro}
                onChange={(event) =>
                  setStatusFiltro(
                    event.target.value as AtendimentoStatus | 'TODOS',
                  )
                }
              >
                {STATUS_FILTROS.map((s) => (
                  <option key={s} value={s}>
                    {s === 'TODOS'
                      ? 'Todos'
                      : STATUS_LABEL[s as AtendimentoStatus]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-busca">Buscar paciente</Label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground"
                />
                <Input
                  id="filtro-busca"
                  className="pl-8"
                  placeholder="Nome, código, CPF..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Buscar pacientes"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Atendimentos
            {atendimentosQuery.data ? (
              <span className="ml-2 text-xs text-muted-foreground">
                {items.length} registro(s)
              </span>
            ) : null}
          </CardTitle>
          {atendimentosQuery.isFetching ? (
            <Loader2
              aria-label="Atualizando"
              className="h-4 w-4 animate-spin text-muted-foreground"
            />
          ) : null}
        </CardHeader>
        <CardContent>
          {atendimentosQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Falha ao carregar atendimentos.
            </p>
          ) : items.length === 0 && !atendimentosQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum atendimento para os filtros atuais.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Médico</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((a) => (
                    <TableRow key={a.uuid}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{a.pacienteNome}</span>
                          <span className="text-xs text-muted-foreground">
                            {a.numero}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{formatHora(a.dataHoraEntrada)}</TableCell>
                      <TableCell>
                        {a.prestadorNome ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{a.tipo}</TableCell>
                      <TableCell>
                        <StatusBadge status={a.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/atendimentos/${a.uuid}`)}
                          >
                            Abrir
                          </Button>
                          {a.status === 'EM_ESPERA' ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => navigate('/triagem')}
                            >
                              <Activity aria-hidden="true" />
                              Triagem
                            </Button>
                          ) : null}
                          {!['CANCELADO', 'ALTA', 'INTERNADO'].includes(
                            a.status,
                          ) ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancel(a.uuid)}
                              aria-label={`Cancelar atendimento de ${a.pacienteNome}`}
                            >
                              Cancelar
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AbrirAtendimentoModal
        open={novoOpen}
        onOpenChange={setNovoOpen}
        onSuccess={(uuid) => navigate(`/atendimentos/${uuid}`)}
      />
    </section>
  );
}
