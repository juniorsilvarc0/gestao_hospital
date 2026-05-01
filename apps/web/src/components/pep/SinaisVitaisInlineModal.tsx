/**
 * SinaisVitaisInlineModal — modal para captura rápida de sinais vitais a
 * partir do editor de evolução.
 *
 * Usa as mesmas faixas fisiológicas (RN-PEP-04) e o mesmo override
 * `valoresConfirmados` do TriagemForm.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Dialog, Input, Label } from '@/components/ui';
import { FAIXAS_VITAIS } from '@/types/atendimentos';
import type { SinaisVitais } from '@/types/atendimentos';
import { cn } from '@/lib/utils';

const FIELDS: {
  key: keyof Pick<
    SinaisVitais,
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
}[] = [
  { key: 'paSistolica', label: 'PA sistólica', unidade: 'mmHg' },
  { key: 'paDiastolica', label: 'PA diastólica', unidade: 'mmHg' },
  { key: 'fc', label: 'FC', unidade: 'bpm' },
  { key: 'fr', label: 'FR', unidade: 'irpm' },
  { key: 'temp', label: 'T', unidade: '°C', step: '0.1' },
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
  const r = FAIXAS_VITAIS[key];
  return value < r.min || value > r.max;
}

interface SinaisVitaisInlineModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (
    values: SinaisVitais,
    valoresConfirmados: boolean,
    evaDor: number,
  ) => void;
}

export function SinaisVitaisInlineModal({
  open,
  onOpenChange,
  onConfirm,
}: SinaisVitaisInlineModalProps): JSX.Element {
  const [values, setValues] = useState<SinaisVitais>({});
  const [evaDor, setEvaDor] = useState(0);
  const [confirmado, setConfirmado] = useState(false);

  function setField<K extends keyof SinaisVitais>(
    key: K,
    raw: string,
  ): void {
    if (raw === '') {
      setValues((v) => ({ ...v, [key]: null }));
      return;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) return;
    setValues((v) => ({ ...v, [key]: num }));
  }

  const outOfRange = useMemo(
    () =>
      FIELDS.filter(
        (f) =>
          f.key in FAIXAS_VITAIS &&
          isOutOfRange(
            f.key as keyof typeof FAIXAS_VITAIS,
            values[f.key],
          ),
      ),
    [values],
  );

  const imc = useMemo(() => {
    const peso = values.peso ?? null;
    const altura = values.altura ?? null;
    if (!peso || !altura || altura <= 0) return null;
    const m = altura / 100;
    return peso / (m * m);
  }, [values.peso, values.altura]);

  const blocked = outOfRange.length > 0 && !confirmado;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">Sinais vitais (inline)</h2>
        <p className="text-sm text-muted-foreground">
          Estes valores serão inseridos no corpo da evolução como bloco
          estruturado.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {FIELDS.map((f) => {
          const value = values[f.key];
          const out =
            f.key in FAIXAS_VITAIS &&
            isOutOfRange(f.key as keyof typeof FAIXAS_VITAIS, value);
          return (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`vital-inline-${f.key}`}>
                {f.label}{' '}
                <span className="text-xs text-muted-foreground">
                  ({f.unidade})
                </span>
              </Label>
              <Input
                id={`vital-inline-${f.key}`}
                type="number"
                step={f.step ?? '1'}
                value={value ?? ''}
                onChange={(e) => setField(f.key, e.target.value)}
                aria-invalid={out}
                className={cn(
                  out && 'border-amber-500 focus-visible:ring-amber-500',
                )}
              />
            </div>
          );
        })}
        <div className="space-y-1">
          <Label htmlFor="vital-inline-eva">Dor (EVA 0-10)</Label>
          <Input
            id="vital-inline-eva"
            type="range"
            min={0}
            max={10}
            step={1}
            value={evaDor}
            onChange={(e) => setEvaDor(Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">{evaDor}</p>
        </div>
        <div className="space-y-1">
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
            Fora da faixa fisiológica (RN-PEP-04)
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {outOfRange.map((f) => (
              <li key={f.key}>{f.label}</li>
            ))}
          </ul>
          <label className="mt-2 inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={confirmado}
              onChange={(e) => setConfirmado(e.target.checked)}
            />
            Valores confirmados pelo profissional
          </label>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={blocked}
          onClick={() => {
            onConfirm(values, confirmado, evaDor);
            onOpenChange(false);
          }}
        >
          Inserir no editor
        </Button>
      </div>
    </Dialog>
  );
}
