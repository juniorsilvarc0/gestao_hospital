/**
 * ExportDetalhePage — detalhe de um lgpd_export com fluxo de dual approval
 * (DPO + Supervisor) — Fase 13 R-C.
 *
 * Botões contextuais:
 *  - Aprovar DPO          (status === PENDENTE)
 *  - Aprovar Supervisor   (status === APROVADO_DPO)
 *  - Rejeitar             (qualquer pré-PRONTO/GERADO)
 *  - Gerar export         (status === APROVADO_SUPERVISOR ou PRONTO)
 *  - Download             (status === GERADO)
 *
 * Validação client-side: o usuário logado NÃO pode ser ao mesmo tempo
 * o DPO e o Supervisor (RN-LGP-04). Se DPO === user.id, o botão "Aprovar
 * Supervisor" fica desabilitado e mostra alerta explicativo.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileCheck2,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import {
  aprovarDpo,
  aprovarSupervisor,
  baixarExport,
  downloadBlob,
  gerarExport,
  getExport,
  rejeitar,
} from '@/lib/lgpd-api';
import {
  LGPD_EXPORT_STATUS_BADGE,
  LGPD_EXPORT_STATUS_LABEL,
  type LgpdExportStatus,
} from '@/types/lgpd';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function ExportDetalhePage(): JSX.Element {
  const { uuid } = useParams<{ uuid: string }>();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();
  const user = useAuthStore((s) => s.user);

  const [rejeitarOpen, setRejeitarOpen] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');

  const exportQuery = useQuery({
    queryKey: ['lgpd-admin', 'export', uuid],
    queryFn: () => getExport(uuid as string),
    enabled: Boolean(uuid),
  });

  const data = exportQuery.data;

  /**
   * RN-LGP-04: o Supervisor não pode ser a mesma pessoa que aprovou como DPO.
   * Detectamos quando o usuário logado já figura como `aprovadorDpoUuid`.
   */
  const dpoIsCurrentUser = useMemo(() => {
    if (!data?.aprovadorDpoUuid || !user?.id) return false;
    return data.aprovadorDpoUuid === user.id;
  }, [data?.aprovadorDpoUuid, user?.id]);

  function handleSuccess(message: string): void {
    showToast({
      title: message,
      description: 'Atualizando...',
      variant: 'success',
      durationMs: 2000,
    });
    void queryClient.invalidateQueries({
      queryKey: ['lgpd-admin', 'export', uuid],
    });
    void queryClient.invalidateQueries({
      queryKey: ['lgpd-admin', 'exports'],
    });
  }

  function handleError(err: unknown, fallback: string): void {
    const detail = err instanceof Error ? err.message : fallback;
    showToast({
      title: 'Falha',
      description: detail,
      variant: 'destructive',
      durationMs: 4500,
    });
  }

  const aprovarDpoMutation = useMutation({
    mutationFn: () => aprovarDpo(uuid as string),
    onSuccess: () => handleSuccess('Aprovado pelo DPO'),
    onError: (err) => handleError(err, 'Falha ao aprovar como DPO.'),
  });

  const aprovarSupervisorMutation = useMutation({
    mutationFn: () => aprovarSupervisor(uuid as string),
    onSuccess: () => handleSuccess('Aprovado pelo Supervisor'),
    onError: (err) => handleError(err, 'Falha ao aprovar como Supervisor.'),
  });

  const rejeitarMutation = useMutation({
    mutationFn: () => rejeitar(uuid as string, { motivo: motivoRejeicao }),
    onSuccess: () => {
      handleSuccess('Export rejeitado');
      setRejeitarOpen(false);
      setMotivoRejeicao('');
    },
    onError: (err) => handleError(err, 'Falha ao rejeitar export.'),
  });

  const gerarMutation = useMutation({
    mutationFn: () => gerarExport(uuid as string),
    onSuccess: () => handleSuccess('Export gerado'),
    onError: (err) => handleError(err, 'Falha ao gerar export.'),
  });

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const blob = await baixarExport(uuid as string);
      const filename = `lgpd-export-${uuid}.json`;
      downloadBlob(blob, filename);
      return blob;
    },
    onSuccess: () => {
      showToast({
        title: 'Download iniciado',
        description: 'O arquivo foi salvo em downloads.',
        variant: 'success',
        durationMs: 2500,
      });
    },
    onError: (err) => handleError(err, 'Falha ao baixar export.'),
  });

  if (!uuid) {
    return (
      <p className="text-sm text-muted-foreground">UUID inválido.</p>
    );
  }

  if (exportQuery.isLoading) {
    return (
      <p
        className="flex items-center gap-2 text-sm text-muted-foreground"
        data-testid="export-detalhe-loading"
      >
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        Carregando export...
      </p>
    );
  }

  if (exportQuery.isError || !data) {
    return (
      <p
        className="flex items-center gap-2 text-sm text-red-700"
        role="alert"
      >
        <AlertCircle aria-hidden="true" className="h-4 w-4" />
        Não foi possível carregar este export.
      </p>
    );
  }

  const st = data.status as LgpdExportStatus;
  const badgeCls =
    LGPD_EXPORT_STATUS_BADGE[st] ??
    'bg-zinc-100 text-zinc-900 border-zinc-300';
  const stLabel = LGPD_EXPORT_STATUS_LABEL[st] ?? String(data.status);

  const podeAprovarDpo = st === 'PENDENTE';
  const podeAprovarSupervisor = st === 'APROVADO_DPO';
  const podeRejeitar =
    st === 'PENDENTE' || st === 'APROVADO_DPO' || st === 'APROVADO_SUPERVISOR';
  const podeGerar = st === 'APROVADO_SUPERVISOR' || st === 'PRONTO';
  const podeBaixar = st === 'GERADO' && Boolean(data.downloadUrl ?? data.geradoEm);

  return (
    <section
      className="space-y-4"
      aria-label="LGPD — detalhes do export"
      data-testid="lgpd-export-detalhe-page"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p>
            <Button type="button" variant="ghost" size="sm" asChild>
              <Link to="/lgpd-admin/exports">
                <ArrowLeft aria-hidden="true" />
                Voltar
              </Link>
            </Button>
          </p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Download aria-hidden="true" className="h-6 w-6" />
            Export LGPD
          </h1>
          <p className="text-xs text-muted-foreground font-mono">{data.uuid}</p>
        </div>
        <span
          data-testid="export-badge"
          className={cn(
            'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium',
            badgeCls,
          )}
        >
          {stLabel}
        </span>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Identificação</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Paciente</p>
            <p>{data.pacienteNome ?? data.pacienteUuid}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Finalidade</p>
            <p>{data.finalidade}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">Motivo</p>
            <p>{data.motivo ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Criado em</p>
            <p className="tabular-nums">{formatDateTime(data.criadoEm)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Criado por</p>
            <p>{data.criadoPorNome ?? data.criadoPorUuid ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Aprovações (RN-LGP-04)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">DPO</p>
            <p>
              {data.aprovadorDpoNome ??
                (data.aprovadorDpoUuid ? `(uuid ${data.aprovadorDpoUuid})` : '—')}
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {formatDateTime(data.aprovadoDpoEm)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Supervisor</p>
            <p>
              {data.aprovadorSupervisorNome ??
                (data.aprovadorSupervisorUuid
                  ? `(uuid ${data.aprovadorSupervisorUuid})`
                  : '—')}
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {formatDateTime(data.aprovadoSupervisorEm)}
            </p>
          </div>
          {data.rejeitadoEm ? (
            <div className="sm:col-span-2 rounded-md border border-red-300 bg-red-50 p-3">
              <p className="text-xs font-medium text-red-900">Rejeitado</p>
              <p className="text-xs text-red-900">
                Por {data.rejeitadoPorNome ?? data.rejeitadoPorUuid ?? '—'} em{' '}
                {formatDateTime(data.rejeitadoEm)}
              </p>
              <p className="mt-1 text-xs text-red-900">
                Motivo: {data.motivoRejeicao ?? '—'}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {dpoIsCurrentUser && podeAprovarSupervisor ? (
        <p
          role="alert"
          data-testid="alerta-dpo-supervisor"
          className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <AlertCircle aria-hidden="true" className="h-4 w-4" />
          Supervisor deve ser DIFERENTE do DPO. Você aprovou esta solicitação
          como DPO; outra pessoa precisa aprovar como Supervisor.
        </p>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Ações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              data-testid="btn-aprovar-dpo"
              disabled={!podeAprovarDpo || aprovarDpoMutation.isPending}
              onClick={() => aprovarDpoMutation.mutate()}
            >
              {aprovarDpoMutation.isPending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <ShieldCheck aria-hidden="true" />
              )}
              Aprovar DPO
            </Button>
            <Button
              type="button"
              data-testid="btn-aprovar-supervisor"
              disabled={
                !podeAprovarSupervisor ||
                dpoIsCurrentUser ||
                aprovarSupervisorMutation.isPending
              }
              onClick={() => aprovarSupervisorMutation.mutate()}
              title={
                dpoIsCurrentUser
                  ? 'Supervisor deve ser diferente do DPO'
                  : undefined
              }
            >
              {aprovarSupervisorMutation.isPending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <CheckCircle2 aria-hidden="true" />
              )}
              Aprovar Supervisor
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="btn-rejeitar"
              disabled={!podeRejeitar}
              onClick={() => setRejeitarOpen(true)}
            >
              <XCircle aria-hidden="true" />
              Rejeitar
            </Button>
            <Button
              type="button"
              variant="outline"
              data-testid="btn-gerar"
              disabled={!podeGerar || gerarMutation.isPending}
              onClick={() => gerarMutation.mutate()}
            >
              {gerarMutation.isPending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <FileCheck2 aria-hidden="true" />
              )}
              Gerar export
            </Button>
            <Button
              type="button"
              variant="outline"
              data-testid="btn-download"
              disabled={!podeBaixar || downloadMutation.isPending}
              onClick={() => downloadMutation.mutate()}
            >
              {downloadMutation.isPending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Download aria-hidden="true" />
              )}
              Download
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={rejeitarOpen}
        onOpenChange={(open) => {
          setRejeitarOpen(open);
          if (!open) setMotivoRejeicao('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar export</DialogTitle>
            <DialogDescription>
              Informe o motivo da rejeição. Será registrado em auditoria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rej-motivo">Motivo</Label>
            <Textarea
              id="rej-motivo"
              data-testid="rejeitar-motivo"
              value={motivoRejeicao}
              onChange={(e) => setMotivoRejeicao(e.target.value)}
              placeholder="Ex.: solicitação fora do escopo, dados insuficientes..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejeitarOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="btn-confirmar-rejeitar"
              disabled={
                motivoRejeicao.trim().length < 3 || rejeitarMutation.isPending
              }
              onClick={() => rejeitarMutation.mutate()}
            >
              {rejeitarMutation.isPending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <XCircle aria-hidden="true" />
              )}
              Confirmar rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

ExportDetalhePage.displayName = 'ExportDetalhePage';
