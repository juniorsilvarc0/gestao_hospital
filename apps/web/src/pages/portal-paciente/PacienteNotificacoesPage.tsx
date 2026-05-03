/**
 * PacienteNotificacoesPage — histórico de notificações.
 *
 * Permite marcar como lida.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Loader2 } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  getPacienteNotificacoes,
  marcarNotificacaoLida,
} from '@/lib/portal-paciente-api';
import { useToast } from '@/components/Toast';
import type {
  NotificacaoCanal,
  NotificacaoStatus,
} from '@/types/portal-paciente';

const CANAL_LABEL: Record<NotificacaoCanal, string> = {
  PUSH: 'App',
  EMAIL: 'E-mail',
  SMS: 'SMS',
  IN_APP: 'No portal',
};

const STATUS_AMIGAVEL: Record<NotificacaoStatus, string> = {
  ENVIADA: 'Enviado',
  ENTREGUE: 'Entregue',
  LIDA: 'Lida',
  FALHA: 'Falhou',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function PacienteNotificacoesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const query = useQuery({
    queryKey: ['portal-paciente', 'notificacoes'],
    queryFn: getPacienteNotificacoes,
    staleTime: 30_000,
  });

  const marcarLidaM = useMutation({
    mutationFn: marcarNotificacaoLida,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['portal-paciente', 'notificacoes'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['portal-paciente', 'me'],
      });
    },
    onError: (err) => {
      const detail =
        err instanceof ApiError
          ? err.detail ?? err.title ?? err.message
          : 'Tente novamente.';
      showToast({
        variant: 'destructive',
        title: 'Não foi possível marcar como lida',
        description: detail,
      });
    },
  });

  return (
    <section className="space-y-4" aria-label="Notificações">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Bell aria-hidden="true" className="h-6 w-6" />
          Notificações
        </h1>
        <p className="text-base text-muted-foreground">
          Lembretes, confirmações e mensagens enviadas para você.
        </p>
      </header>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-base text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando suas notificações...
        </div>
      ) : query.isError ? (
        <p role="alert" className="text-base text-destructive">
          {query.error instanceof ApiError
            ? query.error.detail ?? query.error.message
            : 'Não foi possível carregar suas notificações.'}
        </p>
      ) : !query.data || query.data.data.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-base text-muted-foreground">
            Você não tem notificações no momento.
          </CardContent>
        </Card>
      ) : (
        <>
          {query.data.naoLidas > 0 ? (
            <p className="text-sm text-muted-foreground">
              {query.data.naoLidas}{' '}
              {query.data.naoLidas === 1
                ? 'notificação não lida'
                : 'notificações não lidas'}
              .
            </p>
          ) : null}
          <ul className="space-y-3">
            {query.data.data.map((n) => {
              const lida = n.status === 'LIDA' || Boolean(n.dataLeitura);
              return (
                <li
                  key={n.uuid}
                  className={
                    'rounded-md border p-4 ' +
                    (lida ? 'bg-card' : 'border-primary/40 bg-primary/5')
                  }
                  data-testid={`notif-${n.uuid}`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-base font-medium">{n.titulo}</p>
                      <p className="text-sm">{n.mensagem}</p>
                      <p className="text-xs text-muted-foreground">
                        {CANAL_LABEL[n.canal]} ·{' '}
                        {STATUS_AMIGAVEL[n.status]} ·{' '}
                        {formatDateTime(n.dataEnvio)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {n.link ? (
                        <a
                          href={n.link}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          Abrir
                        </a>
                      ) : null}
                      {!lida ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => marcarLidaM.mutate(n.uuid)}
                          disabled={marcarLidaM.isPending}
                          aria-label="Marcar notificação como lida"
                        >
                          {marcarLidaM.isPending ? (
                            <Loader2
                              aria-hidden="true"
                              className="h-4 w-4 animate-spin"
                            />
                          ) : (
                            <Check aria-hidden="true" />
                          )}
                          Marcar como lida
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

PacienteNotificacoesPage.displayName = 'PacienteNotificacoesPage';
