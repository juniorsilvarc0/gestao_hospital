/**
 * CriterioFormPage — criação ou edição de critério de repasse.
 *
 * Edita a estrutura JSONB `regras = { matchers, deducoes, acrescimos }` com
 * UI amigável (uma linha por matcher/dedução/acréscimo).
 *
 * Validação mínima:
 *   - Pelo menos 1 matcher.
 *   - Cada matcher deve ter `valor` (depende do tipo) e ter `percentual` OU
 *     `valorFixo` preenchido (modo radio).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Plus,
  Save,
  ScrollText,
  Trash2,
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
  Skeleton,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  createCriterio,
  getCriterio,
  updateCriterio,
} from '@/lib/repasse-api';
import { useToast } from '@/components/Toast';
import {
  MOMENTOS_REPASSE,
  MOMENTO_REPASSE_LABEL,
  TIPOS_BASE_CALCULO,
  TIPOS_MATCHER,
  TIPO_BASE_CALCULO_LABEL,
  TIPO_MATCHER_LABEL,
  type CreateCriterioInput,
  type CriterioAjuste,
  type CriterioMatcher,
  type CriterioRegrasJson,
  type CriterioRepasse,
  type MomentoRepasse,
  type TipoBaseCalculo,
  type TipoMatcher,
} from '@/types/repasse';

interface CriterioFormPageProps {
  mode: 'create' | 'edit';
}

interface MatcherDraft extends CriterioMatcher {
  modo: 'percentual' | 'valorFixo';
}

interface AjusteDraft extends CriterioAjuste {
  modo: 'percentual' | 'valorFixo';
}

function emptyMatcher(): MatcherDraft {
  return {
    tipo: 'PRESTADOR',
    valor: '',
    percentual: 70,
    valorFixo: null,
    modo: 'percentual',
    descricao: '',
  };
}

function emptyAjuste(): AjusteDraft {
  return {
    descricao: '',
    percentual: 0,
    valorFixo: null,
    modo: 'percentual',
    codigo: '',
  };
}

function matcherFromExisting(m: CriterioMatcher): MatcherDraft {
  const modo: 'percentual' | 'valorFixo' =
    m.valorFixo !== null && m.valorFixo !== undefined
      ? 'valorFixo'
      : 'percentual';
  return {
    tipo: m.tipo,
    valor: m.valor,
    percentual: m.percentual ?? null,
    valorFixo: m.valorFixo ?? null,
    descricao: m.descricao ?? '',
    modo,
  };
}

function ajusteFromExisting(a: CriterioAjuste): AjusteDraft {
  const modo: 'percentual' | 'valorFixo' =
    a.valorFixo !== null && a.valorFixo !== undefined
      ? 'valorFixo'
      : 'percentual';
  return {
    descricao: a.descricao,
    percentual: a.percentual ?? null,
    valorFixo: a.valorFixo ?? null,
    codigo: a.codigo ?? '',
    modo,
  };
}

function toastErr(
  err: unknown,
  fallback: string,
  showToast: ReturnType<typeof useToast>['show'],
): void {
  const detail =
    err instanceof ApiError
      ? err.detail ?? err.title ?? err.message
      : err instanceof Error
        ? err.message
        : 'Erro.';
  showToast({ variant: 'destructive', title: fallback, description: detail });
}

export function CriterioFormPage({
  mode,
}: CriterioFormPageProps): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();
  const { uuid } = useParams<{ uuid: string }>();

  const isEdit = mode === 'edit';

  const criterioQuery = useQuery({
    queryKey: ['repasse', 'criterio', uuid],
    queryFn: () => getCriterio(uuid as string),
    enabled: isEdit && Boolean(uuid),
  });

  // Cabeçalho
  const [descricao, setDescricao] = useState('');
  const [vigenciaInicio, setVigenciaInicio] = useState('');
  const [vigenciaFim, setVigenciaFim] = useState('');
  const [unidadeFaturamentoUuid, setUnidadeFaturamentoUuid] = useState('');
  const [unidadeAtendimentoUuid, setUnidadeAtendimentoUuid] = useState('');
  const [tipoBaseCalculo, setTipoBaseCalculo] =
    useState<TipoBaseCalculo>('PERCENTUAL_BRUTO');
  const [momentoRepasse, setMomentoRepasse] =
    useState<MomentoRepasse>('APOS_FATURAMENTO');
  const [diaFechamento, setDiaFechamento] = useState('');
  const [prazoDias, setPrazoDias] = useState('');
  const [prioridade, setPrioridade] = useState('100');
  const [ativo, setAtivo] = useState(true);

  // Regras
  const [matchers, setMatchers] = useState<MatcherDraft[]>([emptyMatcher()]);
  const [deducoes, setDeducoes] = useState<AjusteDraft[]>([]);
  const [acrescimos, setAcrescimos] = useState<AjusteDraft[]>([]);

  useEffect(() => {
    if (!isEdit) return;
    const data = criterioQuery.data;
    if (!data) return;
    populateFromCriterio(data, {
      setDescricao,
      setVigenciaInicio,
      setVigenciaFim,
      setUnidadeFaturamentoUuid,
      setUnidadeAtendimentoUuid,
      setTipoBaseCalculo,
      setMomentoRepasse,
      setDiaFechamento,
      setPrazoDias,
      setPrioridade,
      setAtivo,
      setMatchers,
      setDeducoes,
      setAcrescimos,
    });
  }, [isEdit, criterioQuery.data]);

  const valid = useMemo(() => {
    if (descricao.trim().length < 3) return false;
    if (!vigenciaInicio) return false;
    if (matchers.length === 0) return false;
    for (const m of matchers) {
      if (!m.valor || m.valor.trim().length === 0) return false;
      if (m.modo === 'percentual') {
        const p = Number(m.percentual);
        if (!Number.isFinite(p) || p < 0 || p > 100) return false;
      } else {
        const v = Number(m.valorFixo);
        if (!Number.isFinite(v) || v < 0) return false;
      }
    }
    for (const a of [...deducoes, ...acrescimos]) {
      if (!a.descricao || a.descricao.trim().length === 0) return false;
      if (a.modo === 'percentual') {
        const p = Number(a.percentual);
        if (!Number.isFinite(p)) return false;
      } else {
        const v = Number(a.valorFixo);
        if (!Number.isFinite(v)) return false;
      }
    }
    return true;
  }, [descricao, vigenciaInicio, matchers, deducoes, acrescimos]);

  const createM = useMutation({
    mutationFn: (input: CreateCriterioInput) => createCriterio(input),
    onSuccess: (created) => {
      showToast({
        variant: 'success',
        title: 'Critério criado',
        description: created.descricao,
      });
      void queryClient.invalidateQueries({
        queryKey: ['repasse', 'criterios', 'list'],
      });
      navigate(`/repasse/criterios/${created.uuid}`);
    },
    onError: (e) => toastErr(e, 'Falha ao criar critério', showToast),
  });

  const updateM = useMutation({
    mutationFn: (input: CreateCriterioInput) =>
      updateCriterio(uuid as string, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Critério atualizado',
        description: '',
      });
      void queryClient.invalidateQueries({
        queryKey: ['repasse', 'criterios', 'list'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['repasse', 'criterio', uuid],
      });
    },
    onError: (e) => toastErr(e, 'Falha ao atualizar critério', showToast),
  });

  function buildPayload(): CreateCriterioInput {
    const regras: CriterioRegrasJson = {
      matchers: matchers.map((m) => ({
        tipo: m.tipo,
        valor: m.valor.trim(),
        percentual: m.modo === 'percentual' ? Number(m.percentual) : null,
        valorFixo: m.modo === 'valorFixo' ? Number(m.valorFixo) : null,
        ...(m.descricao ? { descricao: m.descricao } : {}),
      })),
      deducoes: deducoes.map((a) => ({
        descricao: a.descricao.trim(),
        percentual: a.modo === 'percentual' ? Number(a.percentual) : null,
        valorFixo: a.modo === 'valorFixo' ? Number(a.valorFixo) : null,
        ...(a.codigo ? { codigo: a.codigo } : {}),
      })),
      acrescimos: acrescimos.map((a) => ({
        descricao: a.descricao.trim(),
        percentual: a.modo === 'percentual' ? Number(a.percentual) : null,
        valorFixo: a.modo === 'valorFixo' ? Number(a.valorFixo) : null,
        ...(a.codigo ? { codigo: a.codigo } : {}),
      })),
    };
    const dia = Number(diaFechamento);
    const prazo = Number(prazoDias);
    const prio = Number(prioridade);
    return {
      descricao: descricao.trim(),
      vigenciaInicio,
      vigenciaFim: vigenciaFim || null,
      unidadeFaturamentoUuid: unidadeFaturamentoUuid || null,
      unidadeAtendimentoUuid: unidadeAtendimentoUuid || null,
      tipoBaseCalculo,
      momentoRepasse,
      diaFechamento: Number.isFinite(dia) && diaFechamento ? dia : null,
      prazoDias: Number.isFinite(prazo) && prazoDias ? prazo : null,
      prioridade: Number.isFinite(prio) ? prio : 100,
      ativo,
      regras,
    };
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!valid) return;
    const payload = buildPayload();
    if (isEdit) {
      updateM.mutate(payload);
    } else {
      createM.mutate(payload);
    }
  }

  if (isEdit && criterioQuery.isLoading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (isEdit && (criterioQuery.isError || !criterioQuery.data)) {
    const msg =
      criterioQuery.error instanceof ApiError
        ? criterioQuery.error.detail ?? criterioQuery.error.message
        : 'Falha ao carregar critério.';
    return (
      <section className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          {msg}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate('/repasse/criterios')}
        >
          <ArrowLeft aria-hidden="true" />
          Voltar
        </Button>
      </section>
    );
  }

  const pending = createM.isPending || updateM.isPending;

  return (
    <section className="space-y-4" aria-label="Formulário de critério">
      <header className="space-y-1">
        <button
          type="button"
          onClick={() => navigate('/repasse/criterios')}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="h-3 w-3" />
          Voltar
        </button>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ScrollText aria-hidden="true" className="h-6 w-6" />
          {isEdit ? 'Editar critério' : 'Novo critério de repasse'}
        </h1>
      </header>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Identificação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="cf-desc">Descrição *</Label>
                <Input
                  id="cf-desc"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  required
                  minLength={3}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cf-vi">Vigência início *</Label>
                <Input
                  id="cf-vi"
                  type="date"
                  value={vigenciaInicio}
                  onChange={(e) => setVigenciaInicio(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cf-vf">Vigência fim</Label>
                <Input
                  id="cf-vf"
                  type="date"
                  value={vigenciaFim}
                  onChange={(e) => setVigenciaFim(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cf-uf">Unidade faturamento (UUID)</Label>
                <Input
                  id="cf-uf"
                  value={unidadeFaturamentoUuid}
                  onChange={(e) => setUnidadeFaturamentoUuid(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cf-ua">Unidade atendimento (UUID)</Label>
                <Input
                  id="cf-ua"
                  value={unidadeAtendimentoUuid}
                  onChange={(e) => setUnidadeAtendimentoUuid(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cf-base">Base de cálculo *</Label>
                <Select
                  id="cf-base"
                  value={tipoBaseCalculo}
                  onChange={(e) =>
                    setTipoBaseCalculo(e.target.value as TipoBaseCalculo)
                  }
                >
                  {TIPOS_BASE_CALCULO.map((t) => (
                    <option key={t} value={t}>
                      {TIPO_BASE_CALCULO_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cf-mom">Momento *</Label>
                <Select
                  id="cf-mom"
                  value={momentoRepasse}
                  onChange={(e) =>
                    setMomentoRepasse(e.target.value as MomentoRepasse)
                  }
                >
                  {MOMENTOS_REPASSE.map((m) => (
                    <option key={m} value={m}>
                      {MOMENTO_REPASSE_LABEL[m]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cf-fech">Dia fechamento</Label>
                <Input
                  id="cf-fech"
                  type="number"
                  min="1"
                  max="31"
                  value={diaFechamento}
                  onChange={(e) => setDiaFechamento(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cf-prazo">Prazo (dias)</Label>
                <Input
                  id="cf-prazo"
                  type="number"
                  min="0"
                  value={prazoDias}
                  onChange={(e) => setPrazoDias(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cf-prio">Prioridade *</Label>
                <Input
                  id="cf-prio"
                  type="number"
                  value={prioridade}
                  onChange={(e) => setPrioridade(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={ativo}
                    onChange={(e) => setAtivo(e.target.checked)}
                  />
                  Ativo
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Matchers *</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMatchers((prev) => [...prev, emptyMatcher()])}
            >
              <Plus aria-hidden="true" />
              Adicionar Matcher
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {matchers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Adicione ao menos 1 matcher (alvo do critério).
              </p>
            ) : null}
            {matchers.map((m, idx) => (
              <MatcherEditor
                key={idx}
                index={idx}
                matcher={m}
                onChange={(next) =>
                  setMatchers((prev) => prev.map((x, i) => (i === idx ? next : x)))
                }
                onRemove={() =>
                  setMatchers((prev) => prev.filter((_, i) => i !== idx))
                }
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Deduções</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDeducoes((prev) => [...prev, emptyAjuste()])}
            >
              <Plus aria-hidden="true" />
              Adicionar Dedução
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {deducoes.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sem deduções (impostos retidos, anuidades, etc.).
              </p>
            ) : null}
            {deducoes.map((a, idx) => (
              <AjusteEditor
                key={idx}
                kind="dedução"
                ajuste={a}
                index={idx}
                onChange={(next) =>
                  setDeducoes((prev) => prev.map((x, i) => (i === idx ? next : x)))
                }
                onRemove={() =>
                  setDeducoes((prev) => prev.filter((_, i) => i !== idx))
                }
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Acréscimos</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAcrescimos((prev) => [...prev, emptyAjuste()])}
            >
              <Plus aria-hidden="true" />
              Adicionar Acréscimo
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {acrescimos.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sem acréscimos (bônus, plantão extra, etc.).
              </p>
            ) : null}
            {acrescimos.map((a, idx) => (
              <AjusteEditor
                key={idx}
                kind="acréscimo"
                ajuste={a}
                index={idx}
                onChange={(next) =>
                  setAcrescimos((prev) =>
                    prev.map((x, i) => (i === idx ? next : x)),
                  )
                }
                onRemove={() =>
                  setAcrescimos((prev) => prev.filter((_, i) => i !== idx))
                }
              />
            ))}
          </CardContent>
        </Card>

        <footer className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/repasse/criterios')}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={!valid || pending}>
            {pending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {isEdit ? 'Salvar alterações' : 'Criar critério'}
          </Button>
        </footer>
      </form>
    </section>
  );
}

CriterioFormPage.displayName = 'CriterioFormPage';

/* ============================== Editores ============================== */

interface MatcherEditorProps {
  matcher: MatcherDraft;
  index: number;
  onChange: (next: MatcherDraft) => void;
  onRemove: () => void;
}

function MatcherEditor({
  matcher,
  index,
  onChange,
  onRemove,
}: MatcherEditorProps): JSX.Element {
  function update<K extends keyof MatcherDraft>(
    key: K,
    value: MatcherDraft[K],
  ): void {
    onChange({ ...matcher, [key]: value });
  }

  return (
    <div
      data-testid={`matcher-row-${index}`}
      className="space-y-2 rounded-md border bg-muted/40 p-3"
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Matcher #{index + 1}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRemove}
          aria-label={`Remover matcher ${index + 1}`}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`m-tipo-${index}`}>Tipo *</Label>
          <Select
            id={`m-tipo-${index}`}
            value={matcher.tipo}
            onChange={(e) => update('tipo', e.target.value as TipoMatcher)}
          >
            {TIPOS_MATCHER.map((t) => (
              <option key={t} value={t}>
                {TIPO_MATCHER_LABEL[t]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`m-valor-${index}`}>Valor do tipo *</Label>
          <Input
            id={`m-valor-${index}`}
            value={matcher.valor}
            onChange={(e) => update('valor', e.target.value)}
            placeholder={
              matcher.tipo === 'PRESTADOR'
                ? 'UUID do prestador'
                : matcher.tipo === 'FUNCAO'
                  ? 'CIRURGIAO, ANESTESISTA, ...'
                  : matcher.tipo === 'GRUPO_GASTO'
                    ? 'PROCEDIMENTOS, MATERIAIS, ...'
                    : 'Códigos TUSS (separados por vírgula)'
            }
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor={`m-desc-${index}`}>Descrição</Label>
          <Input
            id={`m-desc-${index}`}
            value={matcher.descricao ?? ''}
            onChange={(e) => update('descricao', e.target.value)}
            placeholder="Anotação livre"
          />
        </div>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium">Modo de cálculo *</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name={`m-modo-${index}`}
              value="percentual"
              checked={matcher.modo === 'percentual'}
              onChange={() => update('modo', 'percentual')}
            />
            Percentual
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name={`m-modo-${index}`}
              value="valorFixo"
              checked={matcher.modo === 'valorFixo'}
              onChange={() => update('modo', 'valorFixo')}
            />
            Valor fixo
          </label>
        </div>
        {matcher.modo === 'percentual' ? (
          <div className="space-y-1">
            <Label htmlFor={`m-perc-${index}`}>Percentual (%)</Label>
            <Input
              id={`m-perc-${index}`}
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={matcher.percentual ?? ''}
              onChange={(e) =>
                update(
                  'percentual',
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
            />
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor={`m-vf-${index}`}>Valor fixo (R$)</Label>
            <Input
              id={`m-vf-${index}`}
              type="number"
              min="0"
              step="0.01"
              value={matcher.valorFixo ?? ''}
              onChange={(e) =>
                update(
                  'valorFixo',
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
            />
          </div>
        )}
      </fieldset>
    </div>
  );
}

interface AjusteEditorProps {
  ajuste: AjusteDraft;
  index: number;
  kind: 'dedução' | 'acréscimo';
  onChange: (next: AjusteDraft) => void;
  onRemove: () => void;
}

function AjusteEditor({
  ajuste,
  index,
  kind,
  onChange,
  onRemove,
}: AjusteEditorProps): JSX.Element {
  function update<K extends keyof AjusteDraft>(
    key: K,
    value: AjusteDraft[K],
  ): void {
    onChange({ ...ajuste, [key]: value });
  }

  const idPrefix = kind === 'dedução' ? 'd' : 'a';

  return (
    <div
      data-testid={`${kind === 'dedução' ? 'deducao' : 'acrescimo'}-row-${index}`}
      className="space-y-2 rounded-md border bg-muted/40 p-3"
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          {kind.charAt(0).toUpperCase() + kind.slice(1)} #{index + 1}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRemove}
          aria-label={`Remover ${kind} ${index + 1}`}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-desc-${index}`}>Descrição *</Label>
          <Input
            id={`${idPrefix}-desc-${index}`}
            value={ajuste.descricao}
            onChange={(e) => update('descricao', e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-cod-${index}`}>Código</Label>
          <Input
            id={`${idPrefix}-cod-${index}`}
            value={ajuste.codigo ?? ''}
            onChange={(e) => update('codigo', e.target.value)}
            placeholder="INSS, ISS, ANUIDADE..."
          />
        </div>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium">Modo *</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name={`${idPrefix}-modo-${index}`}
              value="percentual"
              checked={ajuste.modo === 'percentual'}
              onChange={() => update('modo', 'percentual')}
            />
            Percentual
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name={`${idPrefix}-modo-${index}`}
              value="valorFixo"
              checked={ajuste.modo === 'valorFixo'}
              onChange={() => update('modo', 'valorFixo')}
            />
            Valor fixo
          </label>
        </div>
        {ajuste.modo === 'percentual' ? (
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-perc-${index}`}>Percentual (%)</Label>
            <Input
              id={`${idPrefix}-perc-${index}`}
              type="number"
              step="0.01"
              value={ajuste.percentual ?? ''}
              onChange={(e) =>
                update(
                  'percentual',
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
            />
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-vf-${index}`}>Valor fixo (R$)</Label>
            <Input
              id={`${idPrefix}-vf-${index}`}
              type="number"
              step="0.01"
              value={ajuste.valorFixo ?? ''}
              onChange={(e) =>
                update(
                  'valorFixo',
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
            />
          </div>
        )}
      </fieldset>
    </div>
  );
}

/* ============================ Helpers ============================ */

interface PopulateSetters {
  setDescricao: (v: string) => void;
  setVigenciaInicio: (v: string) => void;
  setVigenciaFim: (v: string) => void;
  setUnidadeFaturamentoUuid: (v: string) => void;
  setUnidadeAtendimentoUuid: (v: string) => void;
  setTipoBaseCalculo: (v: TipoBaseCalculo) => void;
  setMomentoRepasse: (v: MomentoRepasse) => void;
  setDiaFechamento: (v: string) => void;
  setPrazoDias: (v: string) => void;
  setPrioridade: (v: string) => void;
  setAtivo: (v: boolean) => void;
  setMatchers: (v: MatcherDraft[]) => void;
  setDeducoes: (v: AjusteDraft[]) => void;
  setAcrescimos: (v: AjusteDraft[]) => void;
}

function populateFromCriterio(
  c: CriterioRepasse,
  s: PopulateSetters,
): void {
  s.setDescricao(c.descricao);
  s.setVigenciaInicio(c.vigenciaInicio.slice(0, 10));
  s.setVigenciaFim(c.vigenciaFim ? c.vigenciaFim.slice(0, 10) : '');
  s.setUnidadeFaturamentoUuid(c.unidadeFaturamentoUuid ?? '');
  s.setUnidadeAtendimentoUuid(c.unidadeAtendimentoUuid ?? '');
  s.setTipoBaseCalculo(c.tipoBaseCalculo);
  s.setMomentoRepasse(c.momentoRepasse);
  s.setDiaFechamento(
    c.diaFechamento === null || c.diaFechamento === undefined
      ? ''
      : String(c.diaFechamento),
  );
  s.setPrazoDias(
    c.prazoDias === null || c.prazoDias === undefined
      ? ''
      : String(c.prazoDias),
  );
  s.setPrioridade(String(c.prioridade));
  s.setAtivo(c.ativo);
  const regras = c.regras ?? { matchers: [], deducoes: [], acrescimos: [] };
  s.setMatchers(
    (regras.matchers ?? []).length > 0
      ? regras.matchers.map(matcherFromExisting)
      : [emptyMatcher()],
  );
  s.setDeducoes((regras.deducoes ?? []).map(ajusteFromExisting));
  s.setAcrescimos((regras.acrescimos ?? []).map(ajusteFromExisting));
}
