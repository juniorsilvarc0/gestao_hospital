/**
 * AtendimentoDetalhePage — visão completa do atendimento.
 *
 * Header:
 *  - Foto, nome, idade, alergias, comorbidades.
 *  - Número do atendimento, status, médico, setor.
 *
 * Abas:
 *  - Resumo · Triagem · Convênio · PEP (placeholder) · Conta (placeholder).
 *
 * Ações (gated por status + perfil):
 *  - Internar · Transferir · Alta · Cancelar atendimento · Triagem.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Bed,
  Calendar,
  ClipboardList,
  Loader2,
  LogOut,
  Stethoscope,
  Trash2,
  User,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  cancelarAtendimento,
  getAtendimento,
  listSetores,
} from '@/lib/atendimentos-api';
import { useToast } from '@/components/Toast';
import { useAuthStore } from '@/stores/auth-store';
import { TriagemForm } from '@/components/triagem/TriagemForm';
import { InternarModal } from '@/components/atendimentos/InternarModal';
import { TransferirModal } from '@/components/atendimentos/TransferirModal';
import { AltaModal } from '@/components/atendimentos/AltaModal';
import { MANCHESTER_CORES } from '@/types/atendimentos';
import type {
  AtendimentoResumo,
  AtendimentoStatus,
  ClassificacaoRisco,
} from '@/types/atendimentos';
import { cn } from '@/lib/utils';

type Aba = 'resumo' | 'triagem' | 'convenio' | 'pep' | 'conta';

const ABAS: { id: Aba; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'triagem', label: 'Triagem' },
  { id: 'convenio', label: 'Convênio' },
  { id: 'pep', label: 'PEP' },
  { id: 'conta', label: 'Conta' },
];

function StatusBadge({ status }: { status: AtendimentoStatus }): JSX.Element {
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
      {status}
    </span>
  );
}

function ManchesterBadge({
  cor,
}: {
  cor: ClassificacaoRisco | null | undefined;
}): JSX.Element | null {
  if (!cor) return null;
  const meta = MANCHESTER_CORES.find((c) => c.cor === cor);
  if (!meta) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold uppercase',
        meta.bg,
        meta.border,
        meta.text,
      )}
    >
      {meta.label}
    </span>
  );
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function AtendimentoDetalhePage(): JSX.Element {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();
  const user = useAuthStore((s) => s.user);
  const perfis = (user?.perfis ?? []).map((p) => p.toUpperCase());
  const canRecepcao =
    perfis.includes('ADMIN') || perfis.includes('RECEPCAO');
  const canMedico = perfis.includes('ADMIN') || perfis.includes('MEDICO');

  const [aba, setAba] = useState<Aba>('resumo');
  const [openTriagem, setOpenTriagem] = useState(false);
  const [openInternar, setOpenInternar] = useState(false);
  const [openTransferir, setOpenTransferir] = useState(false);
  const [openAlta, setOpenAlta] = useState(false);

  const atendimentoQuery = useQuery({
    queryKey: ['atendimentos', uuid],
    queryFn: () => getAtendimento(uuid ?? ''),
    enabled: Boolean(uuid),
  });

  const setoresQuery = useQuery({
    queryKey: ['setores'],
    queryFn: () => listSetores(),
    staleTime: 5 * 60_000,
  });

  const cancelMutation = useMutation({
    mutationFn: ({ uuid: u, motivo }: { uuid: string; motivo: string }) =>
      cancelarAtendimento(u, motivo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['atendimentos'] });
      showToast({
        variant: 'success',
        title: 'Atendimento cancelado',
        description: '',
      });
      navigate('/recepcao');
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? err.detail ?? err.message
          : 'Falha ao cancelar.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
    },
  });

  const atendimento = atendimentoQuery.data ?? null;
  const setoresOptions = useMemo(
    () => setoresQuery.data ?? [],
    [setoresQuery.data],
  );

  function handleCancel(): void {
    if (!atendimento) return;
    const motivo = window.prompt('Motivo do cancelamento (mín. 3 caracteres):');
    if (!motivo || motivo.trim().length < 3) return;
    cancelMutation.mutate({ uuid: atendimento.uuid, motivo: motivo.trim() });
  }

  if (atendimentoQuery.isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (atendimentoQuery.isError || !atendimento) {
    return (
      <section className="space-y-4">
        <p role="alert" className="text-sm text-destructive">
          Falha ao carregar atendimento.
        </p>
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </section>
    );
  }

  const idade =
    atendimento.pacienteIdade ?? null;

  const canInternar =
    canRecepcao &&
    !['INTERNADO', 'ALTA', 'CANCELADO', 'NAO_COMPARECEU'].includes(
      atendimento.status,
    );
  const canTransferir =
    (canRecepcao || canMedico) &&
    !['ALTA', 'CANCELADO', 'NAO_COMPARECEU'].includes(atendimento.status);
  const canAlta =
    canMedico && ['EM_ATENDIMENTO', 'INTERNADO'].includes(atendimento.status);
  const canCancel =
    canRecepcao &&
    !['ALTA', 'CANCELADO', 'NAO_COMPARECEU'].includes(atendimento.status);
  const canTriagem =
    canRecepcao &&
    ['EM_ESPERA', 'EM_TRIAGEM', 'AGENDADO'].includes(atendimento.status);

  const atendimentoResumo: AtendimentoResumo = atendimento;

  return (
    <section className="space-y-4" aria-label="Detalhe do atendimento">
      <header className="flex flex-col gap-4 rounded-md border bg-background p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-1 items-start gap-3">
          <div
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted"
          >
            {atendimento.pacienteFotoUrl ? (
              <img
                src={atendimento.pacienteFotoUrl}
                alt=""
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <User className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">
                {atendimento.pacienteNome}
              </h1>
              {idade !== null ? (
                <span className="text-sm text-muted-foreground">
                  {idade} anos
                </span>
              ) : null}
              <StatusBadge status={atendimento.status} />
              <ManchesterBadge cor={atendimento.classificacaoRisco} />
            </div>
            <p className="text-sm text-muted-foreground">
              <ClipboardList
                aria-hidden="true"
                className="mr-1 inline h-3 w-3"
              />
              {atendimento.numero} ·{' '}
              <Stethoscope
                aria-hidden="true"
                className="mx-1 inline h-3 w-3"
              />
              {atendimento.prestadorNome ?? '—'} · Setor{' '}
              {atendimento.setorNome ?? atendimento.setorUuid}
            </p>
            {atendimento.pacienteAlergias?.length ? (
              <p className="text-sm font-medium text-destructive">
                ⚠ Alergias:{' '}
                {atendimento.pacienteAlergias
                  .map((a) => a.substancia)
                  .join(', ')}
              </p>
            ) : null}
            {atendimento.pacienteComorbidades?.length ? (
              <p className="text-xs text-muted-foreground">
                Comorbidades:{' '}
                {atendimento.pacienteComorbidades
                  .map((c) => c.descricao)
                  .join(', ')}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canTriagem ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpenTriagem(true)}
            >
              <ClipboardList aria-hidden="true" />
              Triagem
            </Button>
          ) : null}
          {canInternar ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setOpenInternar(true)}
            >
              <Bed aria-hidden="true" />
              Internar
            </Button>
          ) : null}
          {canTransferir ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpenTransferir(true)}
            >
              <ArrowRightLeft aria-hidden="true" />
              Transferir
            </Button>
          ) : null}
          {canAlta ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpenAlta(true)}
            >
              <LogOut aria-hidden="true" />
              Alta
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
              aria-busy={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              Cancelar
            </Button>
          ) : null}
        </div>
      </header>

      <nav role="tablist" aria-label="Abas do atendimento" className="flex gap-1 border-b">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              aba === a.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {a.label}
          </button>
        ))}
      </nav>

      <div role="tabpanel" aria-label={`Aba ${aba}`} className="space-y-3">
        {aba === 'resumo' ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados do atendimento</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <Row label="Tipo" value={atendimento.tipo} />
                <Row label="Cobrança" value={atendimento.tipoCobranca} />
                <Row
                  label="Entrada"
                  value={formatDateTime(atendimento.dataHoraEntrada)}
                />
                <Row
                  label="Saída"
                  value={formatDateTime(atendimento.dataHoraSaida)}
                />
                <Row
                  label="Leito"
                  value={atendimento.leitoCodigo ?? '—'}
                />
                <Row
                  label="Motivo"
                  value={atendimento.motivoAtendimento ?? '—'}
                />
                <Row
                  label="CID principal"
                  value={atendimento.cidPrincipal ?? '—'}
                />
                <Row
                  label="Tipo alta"
                  value={atendimento.tipoAlta ?? '—'}
                />
              </dl>
            </CardContent>
          </Card>
        ) : null}

        {aba === 'triagem' ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Triagens registradas</CardTitle>
              {canTriagem ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenTriagem(true)}
                >
                  Nova triagem
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {(atendimento.triagens?.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma triagem registrada.
                </p>
              ) : (
                <ul className="space-y-3">
                  {atendimento.triagens?.map((t) => (
                    <li
                      key={t.uuid}
                      className="space-y-1 rounded-md border p-3"
                    >
                      <div className="flex items-center justify-between">
                        <ManchesterBadge cor={t.classificacao} />
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(t.registradoEm)}
                        </span>
                      </div>
                      <p className="text-sm">{t.queixaPrincipal}</p>
                      <pre className="overflow-auto rounded-md bg-muted/50 p-2 text-xs">
                        {JSON.stringify(t.sinaisVitais, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        {aba === 'convenio' ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Convênio</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <Row label="Convênio" value={atendimento.convenioNome ?? '—'} />
                <Row label="Plano" value={atendimento.planoNome ?? '—'} />
                <Row
                  label="Carteirinha"
                  value={atendimento.numeroCarteirinha ?? '—'}
                />
                <Row
                  label="Guia operadora"
                  value={atendimento.numeroGuiaOperadora ?? '—'}
                />
                <Row
                  label="Senha autorização"
                  value={atendimento.senhaAutorizacao ?? '—'}
                />
              </dl>
            </CardContent>
          </Card>
        ) : null}

        {aba === 'pep' ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Prontuário Eletrônico
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="flex items-center gap-2 py-6 text-center text-sm text-muted-foreground">
                <Calendar aria-hidden="true" className="h-4 w-4" />O PEP será
                integrado na Fase 6.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {aba === 'conta' ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conta do atendimento</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="py-6 text-center text-sm text-muted-foreground">
                A conta e o faturamento serão liberados na Fase 8.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <TriagemForm
        open={openTriagem}
        onOpenChange={setOpenTriagem}
        atendimento={atendimentoResumo}
      />
      <InternarModal
        open={openInternar}
        onOpenChange={setOpenInternar}
        atendimentoUuid={atendimento.uuid}
        setorUuid={atendimento.setorUuid}
        setoresOptions={setoresOptions}
      />
      <TransferirModal
        open={openTransferir}
        onOpenChange={setOpenTransferir}
        atendimentoUuid={atendimento.uuid}
        setoresOptions={setoresOptions}
        defaultSetorUuid={atendimento.setorUuid}
      />
      <AltaModal
        open={openAlta}
        onOpenChange={setOpenAlta}
        atendimentoUuid={atendimento.uuid}
      />
    </section>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2">{value}</dd>
    </div>
  );
}
