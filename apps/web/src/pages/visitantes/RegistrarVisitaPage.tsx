/**
 * RegistrarVisitaPage — formulário para registrar entrada de visita.
 *
 * Trata erros estruturados do backend (RFC 7807):
 *   - RN-VIS-02: limite de visitantes simultâneos por leito.
 *   - RN-VIS-03: visitante bloqueado.
 *   - RN-VIS-04: UTI não autorizado (lista nominal / horário).
 * Cada `code` recebe uma mensagem específica via toast destrutivo.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, DoorOpen, Loader2, Save } from 'lucide-react';
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
import { createVisita } from '@/lib/visitantes-api';
import { useToast } from '@/components/Toast';
import { RN_VIS_CODES, type CreateVisitaInput } from '@/types/visitantes';

const RN_MESSAGES: Record<string, string> = {
  [RN_VIS_CODES.LIMITE_VISITANTES]:
    'Limite de visitantes simultâneos por leito atingido (RN-VIS-02).',
  [RN_VIS_CODES.VISITANTE_BLOQUEADO]:
    'Visitante bloqueado — não pode entrar (RN-VIS-03).',
  [RN_VIS_CODES.UTI_NAO_AUTORIZADO]:
    'UTI: visitante fora da lista nominal ou fora do horário (RN-VIS-04).',
};

export function RegistrarVisitaPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [visitanteUuid, setVisitanteUuid] = useState('');
  const [pacienteUuid, setPacienteUuid] = useState('');
  const [leitoUuid, setLeitoUuid] = useState('');
  const [observacao, setObservacao] = useState('');

  const createM = useMutation({
    mutationFn: (input: CreateVisitaInput) => createVisita(input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Visita registrada',
        description: '',
      });
      void queryClient.invalidateQueries({ queryKey: ['visitas'] });
      navigate('/visitas');
    },
    onError: (e) => {
      let title = 'Falha ao registrar visita';
      let description: string;

      if (e instanceof ApiError) {
        if (e.code && RN_MESSAGES[e.code]) {
          title = 'Visita não autorizada';
          description = RN_MESSAGES[e.code];
        } else if (e.status === 422 && e.detail) {
          description = e.detail;
        } else {
          description = e.detail ?? e.title ?? e.message;
        }
      } else {
        description =
          e instanceof Error ? e.message : 'Erro desconhecido.';
      }

      showToast({ variant: 'destructive', title, description });
    },
  });

  const valid =
    visitanteUuid.trim().length >= 8 && pacienteUuid.trim().length >= 8;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!valid) return;
    createM.mutate({
      visitanteUuid: visitanteUuid.trim(),
      pacienteUuid: pacienteUuid.trim(),
      ...(leitoUuid ? { leitoUuid: leitoUuid.trim() } : {}),
      ...(observacao ? { observacao: observacao.trim() } : {}),
    });
  }

  return (
    <section className="space-y-4" aria-label="Registrar visita">
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
          <DoorOpen aria-hidden="true" className="h-6 w-6" />
          Registrar visita
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
                <Label htmlFor="reg-vis">Visitante (UUID) *</Label>
                <Input
                  id="reg-vis"
                  value={visitanteUuid}
                  onChange={(e) => setVisitanteUuid(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-pac">Paciente (UUID) *</Label>
                <Input
                  id="reg-pac"
                  value={pacienteUuid}
                  onChange={(e) => setPacienteUuid(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-leito">Leito (UUID)</Label>
                <Input
                  id="reg-leito"
                  value={leitoUuid}
                  onChange={(e) => setLeitoUuid(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="reg-obs">Observação</Label>
                <Textarea
                  id="reg-obs"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
              O sistema valida limite por leito (RN-VIS-02), bloqueios
              (RN-VIS-03) e regras especiais de UTI (RN-VIS-04).
            </p>

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
                Registrar entrada
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

RegistrarVisitaPage.displayName = 'RegistrarVisitaPage';
