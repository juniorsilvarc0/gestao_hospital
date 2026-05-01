/**
 * SinaisVitaisFormPage — captura de sinais vitais standalone (PEP).
 *
 * Acessada por:
 *   /pep/:atendimentoUuid/sinais-vitais/novo
 *
 * Layout: grid 2x4 com inputs + EVA dor (slider) + IMC calculado.
 * Validação fisiológica idêntica ao TriagemForm/SinaisVitaisInlineModal
 * (RN-PEP-04). Override = checkbox `valorConfirmado` + persistência.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Loader2, Save } from 'lucide-react';
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
import { createSinaisVitais } from '@/lib/pep-api';
import { useToast } from '@/components/Toast';
import { FAIXAS_VITAIS } from '@/types/atendimentos';
import type { SinaisVitais } from '@/types/atendimentos';
import { cn } from '@/lib/utils';

const schema = z.object({
  paSistolica: z.coerce.number().int().nullish(),
  paDiastolica: z.coerce.number().int().nullish(),
  fc: z.coerce.number().int().nullish(),
  fr: z.coerce.number().int().nullish(),
  temp: z.coerce.number().nullish(),
  satO2: z.coerce.number().int().nullish(),
  glicemia: z.coerce.number().int().nullish(),
  peso: z.coerce.number().nullish(),
  altura: z.coerce.number().nullish(),
  evaDor: z.coerce.number().int().min(0).max(10).default(0),
  observacao: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface VitalDef {
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

const FIELDS: VitalDef[] = [
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

export function SinaisVitaisFormPage(): JSX.Element {
  const { atendimentoUuid = '' } = useParams<{ atendimentoUuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();
  const [valoresConfirmados, setValoresConfirmados] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
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
    },
  });

  const watched = form.watch();
  const peso = typeof watched.peso === 'number' ? watched.peso : null;
  const altura = typeof watched.altura === 'number' ? watched.altura : null;
  const imc = useMemo(() => {
    if (!peso || !altura || altura <= 0) return null;
    const m = altura / 100;
    return peso / (m * m);
  }, [peso, altura]);

  const outOfRange = useMemo(
    () =>
      FIELDS.filter(
        (f) =>
          f.key in FAIXAS_VITAIS &&
          isOutOfRange(
            f.key as keyof typeof FAIXAS_VITAIS,
            watched[f.key] as number | null | undefined,
          ),
      ),
    [watched],
  );

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const sinais: SinaisVitais = {
        paSistolica: values.paSistolica ?? null,
        paDiastolica: values.paDiastolica ?? null,
        fc: values.fc ?? null,
        fr: values.fr ?? null,
        temp: values.temp ?? null,
        satO2: values.satO2 ?? null,
        glicemia: values.glicemia ?? null,
        peso: values.peso ?? null,
        altura: values.altura ?? null,
        evaDor: values.evaDor ?? 0,
      };
      return createSinaisVitais(atendimentoUuid, {
        sinaisVitais: sinais,
        ...(values.observacao ? { observacao: values.observacao } : {}),
        ...(outOfRange.length > 0 ? { valoresConfirmados } : {}),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['pep', 'timeline', atendimentoUuid],
      });
      void queryClient.invalidateQueries({
        queryKey: ['pep', 'resumo', atendimentoUuid],
      });
      showToast({
        variant: 'success',
        title: 'Sinais vitais registrados',
        description: '',
      });
      navigate(`/pep/${atendimentoUuid}`);
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? err.detail ?? err.message
          : 'Falha ao registrar sinais vitais.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
    },
  });

  const submitDisabled =
    mutation.isPending || (outOfRange.length > 0 && !valoresConfirmados);

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/pep/${atendimentoUuid}`)}
        >
          <ArrowLeft aria-hidden="true" />
          Voltar ao PEP
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sinais vitais</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {FIELDS.map((f) => {
                const value = watched[f.key] as number | null | undefined;
                const out =
                  f.key in FAIXAS_VITAIS &&
                  isOutOfRange(f.key as keyof typeof FAIXAS_VITAIS, value);
                return (
                  <div key={f.key} className="space-y-1">
                    <Label htmlFor={`sv-${f.key}`}>
                      {f.label}{' '}
                      <span className="text-xs text-muted-foreground">
                        ({f.unidade})
                      </span>
                    </Label>
                    <Input
                      id={`sv-${f.key}`}
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
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="sv-eva">Dor (EVA 0-10)</Label>
                <Input
                  id="sv-eva"
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
              <div className="space-y-1 sm:col-span-2">
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
                  Valores fora da faixa fisiológica (RN-PEP-04)
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
                  Valores confirmados pelo profissional
                </label>
              </div>
            ) : null}

            <div className="space-y-1">
              <Label htmlFor="sv-obs">Observação</Label>
              <Textarea id="sv-obs" rows={2} {...form.register('observacao')} />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/pep/${atendimentoUuid}`)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitDisabled}
                aria-busy={mutation.isPending}
              >
                {mutation.isPending ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <Save aria-hidden="true" />
                )}
                Registrar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
