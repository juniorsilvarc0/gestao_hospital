/**
 * VisitasAtivasLeitoPage — visitas atualmente em andamento em um leito.
 *
 * Polling: a cada 30s — o painel de leito é consultado pelo porteiro/equipe
 * para saber quem está dentro. Refetch on focus também.
 */
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bed,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { listVisitasAtivasLeito, registrarSaida } from '@/lib/visitantes-api';
import { useToast } from '@/components/Toast';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function VisitasAtivasLeitoPage(): JSX.Element {
  const { leitoUuid = '' } = useParams<{ leitoUuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const ativasQuery = useQuery({
    queryKey: ['visitas', 'leito-ativas', leitoUuid],
    queryFn: () => listVisitasAtivasLeito(leitoUuid),
    enabled: Boolean(leitoUuid),
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const saidaM = useMutation({
    mutationFn: (uuid: string) => registrarSaida(uuid),
    onSuccess: () => {
      showToast({ variant: 'success', title: 'Saída registrada', description: '' });
      void queryClient.invalidateQueries({
        queryKey: ['visitas', 'leito-ativas', leitoUuid],
      });
      void queryClient.invalidateQueries({ queryKey: ['visitas', 'list'] });
    },
    onError: (e) => {
      const detail =
        e instanceof ApiError ? e.detail ?? e.title ?? e.message : 'Erro.';
      showToast({
        variant: 'destructive',
        title: 'Falha ao registrar saída',
        description: detail,
      });
    },
  });

  const ativas = ativasQuery.data ?? [];

  return (
    <section
      className="space-y-4"
      aria-label={`Visitas ativas no leito ${leitoUuid}`}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            <ArrowLeft aria-hidden="true" className="h-3 w-3" />
            Voltar
          </button>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Bed aria-hidden="true" className="h-6 w-6" />
            Visitas ativas
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            Leito {leitoUuid}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: ['visitas', 'leito-ativas', leitoUuid],
            })
          }
        >
          <RefreshCw aria-hidden="true" />
          Atualizar
        </Button>
      </header>

      {ativasQuery.isLoading ? (
        <p className="flex items-center gap-2 py-6 text-sm">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando...
        </p>
      ) : ativas.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Sem visitas ativas neste leito no momento.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ativas.map((v) => (
            <Card key={v.uuid} className="border-emerald-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {v.visitanteNome ?? v.visitanteUuid}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {v.visitanteCpfMascarado ? (
                  <p className="font-mono text-muted-foreground">
                    {v.visitanteCpfMascarado}
                  </p>
                ) : null}
                <p>
                  <strong>Paciente:</strong>{' '}
                  {v.pacienteNome ?? v.pacienteUuid}
                </p>
                <p>
                  <strong>Entrada:</strong> {formatDateTime(v.dataEntrada)}
                </p>
                {v.observacao ? (
                  <p className="whitespace-pre-line">{v.observacao}</p>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={saidaM.isPending}
                  onClick={() => saidaM.mutate(v.uuid)}
                >
                  <CheckCircle2 aria-hidden="true" />
                  Registrar saída
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

VisitasAtivasLeitoPage.displayName = 'VisitasAtivasLeitoPage';
