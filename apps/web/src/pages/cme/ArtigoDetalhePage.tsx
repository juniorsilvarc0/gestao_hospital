/**
 * ArtigoDetalhePage — detalhe de um artigo CME (Fase 10).
 *
 * Exibe header com etapa atual + linha do tempo de movimentações + botão
 * "Movimentar" (Dialog com transições válidas via `MovimentarArtigoDialog`).
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Clock,
  MoveRight,
  Package,
} from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { getArtigo, getArtigoHistorico, movimentarArtigo } from '@/lib/cme-api';
import { useToast } from '@/components/Toast';
import {
  ETAPA_CME_BADGE,
  ETAPA_CME_LABEL,
  TRANSICOES_VALIDAS,
  type ArtigoMovimentacao,
  type MovimentarArtigoInput,
} from '@/types/cme';
import { cn } from '@/lib/utils';
import { MovimentarArtigoDialog } from './MovimentarArtigoDialog';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function ArtigoDetalhePage(): JSX.Element {
  const { uuid = '' } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [movOpen, setMovOpen] = useState(false);

  const artigoQuery = useQuery({
    queryKey: ['cme', 'artigo', uuid],
    queryFn: () => getArtigo(uuid),
    enabled: Boolean(uuid),
  });

  const historicoQuery = useQuery({
    queryKey: ['cme', 'artigo', uuid, 'historico'],
    queryFn: () => getArtigoHistorico(uuid),
    enabled: Boolean(uuid),
  });

  const movimentarM = useMutation({
    mutationFn: (input: MovimentarArtigoInput) => movimentarArtigo(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Artigo movimentado',
        description: '',
      });
      setMovOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['cme', 'artigo', uuid] });
      void queryClient.invalidateQueries({
        queryKey: ['cme', 'artigos', 'list'],
      });
    },
    onError: (e) => {
      const detail =
        e instanceof ApiError
          ? e.detail ?? e.title ?? e.message
          : 'Falha ao movimentar.';
      showToast({
        variant: 'destructive',
        title: 'Falha ao movimentar artigo',
        description: detail,
      });
    },
  });

  if (artigoQuery.isLoading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (artigoQuery.isError || !artigoQuery.data) {
    const msg =
      artigoQuery.error instanceof ApiError
        ? artigoQuery.error.detail ?? artigoQuery.error.message
        : 'Falha ao carregar artigo.';
    return (
      <section className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          {msg}
        </p>
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft aria-hidden="true" />
          Voltar
        </Button>
      </section>
    );
  }

  const artigo = artigoQuery.data;
  const podeMov = TRANSICOES_VALIDAS[artigo.etapaAtual].length > 0;

  return (
    <section
      className="space-y-4"
      aria-label={`Detalhe do artigo ${artigo.codigoArtigo}`}
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
            <Package aria-hidden="true" className="h-6 w-6" />
            Artigo {artigo.codigoArtigo}
          </h1>
          <p className="text-sm text-muted-foreground">
            {artigo.descricao ?? 'Sem descrição'}
            {artigo.loteUuid ? (
              <>
                {' · Lote '}
                <Link
                  to={`/cme/lotes/${artigo.loteUuid}`}
                  className="font-mono text-primary underline-offset-2 hover:underline"
                >
                  {artigo.loteNumero ?? artigo.loteUuid}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium',
            ETAPA_CME_BADGE[artigo.etapaAtual],
          )}
        >
          {ETAPA_CME_LABEL[artigo.etapaAtual]}
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!podeMov}
          onClick={() => setMovOpen(true)}
          data-testid="btn-movimentar"
        >
          <MoveRight aria-hidden="true" />
          Movimentar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Rastreabilidade</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <p>
            <strong>Última movimentação:</strong>{' '}
            {formatDateTime(artigo.ultimaMovimentacao)}
          </p>
          <p>
            <strong>Paciente:</strong>{' '}
            {artigo.pacienteNome ?? artigo.pacienteUuid ?? '— (não usado)'}
          </p>
          {artigo.cirurgiaUuid ? (
            <p>
              <strong>Cirurgia:</strong>{' '}
              <Link
                to={`/cirurgias/${artigo.cirurgiaUuid}`}
                className="font-mono text-primary underline-offset-2 hover:underline"
              >
                {artigo.cirurgiaUuid}
              </Link>
            </p>
          ) : null}
          <p>
            <strong>Criado em:</strong> {formatDateTime(artigo.createdAt)}
          </p>
        </CardContent>
      </Card>

      <h2 className="text-base font-semibold tracking-tight">Linha do tempo</h2>
      {historicoQuery.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (historicoQuery.data?.length ?? 0) === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          Sem movimentações registradas.
        </p>
      ) : (
        <ol className="space-y-2">
          {(historicoQuery.data ?? []).map((m) => (
            <MovimentacaoLinha key={m.uuid} mov={m} />
          ))}
        </ol>
      )}

      <MovimentarArtigoDialog
        open={movOpen}
        onOpenChange={setMovOpen}
        etapaAtual={artigo.etapaAtual}
        pending={movimentarM.isPending}
        onSubmit={(input) => movimentarM.mutate(input)}
      />
    </section>
  );
}

ArtigoDetalhePage.displayName = 'ArtigoDetalhePage';

function MovimentacaoLinha({ mov }: { mov: ArtigoMovimentacao }): JSX.Element {
  return (
    <li className="flex items-start gap-3 rounded-md border bg-background p-3 text-xs">
      <Clock aria-hidden="true" className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          {mov.etapaOrigem ? (
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                ETAPA_CME_BADGE[mov.etapaOrigem],
              )}
            >
              {ETAPA_CME_LABEL[mov.etapaOrigem]}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">— (origem)</span>
          )}
          <MoveRight aria-hidden="true" className="h-3 w-3" />
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
              ETAPA_CME_BADGE[mov.etapaDestino],
            )}
          >
            {ETAPA_CME_LABEL[mov.etapaDestino]}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {formatDateTime(mov.dataHora)}
          {mov.responsavelNome ? ` · ${mov.responsavelNome}` : ''}
        </p>
        {mov.observacao ? (
          <p className="whitespace-pre-line">{mov.observacao}</p>
        ) : null}
      </div>
    </li>
  );
}
