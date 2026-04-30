/**
 * AgendamentoForm — modal de criação/edição de agendamento.
 *
 * Validações:
 *  - inicio < fim.
 *  - paciente e recurso obrigatórios.
 *  - Tipo obrigatório.
 *
 * `encaixe` quando habilitado exige justificativa (RN-AGE-06).
 */
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { createAgendamento } from '@/lib/agenda-api';
import { useToast } from '@/components/Toast';
import { PacienteAutocomplete } from './PacienteAutocomplete';
import { RecursoSelect } from './RecursoSelect';
import type { TipoAgendamento } from '@/types/agenda';

const TIPOS: TipoAgendamento[] = [
  'CONSULTA',
  'RETORNO',
  'EXAME',
  'PROCEDIMENTO',
  'CIRURGIA',
  'TELECONSULTA',
];

const schema = z
  .object({
    recursoUuid: z.string().min(1, 'Recurso obrigatório'),
    pacienteUuid: z.string().min(1, 'Paciente obrigatório'),
    inicio: z.string().min(1, 'Início obrigatório'),
    fim: z.string().min(1, 'Fim obrigatório'),
    tipo: z.enum([
      'CONSULTA',
      'RETORNO',
      'EXAME',
      'PROCEDIMENTO',
      'CIRURGIA',
      'TELECONSULTA',
    ]),
    observacao: z.string().optional(),
    encaixe: z.boolean().optional(),
    encaixeMotivo: z.string().optional(),
  })
  .refine((v) => new Date(v.inicio).getTime() < new Date(v.fim).getTime(), {
    path: ['fim'],
    message: 'Fim deve ser maior que início',
  })
  .refine((v) => !v.encaixe || (v.encaixeMotivo && v.encaixeMotivo.length >= 3), {
    path: ['encaixeMotivo'],
    message: 'Motivo do encaixe obrigatório (mín. 3 caracteres)',
  });

type FormValues = z.infer<typeof schema>;

interface AgendamentoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRecursoUuid?: string;
  defaultInicio?: string;
  defaultFim?: string;
  defaultEncaixe?: boolean;
  /** Perfis admin/recepção podem usar encaixe (RN-AGE-06). */
  canEncaixe?: boolean;
}

function toLocalDateTimeInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function AgendamentoForm({
  open,
  onOpenChange,
  defaultRecursoUuid,
  defaultInicio,
  defaultFim,
  defaultEncaixe = false,
  canEncaixe = false,
}: AgendamentoFormProps): JSX.Element {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      recursoUuid: defaultRecursoUuid ?? '',
      pacienteUuid: '',
      inicio: toLocalDateTimeInput(defaultInicio),
      fim: toLocalDateTimeInput(defaultFim),
      tipo: 'CONSULTA',
      observacao: '',
      encaixe: defaultEncaixe,
      encaixeMotivo: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      recursoUuid: defaultRecursoUuid ?? '',
      pacienteUuid: '',
      inicio: toLocalDateTimeInput(defaultInicio),
      fim: toLocalDateTimeInput(defaultFim),
      tipo: 'CONSULTA',
      observacao: '',
      encaixe: defaultEncaixe,
      encaixeMotivo: '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultRecursoUuid, defaultInicio, defaultFim, defaultEncaixe]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createAgendamento({
        recursoUuid: values.recursoUuid,
        pacienteUuid: values.pacienteUuid,
        inicio: new Date(values.inicio).toISOString(),
        fim: new Date(values.fim).toISOString(),
        tipo: values.tipo,
        observacao: values.observacao || undefined,
        encaixe: values.encaixe,
        encaixeMotivo: values.encaixeMotivo || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agendamentos'] });
      showToast({
        variant: 'success',
        title: 'Agendamento criado',
        description: 'Slot reservado.',
      });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError
          ? err.detail ?? err.message
          : 'Falha ao criar agendamento.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
    },
  });

  const isEncaixe = form.watch('encaixe');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo agendamento</DialogTitle>
          <DialogDescription>
            Preencha o paciente, horário e tipo de atendimento.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-3"
        >
          <div className="space-y-1">
            <Label htmlFor="recursoUuid">Recurso</Label>
            <RecursoSelect
              id="recursoUuid"
              value={form.watch('recursoUuid')}
              onChange={(uuid) =>
                form.setValue('recursoUuid', uuid, { shouldValidate: true })
              }
            />
            {form.formState.errors.recursoUuid ? (
              <p role="alert" className="text-xs text-destructive">
                {form.formState.errors.recursoUuid.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="pacienteUuid">Paciente</Label>
            <PacienteAutocomplete
              id="pacienteUuid"
              value={form.watch('pacienteUuid')}
              onChange={(uuid) =>
                form.setValue('pacienteUuid', uuid, { shouldValidate: true })
              }
            />
            {form.formState.errors.pacienteUuid ? (
              <p role="alert" className="text-xs text-destructive">
                {form.formState.errors.pacienteUuid.message}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="inicio">Início</Label>
              <Input
                id="inicio"
                type="datetime-local"
                {...form.register('inicio')}
              />
              {form.formState.errors.inicio ? (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.inicio.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="fim">Fim</Label>
              <Input id="fim" type="datetime-local" {...form.register('fim')} />
              {form.formState.errors.fim ? (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.fim.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="tipo">Tipo</Label>
            <Select id="tipo" {...form.register('tipo')}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0) + t.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="observacao">Observação</Label>
            <Textarea
              id="observacao"
              rows={2}
              {...form.register('observacao')}
            />
          </div>

          {canEncaixe ? (
            <div className="space-y-2 rounded-md border p-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" {...form.register('encaixe')} />
                Marcar como encaixe (sobrepõe slot existente)
              </label>
              {isEncaixe ? (
                <div className="space-y-1">
                  <Label htmlFor="encaixeMotivo">Motivo do encaixe</Label>
                  <Input
                    id="encaixeMotivo"
                    {...form.register('encaixeMotivo')}
                  />
                  {form.formState.errors.encaixeMotivo ? (
                    <p role="alert" className="text-xs text-destructive">
                      {form.formState.errors.encaixeMotivo.message}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              aria-busy={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  Criando...
                </>
              ) : (
                'Agendar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
