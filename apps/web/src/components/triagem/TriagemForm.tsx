/**
 * TriagemForm — formulário lateral (Sheet) de classificação de risco Manchester.
 *
 * Campos:
 *  - Queixa principal (textarea, obrigatório).
 *  - Sinais vitais (PA, FC, FR, T, SatO2, glicemia, peso, altura, EVA dor).
 *  - Calcula IMC automaticamente quando peso e altura presentes.
 *  - Cor Manchester (5 botões grandes — RN-ATE-04).
 *  - Validação fisiológica (warning + override) — RN-PEP-04.
 *
 * Submit → POST /v1/atendimentos/:uuid/triagem.
 * Após sucesso: imprime pulseira via window.print() (placeholder).
 */
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Printer } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { createTriagem } from '@/lib/atendimentos-api';
import { useToast } from '@/components/Toast';
import {
  FAIXAS_VITAIS,
  MANCHESTER_CORES,
} from '@/types/atendimentos';
import type {
  AtendimentoResumo,
  ClassificacaoRisco,
} from '@/types/atendimentos';
import { cn } from '@/lib/utils';

const schema = z.object({
  queixaPrincipal: z
    .string()
    .min(3, 'Queixa principal obrigatória (mín. 3 caracteres)'),
  paSistolica: z.coerce.number().int().nullish(),
  paDiastolica: z.coerce.number().int().nullish(),
  fc: z.coerce.number().int().nullish(),
  fr: z.coerce.number().int().nullish(),
  temp: z.coerce.number().nullish(),
  satO2: z.coerce.number().int().nullish(),
  glicemia: z.coerce.number().int().nullish(),
  peso: z.coerce.number().nullish(),
  altura: z.coerce.number().nullish(),
  evaDor: z.coerce.number().int().min(0).max(10).nullish(),
  observacao: z.string().optional(),
  classificacao: z.enum(['VERMELHO', 'LARANJA', 'AMARELO', 'VERDE', 'AZUL'], {
    required_error: 'Classifique o paciente',
  }),
});

type FormValues = z.infer<typeof schema>;

interface TriagemFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimento: AtendimentoResumo | null;
  onSuccess?: () => void;
}

interface VitalFieldDef {
  key: keyof Pick<
    FormValues,
    | 'paSistolica'
    | 'paDiastolica'
    | 'fc'
    | 'fr'
    | 'temp'
    | 'satO2'
    | 'glicemia'
    | 'peso'
    | 'altura'
  >;
  label: string;
  unidade: string;
  step?: string;
}

const VITAL_FIELDS: VitalFieldDef[] = [
  { key: 'paSistolica', label: 'PA sistólica', unidade: 'mmHg' },
  { key: 'paDiastolica', label: 'PA diastólica', unidade: 'mmHg' },
  { key: 'fc', label: 'FC', unidade: 'bpm' },
  { key: 'fr', label: 'FR', unidade: 'irpm' },
  { key: 'temp', label: 'Temperatura', unidade: '°C', step: '0.1' },
  { key: 'satO2', label: 'SatO₂', unidade: '%' },
  { key: 'glicemia', label: 'Glicemia', unidade: 'mg/dL' },
  { key: 'peso', label: 'Peso', unidade: 'kg', step: '0.1' },
  { key: 'altura', label: 'Altura', unidade: 'cm' },
];

function isOutOfRange(
  key: keyof typeof FAIXAS_VITAIS,
  value: number | null | undefined,
): boolean {
  if (value === null || value === undefined || Number.isNaN(value)) return false;
  const range = FAIXAS_VITAIS[key];
  return value < range.min || value > range.max;
}

export function TriagemForm({
  open,
  onOpenChange,
  atendimento,
  onSuccess,
}: TriagemFormProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();
  const [valoresConfirmados, setValoresConfirmados] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      queixaPrincipal: '',
      paSistolica: null,
      paDiastolica: null,
      fc: null,
      fr: null,
      temp: null,
      satO2: null,
      glicemia: null,
      peso: null,
      altura: null,
      evaDor: 0,
      observacao: '',
      classificacao: undefined as unknown as ClassificacaoRisco,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      queixaPrincipal: '',
      paSistolica: null,
      paDiastolica: null,
      fc: null,
      fr: null,
      temp: null,
      satO2: null,
      glicemia: null,
      peso: null,
      altura: null,
      evaDor: 0,
      observacao: '',
      classificacao: undefined as unknown as ClassificacaoRisco,
    });
    setValoresConfirmados(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const watched = form.watch();
  const peso = typeof watched.peso === 'number' ? watched.peso : null;
  const altura = typeof watched.altura === 'number' ? watched.altura : null;
  const imc = useMemo(() => {
    if (!peso || !altura || altura <= 0) return null;
    const m = altura / 100;
    return peso / (m * m);
  }, [peso, altura]);

  const outOfRange = useMemo(() => {
    return VITAL_FIELDS.filter(
      (f) =>
        f.key in FAIXAS_VITAIS &&
        isOutOfRange(
          f.key as keyof typeof FAIXAS_VITAIS,
          watched[f.key] as number | null | undefined,
        ),
    );
  }, [watched]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (!atendimento) {
        return Promise.reject(new Error('Atendimento ausente.'));
      }
      return createTriagem(atendimento.uuid, {
        classificacao: values.classificacao,
        queixaPrincipal: values.queixaPrincipal,
        sinaisVitais: {
          paSistolica: values.paSistolica ?? null,
          paDiastolica: values.paDiastolica ?? null,
          fc: values.fc ?? null,
          fr: values.fr ?? null,
          temp: values.temp ?? null,
          satO2: values.satO2 ?? null,
          glicemia: values.glicemia ?? null,
          peso: values.peso ?? null,
          altura: values.altura ?? null,
          evaDor: values.evaDor ?? null,
        },
        ...(values.observacao ? { observacao: values.observacao } : {}),
        ...(outOfRange.length > 0 ? { valoresConfirmados } : {}),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['atendimentos'] });
      void queryClient.invalidateQueries({ queryKey: ['triagens'] });
      showToast({
        variant: 'success',
        title: 'Triagem registrada',
        description: 'Imprima a pulseira do paciente.',
      });
      // Imprimir pulseira (placeholder).
      try {
        window.print();
      } catch {
        // Em jsdom, window.print pode lançar — silenciamos.
      }
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? err.detail ?? err.message
          : 'Falha ao registrar triagem.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
    },
  });

  if (!atendimento) return null;

  const classifSelected = form.watch('classificacao');
  const submitDisabled =
    mutation.isPending ||
    (outOfRange.length > 0 && !valoresConfirmados);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} widthClassName="w-full sm:max-w-2xl">
      <SheetHeader>
        <SheetTitle>Triagem · {atendimento.pacienteNome}</SheetTitle>
        <SheetDescription>
          {atendimento.numero} · {atendimento.tipo}
        </SheetDescription>
      </SheetHeader>

      <form
        noValidate
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="space-y-4"
      >
        <div className="space-y-1">
          <Label htmlFor="queixaPrincipal">Queixa principal *</Label>
          <Textarea
            id="queixaPrincipal"
            rows={3}
            {...form.register('queixaPrincipal')}
          />
          {form.formState.errors.queixaPrincipal ? (
            <p role="alert" className="text-xs text-destructive">
              {form.formState.errors.queixaPrincipal.message}
            </p>
          ) : null}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Sinais vitais</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {VITAL_FIELDS.map((f) => {
              const value = watched[f.key] as number | null | undefined;
              const out =
                f.key in FAIXAS_VITAIS &&
                isOutOfRange(
                  f.key as keyof typeof FAIXAS_VITAIS,
                  value,
                );
              return (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={`vital-${f.key}`}>
                    {f.label}{' '}
                    <span className="text-xs text-muted-foreground">
                      ({f.unidade})
                    </span>
                  </Label>
                  <Input
                    id={`vital-${f.key}`}
                    type="number"
                    step={f.step ?? '1'}
                    aria-invalid={out}
                    className={cn(
                      out && 'border-amber-500 focus-visible:ring-amber-500',
                    )}
                    {...form.register(f.key, {
                      setValueAs: (v) =>
                        v === '' || v === null || v === undefined
                          ? null
                          : Number(v),
                    })}
                  />
                </div>
              );
            })}
            <div className="space-y-1 sm:col-span-1">
              <Label htmlFor="evaDor">Dor (EVA 0-10)</Label>
              <Input
                id="evaDor"
                type="range"
                min={0}
                max={10}
                step={1}
                {...form.register('evaDor', {
                  setValueAs: (v) => (v === '' ? 0 : Number(v)),
                })}
              />
              <p className="text-xs text-muted-foreground">
                Selecionado: {String(watched.evaDor ?? 0)}
              </p>
            </div>
            <div className="space-y-1 sm:col-span-1">
              <Label>IMC (calculado)</Label>
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {imc ? imc.toFixed(2) : '—'}
              </p>
            </div>
          </div>

          {outOfRange.length > 0 ? (
            <div className="rounded-md border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                Valores fora da faixa fisiológica
              </p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {outOfRange.map((f) => (
                  <li key={f.key}>{f.label}</li>
                ))}
              </ul>
              <label className="mt-2 inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={valoresConfirmados}
                  onChange={(event) =>
                    setValoresConfirmados(event.target.checked)
                  }
                />
                Valores confirmados pelo profissional (RN-PEP-04)
              </label>
            </div>
          ) : null}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">
            Classificação de risco (Manchester) *
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            {MANCHESTER_CORES.map((c) => {
              const selected = classifSelected === c.cor;
              return (
                <button
                  key={c.cor}
                  type="button"
                  onClick={() =>
                    form.setValue('classificacao', c.cor, {
                      shouldValidate: true,
                    })
                  }
                  aria-pressed={selected}
                  className={cn(
                    'flex flex-col items-stretch gap-1 rounded-md border-2 p-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-offset-2',
                    c.bg,
                    c.border,
                    c.text,
                    selected
                      ? 'ring-2 ring-offset-2 ring-foreground'
                      : 'opacity-90 hover:opacity-100',
                  )}
                >
                  <span className="text-xs font-bold uppercase tracking-wide">
                    {c.cor}
                  </span>
                  <span className="text-sm font-semibold">{c.label}</span>
                  <span className="text-[11px]">
                    {c.tempoAlvoMin === null
                      ? '—'
                      : c.tempoAlvoMin === 0
                        ? 'Imediato'
                        : `Até ${c.tempoAlvoMin} min`}
                  </span>
                </button>
              );
            })}
          </div>
          {form.formState.errors.classificacao ? (
            <p role="alert" className="text-xs text-destructive">
              {form.formState.errors.classificacao.message}
            </p>
          ) : null}
        </fieldset>

        <div className="space-y-1">
          <Label htmlFor="observacao">Observação</Label>
          <Textarea
            id="observacao"
            rows={2}
            {...form.register('observacao')}
          />
        </div>

        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={submitDisabled} aria-busy={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Printer aria-hidden="true" />
            )}
            Registrar e imprimir pulseira
          </Button>
        </SheetFooter>
      </form>
    </Sheet>
  );
}
