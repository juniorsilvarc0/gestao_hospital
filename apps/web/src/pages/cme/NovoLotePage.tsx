/**
 * NovoLotePage — formulário para criar um lote de esterilização (CME).
 *
 * Campos: número, método, dataEsterilização, validade, responsável (UUID).
 *
 * Decisões:
 *  - Autocomplete de prestadores foi adiado (deferred). O formulário aceita
 *    UUID em texto até a Trilha de busca/autocomplete chegar (precisa endpoint
 *    de busca por nome no backend).
 *  - Validade default: 30 dias após dataEsterilizacao (depende do método —
 *    operador pode ajustar).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FlaskConical, Loader2, Save } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { createLote } from '@/lib/cme-api';
import { useToast } from '@/components/Toast';
import {
  METODOS_ESTERILIZACAO,
  METODO_ESTERILIZACAO_LABEL,
  type CreateLoteInput,
  type MetodoEsterilizacao,
} from '@/types/cme';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function plus30Days(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function NovoLotePage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [numero, setNumero] = useState('');
  const [metodo, setMetodo] = useState<MetodoEsterilizacao>('AUTOCLAVE_VAPOR');
  const [dataEsterilizacao, setDataEsterilizacao] = useState(todayIso());
  const [validade, setValidade] = useState(plus30Days(todayIso()));
  const [responsavelUuid, setResponsavelUuid] = useState('');

  // Recalcula sugestão de validade quando muda data e operador não tocou.
  const [validadeTouched, setValidadeTouched] = useState(false);
  useEffect(() => {
    if (!validadeTouched) {
      setValidade(plus30Days(dataEsterilizacao));
    }
  }, [dataEsterilizacao, validadeTouched]);

  const createM = useMutation({
    mutationFn: (input: CreateLoteInput) => createLote(input),
    onSuccess: (lote) => {
      showToast({
        variant: 'success',
        title: 'Lote criado',
        description: `Lote ${lote.numero} cadastrado.`,
      });
      void queryClient.invalidateQueries({ queryKey: ['cme', 'lotes', 'list'] });
      navigate(`/cme/lotes/${lote.uuid}`);
    },
    onError: (e) => {
      const detail =
        e instanceof ApiError ? e.detail ?? e.title ?? e.message : 'Erro.';
      showToast({
        variant: 'destructive',
        title: 'Falha ao criar lote',
        description: detail,
      });
    },
  });

  const valid =
    numero.trim().length >= 1 &&
    dataEsterilizacao.length === 10 &&
    validade.length === 10 &&
    responsavelUuid.trim().length >= 8;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!valid) return;
    createM.mutate({
      numero: numero.trim(),
      metodo,
      dataEsterilizacao: `${dataEsterilizacao}T00:00:00Z`,
      validade,
      responsavelUuid: responsavelUuid.trim(),
    });
  }

  return (
    <section className="space-y-4" aria-label="Novo lote CME">
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
          <FlaskConical aria-hidden="true" className="h-6 w-6" />
          Novo Lote CME
        </h1>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Dados do lote</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="lote-num">Número do lote *</Label>
                <Input
                  id="lote-num"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="Ex.: 2026-04-001"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lote-metodo">Método *</Label>
                <Select
                  id="lote-metodo"
                  value={metodo}
                  onChange={(e) =>
                    setMetodo(e.target.value as MetodoEsterilizacao)
                  }
                  required
                >
                  {METODOS_ESTERILIZACAO.map((m) => (
                    <option key={m} value={m}>
                      {METODO_ESTERILIZACAO_LABEL[m]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="lote-dt">Data esterilização *</Label>
                <Input
                  id="lote-dt"
                  type="date"
                  value={dataEsterilizacao}
                  onChange={(e) => setDataEsterilizacao(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lote-val">Validade *</Label>
                <Input
                  id="lote-val"
                  type="date"
                  value={validade}
                  onChange={(e) => {
                    setValidade(e.target.value);
                    setValidadeTouched(true);
                  }}
                  required
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="lote-resp">Responsável (UUID prestador) *</Label>
                <Input
                  id="lote-resp"
                  value={responsavelUuid}
                  onChange={(e) => setResponsavelUuid(e.target.value)}
                  placeholder="UUID do prestador responsável"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Autocomplete de prestadores chega em fase futura.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(-1)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!valid || createM.isPending}>
                {createM.isPending ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Save aria-hidden="true" />
                )}
                Salvar lote
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

NovoLotePage.displayName = 'NovoLotePage';
