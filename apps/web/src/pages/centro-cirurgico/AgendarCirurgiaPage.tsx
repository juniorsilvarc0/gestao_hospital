/**
 * AgendarCirurgiaPage — formulário passo-a-passo para agendar cirurgia.
 *
 * Passos:
 *   1. Paciente / atendimento (UUIDs)
 *   2. Procedimentos (principal + secundários)
 *   3. Sala / data / duração
 *   4. Equipe
 *   5. Anestesia / classificação
 *   6. Kit / caderno de gabarito (opcional)
 *
 * Em sucesso navega para o detalhe `/cirurgias/:uuid`. Em 409 (sobreposição
 * na sala) mostra toast claro.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarPlus,
  Loader2,
  Plus,
  Save,
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
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { createCirurgia } from '@/lib/centro-cirurgico-api';
import { useToast } from '@/components/Toast';
import {
  CIRURGIA_CLASSIFICACOES,
  CIRURGIA_CLASSIFICACAO_LABEL,
  CIRURGIA_TIPOS_ANESTESIA,
  CIRURGIA_TIPO_ANESTESIA_LABEL,
  EQUIPE_FUNCAO_LABEL,
  EQUIPE_FUNCOES,
  type CirurgiaClassificacao,
  type CirurgiaTipoAnestesia,
  type EquipeFuncao,
} from '@/types/centro-cirurgico';

interface ProcedimentoLinha {
  procedimentoUuid: string;
  principal: boolean;
  ladoCirurgico?: 'DIREITO' | 'ESQUERDO' | 'BILATERAL';
}

interface EquipeLinha {
  prestadorUuid: string;
  funcao: EquipeFuncao;
  ordem: number;
}

export function AgendarCirurgiaPage(): JSX.Element {
  const navigate = useNavigate();
  const { show: showToast } = useToast();

  const [pacienteUuid, setPacienteUuid] = useState('');
  const [atendimentoUuid, setAtendimentoUuid] = useState('');
  const [procedimentos, setProcedimentos] = useState<ProcedimentoLinha[]>([
    { procedimentoUuid: '', principal: true },
  ]);
  const [salaUuid, setSalaUuid] = useState('');
  const [inicioPrevisto, setInicioPrevisto] = useState('');
  const [duracaoMinutos, setDuracaoMinutos] = useState('60');
  const [cirurgiaoUuid, setCirurgiaoUuid] = useState('');
  const [equipe, setEquipe] = useState<EquipeLinha[]>([]);
  const [classificacao, setClassificacao] =
    useState<CirurgiaClassificacao>('ELETIVA');
  const [tipoAnestesia, setTipoAnestesia] =
    useState<CirurgiaTipoAnestesia>('GERAL');
  const [kitCirurgicoUuid, setKitCirurgicoUuid] = useState('');
  const [cadernoGabaritoUuid, setCadernoGabaritoUuid] = useState('');
  const [observacao, setObservacao] = useState('');

  const procPrincipal = useMemo(
    () => procedimentos.find((p) => p.principal),
    [procedimentos],
  );

  const createM = useMutation({
    mutationFn: createCirurgia,
    onSuccess: (cirurgia) => {
      showToast({
        variant: 'success',
        title: 'Cirurgia agendada',
        description: `Sala: ${cirurgia.salaNome}`,
      });
      navigate(`/cirurgias/${cirurgia.uuid}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        showToast({
          variant: 'destructive',
          title: 'Sobreposição na sala',
          description:
            err.detail ??
            'Há outra cirurgia na sala para esse intervalo. Escolha outra sala ou horário.',
        });
        return;
      }
      const detail =
        err instanceof ApiError
          ? err.detail ?? err.title ?? err.message
          : err instanceof Error
            ? err.message
            : 'Erro.';
      showToast({
        variant: 'destructive',
        title: 'Falha ao agendar',
        description: detail,
      });
    },
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const dur = Number(duracaoMinutos);
    if (
      !pacienteUuid ||
      !salaUuid ||
      !inicioPrevisto ||
      !cirurgiaoUuid ||
      !procPrincipal ||
      !procPrincipal.procedimentoUuid ||
      !Number.isFinite(dur) ||
      dur <= 0
    ) {
      showToast({
        variant: 'destructive',
        title: 'Campos obrigatórios',
        description: 'Verifique paciente, sala, hora, cirurgião e duração.',
      });
      return;
    }
    createM.mutate({
      pacienteUuid,
      ...(atendimentoUuid ? { atendimentoUuid } : {}),
      procedimentoPrincipalUuid: procPrincipal.procedimentoUuid,
      procedimentos: procedimentos
        .filter((p) => p.procedimentoUuid)
        .map((p) => ({
          procedimentoUuid: p.procedimentoUuid,
          principal: p.principal,
          ...(p.ladoCirurgico ? { ladoCirurgico: p.ladoCirurgico } : {}),
        })),
      salaUuid,
      inicioPrevisto: new Date(inicioPrevisto).toISOString(),
      duracaoMinutos: dur,
      cirurgiaoUuid,
      equipe: equipe
        .filter((m) => m.prestadorUuid)
        .map((m) => ({
          prestadorUuid: m.prestadorUuid,
          funcao: m.funcao,
          ordem: m.ordem,
        })),
      classificacao,
      tipoAnestesia,
      ...(kitCirurgicoUuid ? { kitCirurgicoUuid } : {}),
      ...(cadernoGabaritoUuid ? { cadernoGabaritoUuid } : {}),
      ...(observacao ? { observacao } : {}),
    });
  }

  function addProcedimento(): void {
    setProcedimentos((prev) => [
      ...prev,
      { procedimentoUuid: '', principal: false },
    ]);
  }

  function setProcedimentoPrincipal(idx: number): void {
    setProcedimentos((prev) =>
      prev.map((p, i) => ({ ...p, principal: i === idx })),
    );
  }

  function addEquipeMembro(): void {
    setEquipe((prev) => [
      ...prev,
      {
        prestadorUuid: '',
        funcao: 'AUXILIAR',
        ordem: prev.length + 1,
      },
    ]);
  }

  return (
    <section className="space-y-4" aria-label="Agendar nova cirurgia">
      <header className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="h-3 w-3" />
          Voltar
        </button>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <CalendarPlus aria-hidden="true" className="h-6 w-6" />
          Agendar nova cirurgia
        </h1>
        <p className="text-sm text-muted-foreground">
          Preencha os campos abaixo. Sobreposição na sala é validada pelo
          backend (RN-CC-02).
        </p>
      </header>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">1. Paciente</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="pac-uuid">Paciente (UUID) *</Label>
              <Input
                id="pac-uuid"
                value={pacienteUuid}
                onChange={(e) => setPacienteUuid(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="aten-uuid">Atendimento (UUID)</Label>
              <Input
                id="aten-uuid"
                value={atendimentoUuid}
                onChange={(e) => setAtendimentoUuid(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">2. Procedimentos</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addProcedimento}
            >
              <Plus aria-hidden="true" />
              Adicionar
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {procedimentos.map((p, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-12"
              >
                <div className="space-y-1 sm:col-span-6">
                  <Label htmlFor={`proc-${idx}`}>Procedimento UUID *</Label>
                  <Input
                    id={`proc-${idx}`}
                    value={p.procedimentoUuid}
                    onChange={(e) =>
                      setProcedimentos((prev) =>
                        prev.map((x, i) =>
                          i === idx
                            ? { ...x, procedimentoUuid: e.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                </div>
                <div className="space-y-1 sm:col-span-3">
                  <Label htmlFor={`lado-${idx}`}>Lado</Label>
                  <Select
                    id={`lado-${idx}`}
                    value={p.ladoCirurgico ?? ''}
                    onChange={(e) =>
                      setProcedimentos((prev) =>
                        prev.map((x, i) =>
                          i === idx
                            ? {
                                ...x,
                                ladoCirurgico: e.target.value
                                  ? (e.target.value as
                                      | 'DIREITO'
                                      | 'ESQUERDO'
                                      | 'BILATERAL')
                                  : undefined,
                              }
                            : x,
                        ),
                      )
                    }
                  >
                    <option key="__empty__" value="">—</option>
                    <option value="DIREITO">Direito</option>
                    <option value="ESQUERDO">Esquerdo</option>
                    <option value="BILATERAL">Bilateral</option>
                  </Select>
                </div>
                <div className="flex items-end gap-2 sm:col-span-3">
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="radio"
                      name="principal"
                      checked={p.principal}
                      onChange={() => setProcedimentoPrincipal(idx)}
                    />
                    Principal
                  </label>
                  {procedimentos.length > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setProcedimentos((prev) =>
                          prev.filter((_, i) => i !== idx),
                        )
                      }
                      aria-label="Remover procedimento"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">3. Sala e horário</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="sala">Sala (UUID) *</Label>
              <Input
                id="sala"
                value={salaUuid}
                onChange={(e) => setSalaUuid(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="inicio">Início previsto *</Label>
              <Input
                id="inicio"
                type="datetime-local"
                value={inicioPrevisto}
                onChange={(e) => setInicioPrevisto(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dur">Duração estimada (min) *</Label>
              <Input
                id="dur"
                type="number"
                min="1"
                value={duracaoMinutos}
                onChange={(e) => setDuracaoMinutos(e.target.value)}
                required
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">4. Equipe</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addEquipeMembro}
            >
              <Plus aria-hidden="true" />
              Adicionar membro
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="cirurgiao">Cirurgião principal (UUID) *</Label>
              <Input
                id="cirurgiao"
                value={cirurgiaoUuid}
                onChange={(e) => setCirurgiaoUuid(e.target.value)}
                required
              />
            </div>

            {equipe.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum membro adicional informado.
              </p>
            ) : (
              equipe.map((m, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-12"
                >
                  <div className="space-y-1 sm:col-span-6">
                    <Label htmlFor={`prest-${idx}`}>Prestador (UUID)</Label>
                    <Input
                      id={`prest-${idx}`}
                      value={m.prestadorUuid}
                      onChange={(e) =>
                        setEquipe((prev) =>
                          prev.map((x, i) =>
                            i === idx
                              ? { ...x, prestadorUuid: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-3">
                    <Label htmlFor={`func-${idx}`}>Função</Label>
                    <Select
                      id={`func-${idx}`}
                      value={m.funcao}
                      onChange={(e) =>
                        setEquipe((prev) =>
                          prev.map((x, i) =>
                            i === idx
                              ? { ...x, funcao: e.target.value as EquipeFuncao }
                              : x,
                          ),
                        )
                      }
                    >
                      {EQUIPE_FUNCOES.map((f) => (
                        <option key={f} value={f}>
                          {EQUIPE_FUNCAO_LABEL[f]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor={`ord-${idx}`}>Ordem</Label>
                    <Input
                      id={`ord-${idx}`}
                      type="number"
                      min="1"
                      value={m.ordem}
                      onChange={(e) =>
                        setEquipe((prev) =>
                          prev.map((x, i) =>
                            i === idx
                              ? { ...x, ordem: Number(e.target.value) || 1 }
                              : x,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="flex items-end sm:col-span-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setEquipe((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label="Remover membro"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">5. Anestesia / Classificação</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="classif">Classificação *</Label>
              <Select
                id="classif"
                value={classificacao}
                onChange={(e) =>
                  setClassificacao(e.target.value as CirurgiaClassificacao)
                }
              >
                {CIRURGIA_CLASSIFICACOES.map((c) => (
                  <option key={c} value={c}>
                    {CIRURGIA_CLASSIFICACAO_LABEL[c]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="anest">Tipo de anestesia *</Label>
              <Select
                id="anest"
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              6. Kit / Caderno de gabarito (opcional)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="kit">Kit cirúrgico (UUID)</Label>
              <Input
                id="kit"
                value={kitCirurgicoUuid}
                onChange={(e) => setKitCirurgicoUuid(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gab">Caderno gabarito (UUID)</Label>
              <Input
                id="gab"
                value={cadernoGabaritoUuid}
                onChange={(e) => setCadernoGabaritoUuid(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="obs">Observação</Label>
              <Textarea
                id="obs"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={createM.isPending}>
            {createM.isPending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Save aria-hidden="true" />
            )}
            Agendar
          </Button>
        </div>
      </form>
    </section>
  );
}
