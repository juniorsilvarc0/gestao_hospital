/**
 * PacienteTeleconsultaPage — landing antes de entrar na teleconsulta.
 *
 * Verifica o link via R-B e habilita o botão "Entrar agora" 30min antes do
 * horário (ou usa o flag `linkAtivo` retornado pelo backend, o que vier
 * primeiro). Quando linkAtivo é false, mostra mensagem clara com a janela
 * de horário e o motivo.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Video } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { getPacienteTeleconsultaLink } from '@/lib/portal-paciente-api';

const WINDOW_BEFORE_MINUTES = 30;

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Avalia se estamos dentro da janela "30min antes até `janelaFim`".
 * Exposto para testes.
 */
export function dentroDaJanela(
  agora: Date,
  janelaInicio: string,
  janelaFim: string,
  windowBeforeMinutes = WINDOW_BEFORE_MINUTES,
): boolean {
  const inicio = new Date(janelaInicio);
  const fim = new Date(janelaFim);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    return false;
  }
  const abertura = new Date(inicio.getTime() - windowBeforeMinutes * 60_000);
  return agora >= abertura && agora <= fim;
}

export function PacienteTeleconsultaPage(): JSX.Element {
  const { agendamentoUuid = '' } = useParams<{ agendamentoUuid: string }>();
  const [now, setNow] = useState(() => new Date());

  // Atualiza relógio a cada 30s para o botão acender no horário.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const query = useQuery({
    queryKey: ['portal-paciente', 'teleconsulta', agendamentoUuid],
    queryFn: () => getPacienteTeleconsultaLink(agendamentoUuid),
    enabled: Boolean(agendamentoUuid),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const podeEntrar = useMemo(() => {
    if (!query.data) return false;
    if (!query.data.linkUrl) return false;
    if (query.data.linkAtivo) return true;
    return dentroDaJanela(now, query.data.janelaInicio, query.data.janelaFim);
  }, [now, query.data]);

  return (
    <section className="max-w-2xl space-y-4" aria-label="Teleconsulta">
      <Button asChild variant="outline" size="sm">
        <Link to="/portal/paciente/agendamentos">
          <ArrowLeft aria-hidden="true" />
          Voltar para minhas consultas
        </Link>
      </Button>

      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Video aria-hidden="true" className="h-6 w-6" />
          Teleconsulta
        </h1>
        <p className="text-base text-muted-foreground">
          Você pode entrar até 30 minutos antes do horário marcado.
        </p>
      </header>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-base text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Verificando teleconsulta...
        </div>
      ) : query.isError ? (
        <p role="alert" className="text-base text-destructive">
          {query.error instanceof ApiError
            ? query.error.detail ?? query.error.message
            : 'Não foi possível verificar sua teleconsulta.'}
        </p>
      ) : !query.data ? null : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detalhes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-base">
              Início previsto: <strong>{formatDateTime(query.data.janelaInicio)}</strong>
            </p>
            <p className="text-sm text-muted-foreground">
              Janela disponível até {formatDateTime(query.data.janelaFim)}.
            </p>

            {query.data.motivo ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {query.data.motivo}
              </p>
            ) : null}

            {podeEntrar && query.data.linkUrl ? (
              <Button asChild>
                <a
                  href={query.data.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Entrar agora na teleconsulta"
                >
                  <Video aria-hidden="true" />
                  Entrar agora
                </a>
              </Button>
            ) : (
              <Button disabled aria-disabled="true">
                <Video aria-hidden="true" />
                Entrar agora
              </Button>
            )}

            {!podeEntrar ? (
              <p className="text-sm text-muted-foreground">
                Volte aqui no horário da consulta para entrar na sala virtual.
              </p>
            ) : null}

            <ul className="list-inside list-disc text-xs text-muted-foreground">
              <li>Garanta uma conexão estável com a internet.</li>
              <li>Use fones de ouvido se possível.</li>
              <li>Tenha seus exames e dúvidas anotadas à mão.</li>
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

PacienteTeleconsultaPage.displayName = 'PacienteTeleconsultaPage';
