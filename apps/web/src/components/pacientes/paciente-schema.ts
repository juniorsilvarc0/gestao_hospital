/**
 * Schema Zod compartilhado entre o form de criação e o de edição
 * de pacientes.
 *
 * Validações:
 *  - CPF (opcional) validado por algoritmo (`Cpf.isValid`).
 *  - CNS (opcional) validado por mod 11 (`Cns.isValid`).
 *  - Data de nascimento exigida e ≤ hoje.
 *  - Sexo exigido.
 *  - Nome da mãe exigido (regra clínica: identificação única).
 */
import { z } from 'zod';
import { Cpf, Cns } from '@/lib/document-validators';

const SEXO = ['M', 'F', 'INDETERMINADO'] as const;
const TIPO_ATD = ['PARTICULAR', 'CONVENIO', 'SUS'] as const;

const enderecoSchema = z
  .object({
    cep: z.string().optional(),
    logradouro: z.string().optional(),
    numero: z.string().optional(),
    complemento: z.string().optional(),
    bairro: z.string().optional(),
    cidade: z.string().optional(),
    uf: z.string().optional(),
    pais: z.string().optional(),
  })
  .partial()
  .optional();

const telefoneSchema = z.object({
  tipo: z.enum(['CELULAR', 'RESIDENCIAL', 'COMERCIAL', 'OUTRO']),
  numero: z.string().min(1, 'Número obrigatório'),
  whatsapp: z.boolean().optional(),
});

const contatosSchema = z
  .object({
    email: z
      .string()
      .email('E-mail inválido')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    telefones: z.array(telefoneSchema).optional(),
    emergencia: z
      .object({
        nome: z.string().min(1, 'Nome obrigatório'),
        parentesco: z.string().optional(),
        telefone: z.string().min(1, 'Telefone obrigatório'),
      })
      .optional(),
  })
  .optional();

const alergiaSchema = z.object({
  substancia: z.string().min(1, 'Substância obrigatória'),
  gravidade: z.enum(['LEVE', 'MODERADA', 'GRAVE']).optional(),
  observacao: z.string().optional(),
});

const comorbidadeSchema = z.object({
  cid: z.string().optional(),
  descricao: z.string().min(1, 'Descrição obrigatória'),
  desde: z.string().optional(),
});

export const pacienteFormSchema = z.object({
  codigo: z.string().optional(),
  nome: z
    .string()
    .min(3, 'Nome deve ter ao menos 3 caracteres')
    .max(200, 'Nome muito longo'),
  nomeSocial: z.string().max(200).optional().or(z.literal('')),
  cpf: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.trim() === '' || Cpf.isValid(v),
      'CPF inválido',
    ),
  rg: z.string().max(40).optional().or(z.literal('')),
  cns: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.trim() === '' || Cns.isValid(v),
      'CNS inválido',
    ),
  dataNascimento: z
    .string()
    .min(1, 'Data de nascimento obrigatória')
    .refine((v) => {
      const d = new Date(v);
      return !Number.isNaN(d.getTime()) && d.getTime() <= Date.now();
    }, 'Data inválida ou no futuro'),
  sexo: z.enum(SEXO),
  nomeMae: z.string().min(3, 'Nome da mãe obrigatório'),
  nomePai: z.string().optional().or(z.literal('')),
  estadoCivil: z.string().optional().or(z.literal('')),
  profissao: z.string().optional().or(z.literal('')),
  racaCor: z.string().optional().or(z.literal('')),
  nacionalidade: z.string().optional().or(z.literal('')),
  naturalidadeUf: z.string().optional().or(z.literal('')),
  naturalidadeCidade: z.string().optional().or(z.literal('')),
  tipoSanguineo: z.string().optional().or(z.literal('')),
  tipoAtendimentoPadrao: z
    .enum(TIPO_ATD)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  endereco: enderecoSchema,
  contatos: contatosSchema,
  alergias: z.array(alergiaSchema).optional(),
  comorbidades: z.array(comorbidadeSchema).optional(),
  consentimentoLgpd: z.boolean().optional(),
});

export type PacienteFormValues = z.infer<typeof pacienteFormSchema>;
