/**
 * NovaGlosaPage — formulário de cadastro manual de glosa.
 *
 * Campos: conta, item da conta (opcional), guia TISS (opcional), motivo,
 *         código TISS (opcional), valor, data, prazo.
 */
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileWarning, Loader2, Save } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { createGlosaManual } from '@/lib/glosas-api';
import { useToast } from '@/components/Toast';
import type { CreateGlosaManualInput } from '@/types/glosas';

export function NovaGlosaPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [contaUuid, setContaUuid] = useState('');
  const [contaItemUuid, setContaItemUuid] = useState('');
  const [guiaTissUuid, setGuiaTissUuid] = useState('');
  const [motivo, setMotivo] = useState('');
  const [codigoGlosaTiss, setCodigoGlosaTiss] = useState('');
  const [valorGlosado, setValorGlosado] = useState('');
  const [dataGlosa, setDataGlosa] = useState('');
  const [prazoRecurso, setPrazoRecurso] = useState('');

  const valor = Number(valorGlosado);
  const valid =
    contaUuid.trim().length > 0 &&
    motivo.trim().length >= 5 &&
    Number.isFinite(valor) &&
    valor > 0 &&
    dataGlosa.length > 0 &&
    prazoRecurso.length > 0;

  const createM = useMutation({
    mutationFn: (input: CreateGlosaManualInput) => createGlosaManual(input),
    onSuccess: (g) => {
      showToast({
        variant: 'success',
        title: 'Glosa criada',
        description: '',
      });
      void queryClient.invalidateQueries({ queryKey: ['glosas'] });
      navigate(`/glosas/${g.uuid}`);
    },
    onError: (err) => {
      const detail =
        err instanceof ApiError
          ? err.detail ?? err.title ?? err.message
          : err instanceof Error
            ? err.message
            : 'Erro.';
      showToast({
        variant: 'destructive',
        title: 'Falha ao criar glosa',
        description: detail,
      });
    },
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!valid) return;
    createM.mutate({
      contaUuid: contaUuid.trim(),
      ...(contaItemUuid ? { contaItemUuid } : {}),
      ...(guiaTissUuid ? { guiaTissUuid } : {}),
      motivo: motivo.trim(),
      ...(codigoGlosaTiss ? { codigoGlosaTiss } : {}),
      valorGlosado: valor,
      dataGlosa,
      prazoRecurso,
    });
  }

  return (
    <section className="space-y-4" aria-label="Nova glosa manual">
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
          <FileWarning aria-hidden="true" className="h-6 w-6" />
          Nova glosa
        </h1>
        <p className="text-sm text-muted-foreground">
          Lançamento manual quando a glosa não veio por TISS (ex.: glosa
          interna, ajuste).
        </p>
      </header>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Dados da glosa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ng-conta">Conta (UUID) *</Label>
              <Input
                id="ng-conta"
                value={contaUuid}
                onChange={(e) => setContaUuid(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ng-item">Item da conta (UUID)</Label>
                <Input
                  id="ng-item"
                  value={contaItemUuid}
                  onChange={(e) => setContaItemUuid(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ng-guia">Guia TISS (UUID)</Label>
                <Input
                  id="ng-guia"
                  value={guiaTissUuid}
                  onChange={(e) => setGuiaTissUuid(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ng-motivo">Motivo da glosa *</Label>
              <Textarea
                id="ng-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                required
                minLength={5}
                rows={4}
                placeholder="Descreva detalhadamente o motivo (mín. 5 caracteres)."
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="ng-cod">Código TISS</Label>
                <Input
                  id="ng-cod"
                  value={codigoGlosaTiss}
                  onChange={(e) => setCodigoGlosaTiss(e.target.value)}
                  placeholder="Ex.: 1909"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ng-valor">Valor glosado *</Label>
                <Input
                  id="ng-valor"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={valorGlosado}
                  onChange={(e) => setValorGlosado(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ng-data">Data da glosa *</Label>
                <Input
                  id="ng-data"
                  type="date"
                  value={dataGlosa}
                  onChange={(e) => setDataGlosa(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ng-prazo">Prazo para recurso *</Label>
              <Input
                id="ng-prazo"
                type="date"
                value={prazoRecurso}
                onChange={(e) => setPrazoRecurso(e.target.value)}
                required
              />
            </div>
          </CardContent>
        </Card>
        <footer className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/glosas')}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={!valid || createM.isPending}>
            {createM.isPending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Save aria-hidden="true" />
            )}
            Criar glosa
          </Button>
        </footer>
      </form>
    </section>
  );
}

NovaGlosaPage.displayName = 'NovaGlosaPage';
