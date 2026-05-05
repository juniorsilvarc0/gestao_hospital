/**
 * EnderecoFields — sub-form de endereço do paciente.
 *
 * Recebe um `prefix` (ex.: `endereco`) e renderiza os campos como
 * `endereco.cep`, `endereco.logradouro`, etc., delegando ao
 * `react-hook-form` o gerenciamento de estado.
 */
import type { UseFormRegister, FieldErrors } from 'react-hook-form';
import { Input, Label, Select } from '@/components/ui';
import type { PacienteFormValues } from './paciente-schema';

interface EnderecoFieldsProps {
  register: UseFormRegister<PacienteFormValues>;
  errors?: FieldErrors<PacienteFormValues>['endereco'];
}

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export function EnderecoFields({
  register,
  errors,
}: EnderecoFieldsProps): JSX.Element {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">Endereço</legend>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="endereco.cep">CEP</Label>
          <Input
            id="endereco.cep"
            placeholder="00000-000"
            {...register('endereco.cep')}
          />
          {errors?.cep ? (
            <p role="alert" className="text-xs text-destructive">
              {errors.cep.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="endereco.logradouro">Logradouro</Label>
          <Input
            id="endereco.logradouro"
            {...register('endereco.logradouro')}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="endereco.numero">Número</Label>
          <Input id="endereco.numero" {...register('endereco.numero')} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="endereco.complemento">Complemento</Label>
          <Input
            id="endereco.complemento"
            {...register('endereco.complemento')}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="endereco.bairro">Bairro</Label>
          <Input id="endereco.bairro" {...register('endereco.bairro')} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="endereco.cidade">Cidade</Label>
          <Input id="endereco.cidade" {...register('endereco.cidade')} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="endereco.uf">UF</Label>
          <Select id="endereco.uf" {...register('endereco.uf')}>
            <option key="__empty__" value="">--</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </fieldset>
  );
}
