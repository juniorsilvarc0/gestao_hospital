/**
 * NovoProntuarioPage — formulário para registrar prontuário físico (Fase 10).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, Loader2, Save } from 'lucide-react';
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
import { createProntuario } from '@/lib/same-api';
import { useToast } from '@/components/Toast';
import type { CreateProntuarioInput } from '@/types/same';

export function NovoProntuarioPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [pacienteUuid, setPacienteUuid] = useState('');
  const [numeroPasta, setNumeroPasta] = useState('');
  const [localizacao, setLocalizacao] = useState('');
  const [observacao, setObservacao] = useState('');

  const createM = useMutation({
    mutationFn: (input: CreateProntuarioInput) => createProntuario(input),
    onSuccess: (p) => {
      showToast({
        variant: 'success',
        title: 'Prontuário criado',
        description: `Pasta ${p.numeroPasta} cadastrada.`,
      });
      void queryClient.invalidateQueries({
        queryKey: ['same', 'prontuarios', 'list'],
      });
      navigate(`/same/prontuarios/${p.uuid}`);
    },
    onError: (e) => {
      const detail =
        e instanceof ApiError ? e.detail ?? e.title ?? e.message : 'Erro.';
      showToast({
        variant: 'destructive',
        title: 'Falha ao criar prontuário',
        description: detail,
      });
    },
  });

  const valid =
    pacienteUuid.trim().length >= 8 && numeroPasta.trim().length >= 1;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!valid) return;
    createM.mutate({
      pacienteUuid: pacienteUuid.trim(),
      numeroPasta: numeroPasta.trim(),
      ...(localizacao ? { localizacao: localizacao.trim() } : {}),
      ...(observacao ? { observacao: observacao.trim() } : {}),
    });
  }

  return (
    <section className="space-y-4" aria-label="Novo prontuário SAME">
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
          <Archive aria-hidden="true" className="h-6 w-6" />
          Novo Prontuário
        </h1>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Dados</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="prnt-pac">Paciente (UUID) *</Label>
                <Input
                  id="prnt-pac"
                  value={pacienteUuid}
                  onChange={(e) => setPacienteUuid(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="prnt-num">Número da pasta *</Label>
                <Input
                  id="prnt-num"
                  value={numeroPasta}
                  onChange={(e) => setNumeroPasta(e.target.value)}
                  placeholder="Ex.: P-2026-0001"
                  required
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="prnt-loc">Localização</Label>
                <Input
                  id="prnt-loc"
                  value={localizacao}
                  onChange={(e) => setLocalizacao(e.target.value)}
                  placeholder="Ex.: ARMARIO 5, ESTANTE 3"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="prnt-obs">Observação</Label>
                <Textarea
                  id="prnt-obs"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

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
                Salvar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

NovoProntuarioPage.displayName = 'NovoProntuarioPage';
