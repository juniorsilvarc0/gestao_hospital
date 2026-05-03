/**
 * PacienteAgendarPage — formulário de auto-agendamento.
 *
 * Como o backend de R-B aceita `procedimentoUuid`, `prestadorUuid`,
 * `inicio`, `fim`: pedimos esses dados em pt-BR claro. Em uma fase futura,
 * dá para buscar listas de procedimentos e profissionais disponíveis;
 * por ora, deixamos campos UUID com dica.
 *
 * TODO: integrar com endpoints de listagem de procedimentos/prestadores
 * permitidos para auto-agendamento (ainda não exposto no R-B).
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Calendar, CheckCircle2, Loader2 } from 'lucide-react';
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
import { postPacienteAgendamento } from '@/lib/portal-paciente-api';
import { useToast } from '@/components/Toast';

interface FormState {
  procedimentoUuid: string;
  prestadorUuid: string;
  data: string;
  hora: string;
  duracao: number;
  observacao: string;
}

const DEFAULT_FORM: FormState = {
  procedimentoUuid: '',
  prestadorUuid: '',
  data: '',
  hora: '',
  duracao: 30,
  observacao: '',
};

export function PacienteAgendarPage(): JSX.Element {
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const mutation = useMutation({
    mutationFn: postPacienteAgendamento,
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Consulta agendada com sucesso',
        description: 'Você receberá uma confirmação em breve.',
      });
      navigate('/portal/paciente/agendamentos');
    },
    onError: (err) => {
      const detail =
        err instanceof ApiError
          ? err.detail ?? err.title ?? err.message
          : err instanceof Error
            ? err.message
            : 'Tente novamente em alguns minutos.';
      showToast({
        variant: 'destructive',
        title: 'Não foi possível agendar',
        description: detail,
      });
    },
  });

  const valido =
    form.procedimentoUuid.trim().length > 0 &&
    form.prestadorUuid.trim().length > 0 &&
    form.data.length > 0 &&
    form.hora.length > 0 &&
    form.duracao > 0;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!valido) return;
    const inicio = new Date(`${form.data}T${form.hora}:00`);
    const fim = new Date(inicio.getTime() + form.duracao * 60_000);
    mutation.mutate({
      procedimentoUuid: form.procedimentoUuid.trim(),
      prestadorUuid: form.prestadorUuid.trim(),
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      ...(form.observacao.trim() ? { observacao: form.observacao.trim() } : {}),
    });
  }

  return (
    <section className="max-w-2xl space-y-4" aria-label="Agendar consulta">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Calendar aria-hidden="true" className="h-6 w-6" />
          Agendar consulta
        </h1>
        <p className="text-base text-muted-foreground">
          Preencha os dados abaixo para agendar.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detalhes do agendamento</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={handleSubmit}
            aria-label="Formulário de agendamento"
          >
            <div className="space-y-1">
              <Label htmlFor="ag-proc">Tipo de atendimento *</Label>
              <Input
                id="ag-proc"
                value={form.procedimentoUuid}
                onChange={(e) =>
                  setForm((f) => ({ ...f, procedimentoUuid: e.target.value }))
                }
                placeholder="Identificador do procedimento"
                required
              />
              <p className="text-xs text-muted-foreground">
                Por enquanto, informe o identificador fornecido pela
                secretaria.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ag-prest">Profissional *</Label>
              <Input
                id="ag-prest"
                value={form.prestadorUuid}
                onChange={(e) =>
                  setForm((f) => ({ ...f, prestadorUuid: e.target.value }))
                }
                placeholder="Identificador do profissional"
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="ag-data">Data *</Label>
                <Input
                  id="ag-data"
                  type="date"
                  value={form.data}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, data: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ag-hora">Hora *</Label>
                <Input
                  id="ag-hora"
                  type="time"
                  value={form.hora}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, hora: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ag-dur">Duração (min)</Label>
                <Input
                  id="ag-dur"
                  type="number"
                  min={5}
                  step={5}
                  value={form.duracao}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      duracao: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ag-obs">Observação (opcional)</Label>
              <Textarea
                id="ag-obs"
                value={form.observacao}
                onChange={(e) =>
                  setForm((f) => ({ ...f, observacao: e.target.value }))
                }
                rows={3}
                placeholder="Algum detalhe que ajude o profissional?"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button asChild variant="outline" type="button">
                <Link to="/portal/paciente/agendamentos">Voltar</Link>
              </Button>
              <Button
                type="submit"
                disabled={!valido || mutation.isPending}
                aria-busy={mutation.isPending}
              >
                {mutation.isPending ? (
                  <Loader2
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                  />
                ) : (
                  <CheckCircle2 aria-hidden="true" />
                )}
                Confirmar agendamento
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

PacienteAgendarPage.displayName = 'PacienteAgendarPage';
