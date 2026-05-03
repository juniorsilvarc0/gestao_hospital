/**
 * PacienteConsentimentosPage — termos LGPD: aceitar e revogar.
 *
 * Cada termo mostra título, descrição, versão e estado. Termos obrigatórios
 * podem ser aceitos mas não podem ser revogados (botão fica indisponível
 * com explicação).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  aceitarConsentimento,
  getPacienteConsentimentos,
  revogarConsentimento,
} from '@/lib/portal-paciente-api';
import { useToast } from '@/components/Toast';
import type { PacienteConsentimentoResponse } from '@/types/portal-paciente';

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function PacienteConsentimentosPage(): JSX.Element {
  const { show: showToast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['portal-paciente', 'consentimentos'],
    queryFn: getPacienteConsentimentos,
    staleTime: 60_000,
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({
      queryKey: ['portal-paciente', 'consentimentos'],
    });
  }

  const aceitarM = useMutation({
    mutationFn: aceitarConsentimento,
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Termo aceito',
        description: 'Obrigado pelo aceite.',
      });
      invalidate();
    },
    onError: (err) => {
      const detail =
        err instanceof ApiError
          ? err.detail ?? err.title ?? err.message
          : 'Tente novamente.';
      showToast({
        variant: 'destructive',
        title: 'Não foi possível aceitar',
        description: detail,
      });
    },
  });

  const revogarM = useMutation({
    mutationFn: revogarConsentimento,
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Consentimento revogado',
        description: 'Sua decisão foi registrada.',
      });
      invalidate();
    },
    onError: (err) => {
      const detail =
        err instanceof ApiError
          ? err.detail ?? err.title ?? err.message
          : 'Tente novamente.';
      showToast({
        variant: 'destructive',
        title: 'Não foi possível revogar',
        description: detail,
      });
    },
  });

  return (
    <section className="space-y-4" aria-label="Termos de privacidade">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldCheck aria-hidden="true" className="h-6 w-6" />
          Termos de privacidade
        </h1>
        <p className="text-base text-muted-foreground">
          Veja os termos aceitos e gerencie consentimentos opcionais (LGPD).
        </p>
      </header>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-base text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Carregando termos...
        </div>
      ) : query.isError ? (
        <p role="alert" className="text-base text-destructive">
          {query.error instanceof ApiError
            ? query.error.detail ?? query.error.message
            : 'Não foi possível carregar os termos.'}
        </p>
      ) : !query.data || query.data.data.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-base text-muted-foreground">
            Sem termos cadastrados.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="lista-consentimentos">
          {query.data.data.map((termo) => (
            <ConsentimentoCard
              key={termo.uuid}
              termo={termo}
              aceitando={aceitarM.isPending}
              revogando={revogarM.isPending}
              onAceitar={() =>
                aceitarM.mutate({ tipo: termo.tipo, versao: termo.versao })
              }
              onRevogar={() => revogarM.mutate(termo.uuid)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

PacienteConsentimentosPage.displayName = 'PacienteConsentimentosPage';

interface CardProps {
  termo: PacienteConsentimentoResponse;
  aceitando: boolean;
  revogando: boolean;
  onAceitar: () => void;
  onRevogar: () => void;
}

function ConsentimentoCard({
  termo,
  aceitando,
  revogando,
  onAceitar,
  onRevogar,
}: CardProps): JSX.Element {
  const ativo = termo.aceito && !termo.dataRevogacao;
  return (
    <li
      className="rounded-md border bg-card p-4"
      data-testid={`consentimento-${termo.uuid}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-base font-semibold">
            {termo.titulo}{' '}
            <span className="text-xs font-normal text-muted-foreground">
              · v{termo.versao}
            </span>
            {termo.obrigatorio ? (
              <span className="ml-2 rounded border border-amber-300 bg-amber-50 px-1 text-[10px] uppercase text-amber-900">
                obrigatório
              </span>
            ) : null}
          </p>
          <p className="text-sm">{termo.descricao}</p>
          <p className="text-xs text-muted-foreground">
            {ativo
              ? `Aceito em ${formatDateTime(termo.dataAceite)}`
              : termo.dataRevogacao
                ? `Revogado em ${formatDateTime(termo.dataRevogacao)}`
                : 'Pendente de aceite'}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {!ativo ? (
            <Button
              type="button"
              size="sm"
              onClick={onAceitar}
              disabled={aceitando}
              aria-label={`Aceitar termo ${termo.titulo}`}
            >
              {aceitando ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck aria-hidden="true" />
              )}
              Aceitar
            </Button>
          ) : termo.obrigatorio ? (
            <span className="text-xs text-muted-foreground">
              Não pode ser revogado (obrigatório)
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRevogar}
              disabled={revogando}
              aria-label={`Revogar termo ${termo.titulo}`}
            >
              {revogando ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : null}
              Revogar
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
