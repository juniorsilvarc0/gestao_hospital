/**
 * CirurgiaDetalhePage — detalhe completo de uma cirurgia.
 *
 * Tabs:
 *   - Resumo (com botões de transição: confirmar / iniciar / encerrar /
 *     cancelar)
 *   - Equipe
 *   - Ficha cirúrgica (form com seções)
 *   - Ficha anestésica
 *   - OPME (Solicitada / Autorizada / Utilizada)
 *   - Kit / Gabarito (read-only)
 *
 * Encerrar exige fichas + datas — botão é desabilitado caso ausente
 * (RN-CC-04 / RN-CC-08).
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ClipboardList,
  Loader2,
  Play,
  Save,
  Square,
  X,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  cancelarCirurgia,
  confirmarCirurgia,
  encerrarCirurgia,
  getCirurgia,
  iniciarCirurgia,
  salvarFichaAnestesica,
  salvarFichaCirurgica,
  solicitarOpme,
  autorizarOpme,
  utilizarOpme,
} from '@/lib/centro-cirurgico-api';
import { useToast } from '@/components/Toast';
import {
  CIRURGIA_CLASSIFICACAO_LABEL,
  CIRURGIA_STATUS_COLOR,
  CIRURGIA_STATUS_LABEL,
  CIRURGIA_TIPOS_ANESTESIA,
  CIRURGIA_TIPO_ANESTESIA_LABEL,
  EQUIPE_FUNCAO_LABEL,
  OPME_STATUS_LABEL,
  type Cirurgia,
  type CirurgiaTipoAnestesia,
  type FichaAnestesicaConteudo,
  type FichaCirurgicaConteudo,
  type FichaCirurgicaSecao,
} from '@/types/centro-cirurgico';
import { cn } from '@/lib/utils';

type TabKey = 'resumo' | 'equipe' | 'ficha' | 'anestesica' | 'opme' | 'kit';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'equipe', label: 'Equipe' },
  { key: 'ficha', label: 'Ficha cirúrgica' },
  { key: 'anestesica', label: 'Ficha anestésica' },
  { key: 'opme', label: 'OPME' },
  { key: 'kit', label: 'Kit/Gabarito' },
];

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

function podeEncerrar(c: Cirurgia): {
  ok: boolean;
  motivo: string;
} {
  if (c.status !== 'EM_ANDAMENTO') {
    return { ok: false, motivo: 'A cirurgia precisa estar em andamento.' };
  }
  if (!c.fichaCirurgica || c.fichaCirurgica.secoes.length === 0) {
    return { ok: false, motivo: 'Preencha a ficha cirúrgica antes.' };
  }
  if (!c.fichaAnestesica) {
    return { ok: false, motivo: 'Preencha a ficha anestésica antes.' };
  }
  if (!c.inicioReal) {
    return { ok: false, motivo: 'Marque o início real da cirurgia.' };
  }
  return { ok: true, motivo: '' };
}

export function CirurgiaDetalhePage(): JSX.Element {
  const { uuid = '' } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [tab, setTab] = useState<TabKey>('resumo');
  const [cancelOpen, setCancelOpen] = useState(false);

  const cirurgiaQuery = useQuery({
    queryKey: ['cirurgia', uuid],
    queryFn: () => getCirurgia(uuid),
    enabled: Boolean(uuid),
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['cirurgia', uuid] });
  }

  function toastError(err: unknown, fallback: string): void {
    const detail =
      err instanceof ApiError
        ? err.detail ?? err.title ?? err.message
        : err instanceof Error
          ? err.message
          : 'Erro.';
    showToast({
      variant: 'destructive',
      title: fallback,
      description: detail,
    });
  }

  const confirmarM = useMutation({
    mutationFn: () => confirmarCirurgia(uuid),
    onSuccess: () => {
      showToast({ variant: 'success', title: 'Cirurgia confirmada', description: '' });
      invalidate();
    },
    onError: (e) => toastError(e, 'Falha ao confirmar'),
  });
  const iniciarM = useMutation({
    mutationFn: () => iniciarCirurgia(uuid),
    onSuccess: () => {
      showToast({ variant: 'success', title: 'Cirurgia iniciada', description: '' });
      invalidate();
    },
    onError: (e) => toastError(e, 'Falha ao iniciar'),
  });
  const encerrarM = useMutation({
    mutationFn: () => encerrarCirurgia(uuid),
    onSuccess: () => {
      showToast({ variant: 'success', title: 'Cirurgia encerrada', description: '' });
      invalidate();
    },
    onError: (e) => toastError(e, 'Falha ao encerrar'),
  });
  const cancelarM = useMutation({
    mutationFn: (motivo: string) => cancelarCirurgia(uuid, { motivo }),
    onSuccess: () => {
      showToast({ variant: 'success', title: 'Cirurgia cancelada', description: '' });
      setCancelOpen(false);
      invalidate();
    },
    onError: (e) => toastError(e, 'Falha ao cancelar'),
  });

  if (cirurgiaQuery.isLoading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (cirurgiaQuery.isError || !cirurgiaQuery.data) {
    const msg =
      cirurgiaQuery.error instanceof ApiError
        ? cirurgiaQuery.error.detail ?? cirurgiaQuery.error.message
        : 'Falha ao carregar cirurgia.';
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

  const cirurgia = cirurgiaQuery.data;
  const encerrarStatus = podeEncerrar(cirurgia);

  return (
    <section
      className="space-y-4"
      aria-label={`Detalhe da cirurgia ${cirurgia.uuid}`}
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
            <ClipboardList aria-hidden="true" className="h-6 w-6" />
            {cirurgia.pacienteNome}
          </h1>
          <p className="text-sm text-muted-foreground">
            {cirurgia.procedimentoPrincipalNome} · {cirurgia.salaNome}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium',
            CIRURGIA_STATUS_COLOR[cirurgia.status].badge,
          )}
        >
          {CIRURGIA_STATUS_LABEL[cirurgia.status]}
        </span>
      </header>

      {/* Tabs */}
      <nav
        role="tablist"
        aria-label="Seções da cirurgia"
        className="flex flex-wrap gap-1 border-b"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            id={`tab-${t.key}`}
            onClick={() => setTab(t.key)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm transition-colors',
              tab === t.key
                ? 'border-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'resumo' ? (
          <ResumoTab
            cirurgia={cirurgia}
            onConfirmar={() => confirmarM.mutate()}
            onIniciar={() => iniciarM.mutate()}
            onEncerrar={() => encerrarM.mutate()}
            onCancelar={() => setCancelOpen(true)}
            confirmando={confirmarM.isPending}
            iniciando={iniciarM.isPending}
            encerrando={encerrarM.isPending}
            encerrarStatus={encerrarStatus}
          />
        ) : null}

        {tab === 'equipe' ? <EquipeTab cirurgia={cirurgia} /> : null}

        {tab === 'ficha' ? (
          <FichaCirurgicaTab
            cirurgia={cirurgia}
            onSaved={() => invalidate()}
          />
        ) : null}

        {tab === 'anestesica' ? (
          <FichaAnestesicaTab
            cirurgia={cirurgia}
            onSaved={() => invalidate()}
          />
        ) : null}

        {tab === 'opme' ? (
          <OpmeTab cirurgia={cirurgia} onChanged={() => invalidate()} />
        ) : null}

        {tab === 'kit' ? <KitTab cirurgia={cirurgia} /> : null}
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar cirurgia</DialogTitle>
          </DialogHeader>
          <CancelarBody
            onSubmit={(motivo) => cancelarM.mutate(motivo)}
            pending={cancelarM.isPending}
            onCancel={() => setCancelOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ---------------------------- Resumo --------------------------- */

interface ResumoTabProps {
  cirurgia: Cirurgia;
  onConfirmar: () => void;
  onIniciar: () => void;
  onEncerrar: () => void;
  onCancelar: () => void;
  confirmando: boolean;
  iniciando: boolean;
  encerrando: boolean;
  encerrarStatus: { ok: boolean; motivo: string };
}

function ResumoTab({
  cirurgia,
  onConfirmar,
  onIniciar,
  onEncerrar,
  onCancelar,
  confirmando,
  iniciando,
  encerrando,
  encerrarStatus,
}: ResumoTabProps): JSX.Element {
  const podeConfirmar = cirurgia.status === 'AGENDADA';
  const podeIniciar = cirurgia.status === 'CONFIRMADA';
  const podeCancelar = !['CANCELADA', 'CONCLUIDA'].includes(cirurgia.status);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Identificação</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            <Item label="Paciente" value={cirurgia.pacienteNome} />
            <Item
              label="Atendimento"
              value={cirurgia.atendimentoNumero ?? '—'}
            />
            <Item
              label="Procedimento principal"
              value={cirurgia.procedimentoPrincipalNome}
            />
            <Item label="Sala" value={cirurgia.salaNome} />
            <Item
              label="Início previsto"
              value={formatDateTime(cirurgia.inicioPrevisto)}
            />
            <Item
              label="Fim previsto"
              value={formatDateTime(cirurgia.fimPrevisto)}
            />
            <Item
              label="Início real"
              value={formatDateTime(cirurgia.inicioReal)}
            />
            <Item
              label="Fim real"
              value={formatDateTime(cirurgia.fimReal)}
            />
            <Item
              label="Cirurgião"
              value={cirurgia.cirurgiaoNome}
            />
            <Item
              label="Classificação"
              value={CIRURGIA_CLASSIFICACAO_LABEL[cirurgia.classificacao]}
            />
            <Item
              label="Anestesia"
              value={CIRURGIA_TIPO_ANESTESIA_LABEL[cirurgia.tipoAnestesia]}
            />
            <Item
              label="Duração estimada"
              value={`${cirurgia.duracaoMinutos} min`}
            />
          </dl>
          {cirurgia.observacao ? (
            <p className="mt-3 rounded-md border bg-muted/40 p-2 text-xs">
              <strong>Obs.:</strong> {cirurgia.observacao}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Ações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            type="button"
            className="w-full"
            disabled={!podeConfirmar || confirmando}
            onClick={onConfirmar}
          >
            {confirmando ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Check aria-hidden="true" />
            )}
            Confirmar
          </Button>
          <Button
            type="button"
            className="w-full"
            variant="outline"
            disabled={!podeIniciar || iniciando}
            onClick={onIniciar}
          >
            {iniciando ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Play aria-hidden="true" />
            )}
            Iniciar
          </Button>
          <Button
            type="button"
            className="w-full"
            variant="outline"
            disabled={!encerrarStatus.ok || encerrando}
            onClick={onEncerrar}
            title={encerrarStatus.ok ? undefined : encerrarStatus.motivo}
          >
            {encerrando ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Square aria-hidden="true" />
            )}
            Encerrar
          </Button>
          {!encerrarStatus.ok && cirurgia.status === 'EM_ANDAMENTO' ? (
            <p className="text-[11px] text-muted-foreground">
              {encerrarStatus.motivo}
            </p>
          ) : null}
          <Button
            type="button"
            className="w-full"
            variant="outline"
            disabled={!podeCancelar}
            onClick={onCancelar}
          >
            <X aria-hidden="true" />
            Cancelar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Item({
  label,
  value,
}: {
  label: string;
  value: string | null;
}): JSX.Element {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="font-medium">{value ?? '—'}</dd>
    </div>
  );
}

/* ---------------------------- Equipe --------------------------- */

function EquipeTab({ cirurgia }: { cirurgia: Cirurgia }): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Equipe cirúrgica</CardTitle>
      </CardHeader>
      <CardContent>
        {cirurgia.equipe.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Equipe não informada.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ordem</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Prestador</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cirurgia.equipe
                .slice()
                .sort((a, b) => a.ordem - b.ordem)
                .map((m) => (
                  <TableRow key={`${m.prestadorUuid}-${m.funcao}`}>
                    <TableCell className="text-xs">{m.ordem}</TableCell>
                    <TableCell className="text-xs">
                      {EQUIPE_FUNCAO_LABEL[m.funcao]}
                    </TableCell>
                    <TableCell className="text-xs">
                      {m.prestadorNome ?? m.prestadorUuid}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------------- Ficha cirúrgica ----------------------- */

const SECOES_FICHA: { chave: string; label: string }[] = [
  { chave: 'descricao', label: 'Descrição cirúrgica' },
  { chave: 'achados', label: 'Achados' },
  { chave: 'intercorrencias', label: 'Intercorrências' },
  { chave: 'tecnica', label: 'Técnica utilizada' },
  { chave: 'observacoes', label: 'Observações' },
];

function FichaCirurgicaTab({
  cirurgia,
  onSaved,
}: {
  cirurgia: Cirurgia;
  onSaved: () => void;
}): JSX.Element {
  const { show: showToast } = useToast();
  const [secoes, setSecoes] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const s of SECOES_FICHA) initial[s.chave] = '';
    for (const s of cirurgia.fichaCirurgica?.secoes ?? []) {
      initial[s.chave] = s.texto;
    }
    return initial;
  });
  const [inicioCirurgia, setInicioCirurgia] = useState(
    cirurgia.fichaCirurgica?.inicioCirurgia ?? '',
  );
  const [fimCirurgia, setFimCirurgia] = useState(
    cirurgia.fichaCirurgica?.fimCirurgia ?? '',
  );

  const saveM = useMutation({
    mutationFn: (conteudo: FichaCirurgicaConteudo) =>
      salvarFichaCirurgica(cirurgia.uuid, conteudo),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Ficha cirúrgica salva',
        description: '',
      });
      onSaved();
    },
    onError: (err) => {
      const detail =
        err instanceof ApiError
          ? err.detail ?? err.title ?? err.message
          : 'Erro.';
      showToast({
        variant: 'destructive',
        title: 'Falha ao salvar ficha',
        description: detail,
      });
    },
  });

  function handleSubmit(): void {
    const conteudo: FichaCirurgicaConteudo = {
      secoes: SECOES_FICHA.map(
        (s): FichaCirurgicaSecao => ({
          chave: s.chave,
          texto: secoes[s.chave] ?? '',
        }),
      ).filter((s) => s.texto.length > 0),
      ...(inicioCirurgia ? { inicioCirurgia } : {}),
      ...(fimCirurgia ? { fimCirurgia } : {}),
    };
    saveM.mutate(conteudo);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Ficha cirúrgica</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="ini-cir">Início da cirurgia</Label>
            <Input
              id="ini-cir"
              type="datetime-local"
              value={
                inicioCirurgia ? inicioCirurgia.slice(0, 16) : ''
              }
              onChange={(e) =>
                setInicioCirurgia(
                  e.target.value
                    ? new Date(e.target.value).toISOString()
                    : '',
                )
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fim-cir">Fim da cirurgia</Label>
            <Input
              id="fim-cir"
              type="datetime-local"
              value={fimCirurgia ? fimCirurgia.slice(0, 16) : ''}
              onChange={(e) =>
                setFimCirurgia(
                  e.target.value
                    ? new Date(e.target.value).toISOString()
                    : '',
                )
              }
            />
          </div>
        </div>
        {SECOES_FICHA.map((s) => (
          <div key={s.chave} className="space-y-1">
            <Label htmlFor={`ficha-${s.chave}`}>{s.label}</Label>
            <Textarea
              id={`ficha-${s.chave}`}
              value={secoes[s.chave] ?? ''}
              onChange={(e) =>
                setSecoes((prev) => ({ ...prev, [s.chave]: e.target.value }))
              }
              rows={3}
            />
          </div>
        ))}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={saveM.isPending}
        >
          {saveM.isPending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Salvar ficha
        </Button>
      </CardContent>
    </Card>
  );
}

/* --------------------- Ficha anestésica --------------------- */

function FichaAnestesicaTab({
  cirurgia,
  onSaved,
}: {
  cirurgia: Cirurgia;
  onSaved: () => void;
}): JSX.Element {
  const { show: showToast } = useToast();
  const [tipoAnestesia, setTipoAnestesia] = useState<CirurgiaTipoAnestesia>(
    cirurgia.fichaAnestesica?.tipoAnestesia ?? cirurgia.tipoAnestesia,
  );
  const [drogasJson, setDrogasJson] = useState<string>(
    JSON.stringify(cirurgia.fichaAnestesica?.drogas ?? [], null, 2),
  );
  const [intercorrencias, setIntercorrencias] = useState(
    cirurgia.fichaAnestesica?.intercorrencias ?? '',
  );
  const [observacoes, setObservacoes] = useState(
    cirurgia.fichaAnestesica?.observacoes ?? '',
  );

  const saveM = useMutation({
    mutationFn: (conteudo: FichaAnestesicaConteudo) =>
      salvarFichaAnestesica(cirurgia.uuid, conteudo),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Ficha anestésica salva',
        description: '',
      });
      onSaved();
    },
    onError: (err) => {
      const detail =
        err instanceof ApiError
          ? err.detail ?? err.title ?? err.message
          : 'Erro.';
      showToast({
        variant: 'destructive',
        title: 'Falha ao salvar ficha',
        description: detail,
      });
    },
  });

  function handleSubmit(): void {
    let drogas: FichaAnestesicaConteudo['drogas'] = [];
    try {
      const parsed = JSON.parse(drogasJson);
      if (Array.isArray(parsed)) drogas = parsed;
    } catch {
      showToast({
        variant: 'destructive',
        title: 'Drogas com JSON inválido',
        description: 'Corrija a estrutura antes de salvar.',
      });
      return;
    }
    saveM.mutate({
      tipoAnestesia,
      drogas,
      ...(intercorrencias ? { intercorrencias } : {}),
      ...(observacoes ? { observacoes } : {}),
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Ficha anestésica</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="tipo-anest">Tipo de anestesia</Label>
          <Select
            id="tipo-anest"
            value={tipoAnestesia}
            onChange={(e) =>
              setTipoAnestesia(e.target.value as CirurgiaTipoAnestesia)
            }
          >
            {CIRURGIA_TIPOS_ANESTESIA.map((t) => (
              <option key={t} value={t}>
                {CIRURGIA_TIPO_ANESTESIA_LABEL[t]}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="drogas">
            Drogas (JSON: nome/dose/unidade/via/hora)
          </Label>
          <Textarea
            id="drogas"
            value={drogasJson}
            onChange={(e) => setDrogasJson(e.target.value)}
            rows={6}
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="anest-int">Intercorrências</Label>
          <Textarea
            id="anest-int"
            value={intercorrencias}
            onChange={(e) => setIntercorrencias(e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="anest-obs">Observações</Label>
          <Textarea
            id="anest-obs"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
          />
        </div>

        <Button
          type="button"
          onClick={handleSubmit}
          disabled={saveM.isPending}
        >
          {saveM.isPending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Salvar ficha anestésica
        </Button>
      </CardContent>
    </Card>
  );
}

/* ---------------------------- OPME --------------------------- */

function OpmeTab({
  cirurgia,
  onChanged,
}: {
  cirurgia: Cirurgia;
  onChanged: () => void;
}): JSX.Element {
  const { show: showToast } = useToast();

  const grupos = useMemo(
    () => ({
      solicitada: cirurgia.opme.filter((o) => o.status === 'SOLICITADA'),
      autorizada: cirurgia.opme.filter(
        (o) => o.status === 'AUTORIZADA' || o.status === 'NEGADA',
      ),
      utilizada: cirurgia.opme.filter((o) => o.status === 'UTILIZADA'),
    }),
    [cirurgia.opme],
  );

  const [novoProc, setNovoProc] = useState('');
  const [novoFornecedor, setNovoFornecedor] = useState('');
  const [novoQtd, setNovoQtd] = useState('1');

  const solicitarM = useMutation({
    mutationFn: (input: {
      procedimentoUuid: string;
      fornecedorNome?: string;
      quantidadeSolicitada: number;
    }) => solicitarOpme(cirurgia.uuid, { itens: [input] }),
    onSuccess: () => {
      showToast({ variant: 'success', title: 'OPME solicitada', description: '' });
      setNovoProc('');
      setNovoFornecedor('');
      setNovoQtd('1');
      onChanged();
    },
    onError: (err) => toastErr(err, 'Falha ao solicitar OPME', showToast),
  });

  const autorizarM = useMutation({
    mutationFn: (input: {
      opmeItemUuid: string;
      quantidadeAutorizada: number;
      aprovado: boolean;
    }) => autorizarOpme(cirurgia.uuid, { itens: [input] }),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Autorização registrada',
        description: '',
      });
      onChanged();
    },
    onError: (err) => toastErr(err, 'Falha ao autorizar', showToast),
  });

  const utilizarM = useMutation({
    mutationFn: (input: {
      opmeItemUuid: string;
      quantidadeUtilizada: number;
      loteUtilizado?: string;
    }) => utilizarOpme(cirurgia.uuid, { itens: [input] }),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'OPME utilizada',
        description: '',
      });
      onChanged();
    },
    onError: (err) => toastErr(err, 'Falha ao registrar utilização', showToast),
  });

  return (
    <div className="space-y-3">
      {/* Adicionar nova solicitação */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Solicitar OPME</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-1 gap-2 sm:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              const qtd = Number(novoQtd);
              if (!novoProc || !Number.isFinite(qtd) || qtd <= 0) return;
              solicitarM.mutate({
                procedimentoUuid: novoProc,
                quantidadeSolicitada: qtd,
                ...(novoFornecedor ? { fornecedorNome: novoFornecedor } : {}),
              });
            }}
          >
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="opme-proc">Procedimento (UUID) *</Label>
              <Input
                id="opme-proc"
                value={novoProc}
                onChange={(e) => setNovoProc(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="opme-forn">Fornecedor</Label>
              <Input
                id="opme-forn"
                value={novoFornecedor}
                onChange={(e) => setNovoFornecedor(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="opme-qtd">Qtd *</Label>
              <Input
                id="opme-qtd"
                type="number"
                min="1"
                value={novoQtd}
                onChange={(e) => setNovoQtd(e.target.value)}
                required
              />
            </div>
            <div className="sm:col-span-4">
              <Button type="submit" size="sm" disabled={solicitarM.isPending}>
                {solicitarM.isPending ? (
                  <Loader2
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                  />
                ) : null}
                Solicitar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <OpmeGrupo
        titulo="Solicitada"
        itens={grupos.solicitada}
        onAcao={(item) =>
          autorizarM.mutate({
            opmeItemUuid: item.uuid,
            quantidadeAutorizada: Number(item.quantidadeSolicitada),
            aprovado: true,
          })
        }
        labelAcao="Aprovar"
      />
      <OpmeGrupo
        titulo="Autorizada"
        itens={grupos.autorizada}
        onAcao={(item) =>
          utilizarM.mutate({
            opmeItemUuid: item.uuid,
            quantidadeUtilizada: Number(
              item.quantidadeAutorizada ?? item.quantidadeSolicitada,
            ),
          })
        }
        labelAcao="Marcar utilizado"
      />
      <OpmeGrupo titulo="Utilizada" itens={grupos.utilizada} />
    </div>
  );
}

interface OpmeGrupoProps {
  titulo: string;
  itens: Cirurgia['opme'];
  onAcao?: (item: Cirurgia['opme'][number]) => void;
  labelAcao?: string;
}

function OpmeGrupo({
  titulo,
  itens,
  onAcao,
  labelAcao,
}: OpmeGrupoProps): JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {titulo} ({itens.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {itens.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum item.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Procedimento</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Solic.</TableHead>
                <TableHead className="text-right">Aut.</TableHead>
                <TableHead className="text-right">Util.</TableHead>
                <TableHead>Status</TableHead>
                {onAcao ? <TableHead className="text-right">Ação</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((i) => (
                <TableRow key={i.uuid}>
                  <TableCell className="text-xs">
                    {i.procedimentoNome ?? i.procedimentoUuid}
                  </TableCell>
                  <TableCell className="text-xs">
                    {i.fornecedorNome ?? '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {i.quantidadeSolicitada}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {i.quantidadeAutorizada ?? '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {i.quantidadeUtilizada ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {OPME_STATUS_LABEL[i.status]}
                  </TableCell>
                  {onAcao ? (
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onAcao(i)}
                      >
                        {labelAcao ?? 'Avançar'}
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------- Kit / Gabarito ---------------------- */

function KitTab({ cirurgia }: { cirurgia: Cirurgia }): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Kit cirúrgico</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            <strong>Aplicado:</strong> {cirurgia.kitCirurgicoNome ?? '—'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Caderno de gabarito</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            <strong>Aplicado:</strong> {cirurgia.cadernoGabaritoNome ?? '—'}
          </p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Procedimentos previstos</CardTitle>
        </CardHeader>
        <CardContent>
          {cirurgia.procedimentos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Procedimento</TableHead>
                  <TableHead>Lado</TableHead>
                  <TableHead>Principal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cirurgia.procedimentos.map((p, idx) => (
                  <TableRow key={`${p.procedimentoUuid}-${idx}`}>
                    <TableCell className="text-xs">
                      {p.procedimentoNome ?? p.procedimentoUuid}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.ladoCirurgico ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.principal ? 'Sim' : 'Não'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------------- Cancelar Body ---------------------- */

function CancelarBody({
  onSubmit,
  onCancel,
  pending,
}: {
  onSubmit: (motivo: string) => void;
  onCancel: () => void;
  pending: boolean;
}): JSX.Element {
  const [motivo, setMotivo] = useState('');
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="cancel-detalhe-motivo">Motivo *</Label>
        <Textarea
          id="cancel-detalhe-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          minLength={5}
          required
          placeholder="Justifique (RN-CC-07)"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Voltar
        </Button>
        <Button
          type="button"
          onClick={() => onSubmit(motivo.trim())}
          disabled={pending || motivo.trim().length < 5}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <X aria-hidden="true" />
          )}
          Confirmar
        </Button>
      </DialogFooter>
    </>
  );
}

function toastErr(
  err: unknown,
  title: string,
  showToast: ReturnType<typeof useToast>['show'],
): void {
  const detail =
    err instanceof ApiError
      ? err.detail ?? err.title ?? err.message
      : err instanceof Error
        ? err.message
        : 'Erro.';
  showToast({ variant: 'destructive', title, description: detail });
}
