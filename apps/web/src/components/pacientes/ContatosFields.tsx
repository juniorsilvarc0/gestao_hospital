/**
 * ContatosFields — sub-form de contatos do paciente.
 *
 * Inclui:
 *  - E-mail.
 *  - Lista dinâmica de telefones (tipo, número, whatsapp).
 *  - Bloco fixo de contato de emergência.
 */
import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import { Plus, X } from 'lucide-react';
import { Button, Input, Label, Select } from '@/components/ui';
import type { PacienteFormValues } from './paciente-schema';

interface ContatosFieldsProps {
  control: Control<PacienteFormValues>;
  register: UseFormRegister<PacienteFormValues>;
}

export function ContatosFields({
  control,
  register,
}: ContatosFieldsProps): JSX.Element {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'contatos.telefones',
  });

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">Contatos</legend>

      <div className="space-y-1">
        <Label htmlFor="contatos.email">E-mail</Label>
        <Input
          id="contatos.email"
          type="email"
          placeholder="paciente@exemplo.com"
          {...register('contatos.email')}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Telefones</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              append({ tipo: 'CELULAR', numero: '', whatsapp: false })
            }
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Adicionar
          </Button>
        </div>
        {fields.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum telefone cadastrado.
          </p>
        ) : null}
        <ul className="space-y-2">
          {fields.map((field, idx) => (
            <li
              key={field.id}
              className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-12"
            >
              <div className="space-y-1 sm:col-span-3">
                <Label htmlFor={`contatos.telefones.${idx}.tipo`}>Tipo</Label>
                <Select
                  id={`contatos.telefones.${idx}.tipo`}
                  {...register(`contatos.telefones.${idx}.tipo` as const)}
                >
                  <option value="CELULAR">Celular</option>
                  <option value="RESIDENCIAL">Residencial</option>
                  <option value="COMERCIAL">Comercial</option>
                  <option value="OUTRO">Outro</option>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-5">
                <Label htmlFor={`contatos.telefones.${idx}.numero`}>
                  Número
                </Label>
                <Input
                  id={`contatos.telefones.${idx}.numero`}
                  placeholder="(11) 90000-0000"
                  {...register(`contatos.telefones.${idx}.numero` as const)}
                />
              </div>
              <div className="flex items-end gap-2 sm:col-span-3">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    {...register(
                      `contatos.telefones.${idx}.whatsapp` as const,
                    )}
                  />
                  WhatsApp
                </label>
              </div>
              <div className="flex items-end justify-end sm:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remover telefone"
                  onClick={() => remove(idx)}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-xs font-medium">
          Contato de emergência
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="contatos.emergencia.nome">Nome</Label>
            <Input
              id="contatos.emergencia.nome"
              {...register('contatos.emergencia.nome')}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contatos.emergencia.parentesco">Parentesco</Label>
            <Input
              id="contatos.emergencia.parentesco"
              {...register('contatos.emergencia.parentesco')}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contatos.emergencia.telefone">Telefone</Label>
            <Input
              id="contatos.emergencia.telefone"
              {...register('contatos.emergencia.telefone')}
            />
          </div>
        </div>
      </fieldset>
    </fieldset>
  );
}
