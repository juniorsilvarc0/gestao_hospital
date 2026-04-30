/**
 * AlergiasField — sub-form com lista dinâmica de alergias.
 *
 * Renderiza linhas com substância, gravidade e observação.
 * Botão `+ Adicionar` cria nova linha; `Remover` deleta.
 */
import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import { Plus, X } from 'lucide-react';
import { Button, Input, Label, Select } from '@/components/ui';
import type { PacienteFormValues } from './paciente-schema';

interface AlergiasFieldProps {
  control: Control<PacienteFormValues>;
  register: UseFormRegister<PacienteFormValues>;
}

export function AlergiasField({
  control,
  register,
}: AlergiasFieldProps): JSX.Element {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'alergias',
  });

  return (
    <fieldset className="space-y-3">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-semibold">Alergias</legend>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            append({ substancia: '', gravidade: undefined, observacao: '' })
          }
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Adicionar
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma alergia registrada.
        </p>
      ) : null}

      <ul className="space-y-2">
        {fields.map((field, idx) => (
          <li
            key={field.id}
            className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-12"
          >
            <div className="space-y-1 sm:col-span-4">
              <Label htmlFor={`alergias.${idx}.substancia`}>Substância</Label>
              <Input
                id={`alergias.${idx}.substancia`}
                placeholder="Ex.: Dipirona"
                {...register(`alergias.${idx}.substancia` as const)}
              />
            </div>
            <div className="space-y-1 sm:col-span-3">
              <Label htmlFor={`alergias.${idx}.gravidade`}>Gravidade</Label>
              <Select
                id={`alergias.${idx}.gravidade`}
                {...register(`alergias.${idx}.gravidade` as const)}
              >
                <option value="">--</option>
                <option value="LEVE">Leve</option>
                <option value="MODERADA">Moderada</option>
                <option value="GRAVE">Grave</option>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-4">
              <Label htmlFor={`alergias.${idx}.observacao`}>Observação</Label>
              <Input
                id={`alergias.${idx}.observacao`}
                {...register(`alergias.${idx}.observacao` as const)}
              />
            </div>
            <div className="flex items-end justify-end sm:col-span-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remover alergia"
                onClick={() => remove(idx)}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
