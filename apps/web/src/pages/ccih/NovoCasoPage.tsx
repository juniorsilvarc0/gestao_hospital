/**
 * NovoCasoPage — formulário para criar caso CCIH (Fase 10).
 *
 * Inclui editor simplificado de antibiograma (linhas: antibiótico + resultado).
 *
 * Decisões:
 *  - Inputs `pacienteUuid`, `atendimentoUuid`, `setorUuid`, `leitoUuid` são
 *    UUIDs em texto. Autocomplete chega em fase futura.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Plus,
  Save,
  ShieldAlert,
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
import { createCaso } from '@/lib/ccih-api';
import { useToast } from '@/components/Toast';
import {
  ANTIBIOTICO_RESULTADOS,
  ANTIBIOTICO_RESULTADO_LABEL,
  ORIGENS_INFECCAO,
  ORIGEM_INFECCAO_LABEL,
  type AntibiogramaItem,
  type AntibioticoResultado,
  type CreateCasoInput,
  type OrigemInfeccao,
} from '@/types/ccih';

interface AntibiogramaDraft extends AntibiogramaItem {
  /** Marker para forçar re-render quando linha muda. */
  id: string;
}

function emptyAntibiograma(): AntibiogramaDraft {
  return {
    id: crypto.randomUUID(),
    antibiotico: '',
    resultado: 'SENSIVEL',
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NovoCasoPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [pacienteUuid, setPacienteUuid] = useState('');
  const [atendimentoUuid, setAtendimentoUuid] = useState('');
  const [setorUuid, setSetorUuid] = useState('');
  const [leitoUuid, setLeitoUuid] = useState('');
  const [dataDiagnostico, setDataDiagnostico] = useState(todayIso());
  const [topografia, setTopografia] = useState('');
  const [cid, setCid] = useState('');
  const [microorganismo, setMicroorganismo] = useState('');
  const [culturaOrigem, setCulturaOrigem] = useState('');
  const [origemInfeccao, setOrigemInfeccao] = useState<OrigemInfeccao | ''>('');
  const [observacao, setObservacao] = useState('');
  const [antibiograma, setAntibiograma] = useState<AntibiogramaDraft[]>([]);

  const createM = useMutation({
    mutationFn: (input: CreateCasoInput) => createCaso(input),
    onSuccess: (caso) => {
      showToast({
        variant: 'success',
        title: 'Caso CCIH criado',
        description: '',
      });
      void queryClient.invalidateQueries({ queryKey: ['ccih', 'casos', 'list'] });
      navigate(`/ccih/casos/${caso.uuid}`);
    },
    onError: (e) => {
      const detail =
        e instanceof ApiError ? e.detail ?? e.title ?? e.message : 'Erro.';
      showToast({
        variant: 'destructive',
        title: 'Falha ao criar caso',
        description: detail,
      });
    },
  });

  const valid =
    pacienteUuid.trim().length >= 8 &&
    atendimentoUuid.trim().length >= 8 &&
    setorUuid.trim().length >= 8 &&
    dataDiagnostico.length === 10;

  function addAntibiograma(): void {
    setAntibiograma((rows) => [...rows, emptyAntibiograma()]);
  }

  function updateAntibiograma(
    id: string,
    patch: Partial<AntibiogramaDraft>,
  ): void {
    setAntibiograma((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  function removeAntibiograma(id: string): void {
    setAntibiograma((rows) => rows.filter((r) => r.id !== id));
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!valid) return;

    const resistencia: AntibiogramaItem[] = antibiograma
      .filter((r) => r.antibiotico.trim().length > 0)
      .map(({ id: _, ...rest }) => rest);

    createM.mutate({
      pacienteUuid: pacienteUuid.trim(),
      atendimentoUuid: atendimentoUuid.trim(),
      setorUuid: setorUuid.trim(),
      ...(leitoUuid ? { leitoUuid: leitoUuid.trim() } : {}),
      dataDiagnostico,
      ...(topografia ? { topografia: topografia.trim() } : {}),
      ...(cid ? { cid: cid.trim() } : {}),
      ...(microorganismo ? { microorganismo: microorganismo.trim() } : {}),
      ...(culturaOrigem ? { culturaOrigem: culturaOrigem.trim() } : {}),
      ...(origemInfeccao ? { origemInfeccao } : {}),
      ...(resistencia.length > 0 ? { resistencia } : {}),
      ...(observacao ? { observacao: observacao.trim() } : {}),
    });
  }

  return (
    <section className="space-y-4" aria-label="Novo caso CCIH">
      <header className="space-y-1">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="h-3 w-3" />
          Voltar
        </button>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldAlert aria-hidden="true" className="h-6 w-6" />
          Novo Caso CCIH
        </h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Identificação</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="caso-pac">Paciente (UUID) *</Label>
              <Input
                id="caso-pac"
                value={pacienteUuid}
                onChange={(e) => setPacienteUuid(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="caso-aten">Atendimento (UUID) *</Label>
              <Input
                id="caso-aten"
                value={atendimentoUuid}
                onChange={(e) => setAtendimentoUuid(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="caso-set">Setor (UUID) *</Label>
              <Input
                id="caso-set"
                value={setorUuid}
                onChange={(e) => setSetorUuid(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="caso-leito">Leito (UUID)</Label>
              <Input
                id="caso-leito"
                value={leitoUuid}
                onChange={(e) => setLeitoUuid(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="caso-data">Data de diagnóstico *</Label>
              <Input
                id="caso-data"
                type="date"
                value={dataDiagnostico}
                onChange={(e) => setDataDiagnostico(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="caso-orig">Origem da infecção</Label>
              <Select
                id="caso-orig"
                value={origemInfeccao}
                onChange={(e) =>
                  setOrigemInfeccao(e.target.value as OrigemInfeccao | '')
                }
              >
                <option value="">— não definir —</option>
                {ORIGENS_INFECCAO.map((o) => (
                  <option key={o} value={o}>
                    {ORIGEM_INFECCAO_LABEL[o]}
                  </option>
                ))}
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Caracterização</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="caso-top">Topografia</Label>
              <Input
                id="caso-top"
                value={topografia}
                onChange={(e) => setTopografia(e.target.value)}
                placeholder="Ex.: Sítio cirúrgico"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="caso-cid">CID-10</Label>
              <Input
                id="caso-cid"
                value={cid}
                onChange={(e) => setCid(e.target.value)}
                placeholder="Ex.: A41.5"
                maxLength={10}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="caso-micro">Microorganismo</Label>
              <Input
                id="caso-micro"
                value={microorganismo}
                onChange={(e) => setMicroorganismo(e.target.value)}
                placeholder="Ex.: Klebsiella pneumoniae"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="caso-cult">Origem da cultura</Label>
              <Input
                id="caso-cult"
                value={culturaOrigem}
                onChange={(e) => setCulturaOrigem(e.target.value)}
                placeholder="Ex.: hemocultura"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="caso-obs">Observação</Label>
              <Textarea
                id="caso-obs"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Antibiograma</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addAntibiograma}
            >
              <Plus aria-hidden="true" />
              Adicionar
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {antibiograma.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sem antibiograma registrado.
              </p>
            ) : (
              <ul className="space-y-2">
                {antibiograma.map((row) => (
                  <li
                    key={row.id}
                    className="grid grid-cols-1 items-end gap-2 rounded-md border bg-background p-2 sm:grid-cols-[1fr_180px_120px_auto]"
                  >
                    <div className="space-y-1">
                      <Label htmlFor={`atb-name-${row.id}`}>Antibiótico</Label>
                      <Input
                        id={`atb-name-${row.id}`}
                        value={row.antibiotico}
                        onChange={(e) =>
                          updateAntibiograma(row.id, {
                            antibiotico: e.target.value,
                          })
                        }
                        placeholder="Ex.: Meropenem"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`atb-res-${row.id}`}>Resultado</Label>
                      <Select
                        id={`atb-res-${row.id}`}
                        value={row.resultado}
                        onChange={(e) =>
                          updateAntibiograma(row.id, {
                            resultado: e.target.value as AntibioticoResultado,
                          })
                        }
                      >
                        {ANTIBIOTICO_RESULTADOS.map((r) => (
                          <option key={r} value={r}>
                            {ANTIBIOTICO_RESULTADO_LABEL[r]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`atb-cmi-${row.id}`}>CMI</Label>
                      <Input
                        id={`atb-cmi-${row.id}`}
                        value={row.cmi ?? ''}
                        onChange={(e) =>
                          updateAntibiograma(row.id, {
                            cmi: e.target.value || undefined,
                          })
                        }
                        placeholder="opcional"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeAntibiograma(row.id)}
                      aria-label="Remover antibiótico"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!valid || createM.isPending}>
            {createM.isPending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Save aria-hidden="true" />
            )}
            Salvar caso
          </Button>
        </div>
      </form>
    </section>
  );
}

NovoCasoPage.displayName = 'NovoCasoPage';
