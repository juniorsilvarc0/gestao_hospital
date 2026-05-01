/**
 * TriagemPage — fila de triagem por setor.
 *
 * Mostra atendimentos com status `EM_ESPERA` ordenados por data de entrada.
 * Click no paciente abre o `<TriagemForm>` lateral (Sheet).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
} from '@/components/ui';
import {
  listAtendimentos,
  listSetores,
} from '@/lib/atendimentos-api';
import { TriagemForm } from '@/components/triagem/TriagemForm';
import type { AtendimentoResumo } from '@/types/atendimentos';

function formatHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function tempoEsperaMin(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
}

const REFRESH_INTERVAL_MS = 30_000;

export function TriagemPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [setorUuid, setSetorUuid] = useState<string>('');
  const [openTriagem, setOpenTriagem] = useState(false);
  const [selecionado, setSelecionado] = useState<AtendimentoResumo | null>(null);

  const setoresQuery = useQuery({
    queryKey: ['setores'],
    queryFn: () => listSetores(),
    staleTime: 5 * 60_000,
  });

  const atendimentosQuery = useQuery({
    queryKey: ['atendimentos', 'triagem', { setorUuid }],
    queryFn: () =>
      listAtendimentos({
        status: 'EM_ESPERA',
        ...(setorUuid ? { setorUuid } : {}),
        page: 1,
        pageSize: 100,
      }),
    staleTime: 10_000,
  });

  useEffect(() => {
    const handle = setInterval(() => {
      void queryClient.invalidateQueries({
        queryKey: ['atendimentos', 'triagem'],
      });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [queryClient]);

  const items: AtendimentoResumo[] = useMemo(
    () => atendimentosQuery.data?.data ?? [],
    [atendimentosQuery.data],
  );

  function abrirTriagem(a: AtendimentoResumo): void {
    setSelecionado(a);
    setOpenTriagem(true);
  }

  return (
    <section className="space-y-4" aria-label="Triagem">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Activity aria-hidden="true" className="h-6 w-6" />
            Triagem
          </h1>
          <p className="text-sm text-muted-foreground">
            Pacientes aguardando classificação Manchester (RN-ATE-04).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ['atendimentos', 'triagem'],
              })
            }
          >
            <RefreshCw aria-hidden="true" />
            Atualizar
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Em espera
            <span className="ml-2 text-xs text-muted-foreground">
              {items.length}
            </span>
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
              Falha ao carregar fila de triagem.
            </p>
          ) : items.length === 0 && !atendimentosQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum paciente aguardando triagem.
            </p>
          ) : (
            <ul className="divide-y" aria-label="Fila de triagem">
              {items.map((a) => {
                const espera = tempoEsperaMin(a.dataHoraEntrada);
                return (
                  <li key={a.uuid}>
                    <button
                      type="button"
                      onClick={() => abrirTriagem(a)}
                      className="flex w-full items-center justify-between gap-3 px-2 py-3 text-left hover:bg-accent"
                    >
                      <div className="flex flex-col">
                        <span className="font-semibold">{a.pacienteNome}</span>
                        <span className="text-xs text-muted-foreground">
                          {a.numero} ·{' '}
                          {a.setorNome ?? a.setorUuid} ·{' '}
                          {formatHora(a.dataHoraEntrada)} · espera {espera}min
                        </span>
                      </div>
                      <ChevronRight
                        aria-hidden="true"
                        className="h-4 w-4 text-muted-foreground"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <TriagemForm
        open={openTriagem}
        onOpenChange={setOpenTriagem}
        atendimento={selecionado}
      />
    </section>
  );
}
