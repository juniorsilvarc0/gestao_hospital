/**
 * PacienteFormPage — criação e edição de paciente.
 *
 * Modos:
 *  - `create`: form em branco, POST /v1/pacientes.
 *  - `edit`:   carrega via useQuery, PATCH /v1/pacientes/:uuid.
 *
 * Validação: Zod (paciente-schema.ts) + react-hook-form.
 * Submit normaliza CPF/CNS removendo máscara.
 *
 * Sub-formulários:
 *  - <EnderecoFields>
 *  - <ContatosFields>
 *  - <AlergiasField>
 */
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  createPaciente,
  getPaciente,
  updatePaciente,
} from '@/lib/pacientes-api';
import { Cpf, Cns } from '@/lib/document-validators';
import { useToast } from '@/components/Toast';
import {
  pacienteFormSchema,
  type PacienteFormValues,
} from '@/components/pacientes/paciente-schema';
import { EnderecoFields } from '@/components/pacientes/EnderecoFields';
import { ContatosFields } from '@/components/pacientes/ContatosFields';
import { AlergiasField } from '@/components/pacientes/AlergiasField';
import type {
  PacienteCreateInput,
  PacienteUpdateInput,
  Sexo,
  TipoAtendimentoPadrao,
} from '@/types/pacientes';

interface PacienteFormPageProps {
  mode: 'create' | 'edit';
}

const DEFAULT_VALUES: PacienteFormValues = {
  codigo: '',
  nome: '',
  nomeSocial: '',
  cpf: '',
  rg: '',
  cns: '',
  dataNascimento: '',
  sexo: 'INDETERMINADO' as Sexo,
  nomeMae: '',
  nomePai: '',
  estadoCivil: '',
  profissao: '',
  racaCor: '',
  nacionalidade: 'Brasileira',
  naturalidadeUf: '',
  naturalidadeCidade: '',
  tipoSanguineo: '',
  tipoAtendimentoPadrao: undefined,
  endereco: {},
  contatos: { telefones: [] },
  alergias: [],
  comorbidades: [],
  consentimentoLgpd: false,
};

function toCreateInput(v: PacienteFormValues): PacienteCreateInput {
  return {
    codigo: v.codigo || undefined,
    nome: v.nome,
    nomeSocial: v.nomeSocial || undefined,
    cpf: v.cpf ? Cpf.digits(v.cpf) : undefined,
    rg: v.rg || undefined,
    cns: v.cns ? Cns.digits(v.cns) : undefined,
    dataNascimento: v.dataNascimento,
    sexo: v.sexo,
    nomeMae: v.nomeMae,
    nomePai: v.nomePai || undefined,
    estadoCivil: v.estadoCivil || undefined,
    profissao: v.profissao || undefined,
    racaCor: v.racaCor || undefined,
    nacionalidade: v.nacionalidade || undefined,
    naturalidadeUf: v.naturalidadeUf || undefined,
    naturalidadeCidade: v.naturalidadeCidade || undefined,
    tipoSanguineo: v.tipoSanguineo || undefined,
    tipoAtendimentoPadrao: v.tipoAtendimentoPadrao as
      | TipoAtendimentoPadrao
      | undefined,
    endereco: v.endereco,
    contatos: v.contatos,
    alergias: v.alergias,
    comorbidades: v.comorbidades,
    consentimentoLgpd: v.consentimentoLgpd,
  };
}

export function PacienteFormPage({ mode }: PacienteFormPageProps): JSX.Element {
  const { uuid } = useParams<{ uuid?: string }>();
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const queryClient = useQueryClient();

  const isEdit = mode === 'edit';

  const detailQuery = useQuery({
    queryKey: ['paciente', uuid],
    queryFn: () => getPaciente(uuid as string, 'CONSULTA'),
    enabled: isEdit && Boolean(uuid),
    staleTime: 0,
  });

  const form = useForm<PacienteFormValues>({
    resolver: zodResolver(pacienteFormSchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onBlur',
  });

  // Popula form quando a edição carrega o paciente.
  useEffect(() => {
    if (!isEdit) return;
    const data = detailQuery.data;
    if (!data) return;
    form.reset({
      ...DEFAULT_VALUES,
      ...data,
      cpf: data.cpf ? Cpf.format(data.cpf) : '',
      cns: data.cns ? Cns.format(data.cns) : '',
      dataNascimento: data.dataNascimento ?? '',
      sexo: data.sexo,
      nomeSocial: data.nomeSocial ?? '',
      nomePai: data.nomePai ?? '',
      rg: data.rg ?? '',
      estadoCivil: data.estadoCivil ?? '',
      profissao: data.profissao ?? '',
      racaCor: data.racaCor ?? '',
      nacionalidade: data.nacionalidade ?? '',
      naturalidadeUf: data.naturalidadeUf ?? '',
      naturalidadeCidade: data.naturalidadeCidade ?? '',
      tipoSanguineo: data.tipoSanguineo ?? '',
      tipoAtendimentoPadrao: data.tipoAtendimentoPadrao ?? undefined,
      endereco: data.endereco ?? {},
      contatos: data.contatos ?? { telefones: [] },
      alergias: data.alergias ?? [],
      comorbidades: data.comorbidades ?? [],
      consentimentoLgpd: data.consentimentoLgpd ?? false,
    });
  }, [isEdit, detailQuery.data, form]);

  const createMutation = useMutation({
    mutationFn: (input: PacienteCreateInput) => createPaciente(input),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['pacientes'] });
      showToast({
        variant: 'success',
        title: 'Paciente cadastrado',
        description: `${created.nome} foi adicionado.`,
      });
      navigate(`/pacientes/${created.uuid}`, { replace: true });
    },
    onError: (err: unknown) => handleApiError(err, 'Falha ao cadastrar paciente.'),
  });

  const updateMutation = useMutation({
    mutationFn: (input: PacienteUpdateInput) =>
      updatePaciente(uuid as string, input),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['pacientes'] });
      void queryClient.invalidateQueries({ queryKey: ['paciente', uuid] });
      showToast({
        variant: 'success',
        title: 'Paciente atualizado',
        description: updated.nome,
      });
      navigate(`/pacientes/${updated.uuid}`);
    },
    onError: (err: unknown) => handleApiError(err, 'Falha ao salvar paciente.'),
  });

  function handleApiError(err: unknown, fallback: string): void {
    if (err instanceof ApiError) {
      showToast({
        variant: 'destructive',
        title: err.title ?? 'Erro',
        description: err.detail ?? fallback,
      });
      // Aplica field errors do backend.
      err.fields?.forEach((f) => {
        form.setError(f.field as keyof PacienteFormValues, {
          type: 'server',
          message: f.message,
        });
      });
      return;
    }
    showToast({ variant: 'destructive', title: 'Erro', description: fallback });
  }

  const onSubmit = form.handleSubmit((values) => {
    const payload = toCreateInput(values);
    if (isEdit) {
      updateMutation.mutate(payload as PacienteUpdateInput);
    } else {
      createMutation.mutate(payload);
    }
  });

  const submitting =
    createMutation.isPending || updateMutation.isPending || form.formState.isSubmitting;

  if (isEdit && detailQuery.isLoading) {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-2 py-12">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        Carregando paciente...
      </div>
    );
  }

  if (isEdit && detailQuery.isError) {
    return (
      <div role="alert" className="space-y-2 py-12 text-center">
        <p className="text-sm text-destructive">
          Não foi possível carregar o paciente.
        </p>
        <Button asChild variant="outline">
          <Link to="/pacientes">Voltar para lista</Link>
        </Button>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar">
          <Link to={isEdit && uuid ? `/pacientes/${uuid}` : '/pacientes'}>
            <ArrowLeft aria-hidden="true" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isEdit ? 'Editar paciente' : 'Novo paciente'}
        </h1>
      </div>

      <form noValidate onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Identificação</CardTitle>
            <CardDescription>
              Campos obrigatórios marcados com{' '}
              <span className="text-destructive">*</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="nome">
                  Nome completo <span className="text-destructive">*</span>
                </Label>
                <Input id="nome" {...form.register('nome')} />
                {form.formState.errors.nome ? (
                  <p role="alert" className="text-xs text-destructive">
                    {form.formState.errors.nome.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="nomeSocial">Nome social</Label>
                <Input id="nomeSocial" {...form.register('nomeSocial')} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="cpf">CPF</Label>
                <Input id="cpf" placeholder="000.000.000-00" {...form.register('cpf')} />
                {form.formState.errors.cpf ? (
                  <p role="alert" className="text-xs text-destructive">
                    {form.formState.errors.cpf.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="rg">RG</Label>
                <Input id="rg" {...form.register('rg')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cns">CNS</Label>
                <Input id="cns" placeholder="000 0000 0000 0000" {...form.register('cns')} />
                {form.formState.errors.cns ? (
                  <p role="alert" className="text-xs text-destructive">
                    {form.formState.errors.cns.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="dataNascimento">
                  Nascimento <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="dataNascimento"
                  type="date"
                  {...form.register('dataNascimento')}
                />
                {form.formState.errors.dataNascimento ? (
                  <p role="alert" className="text-xs text-destructive">
                    {form.formState.errors.dataNascimento.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="sexo">
                  Sexo <span className="text-destructive">*</span>
                </Label>
                <Select id="sexo" {...form.register('sexo')}>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                  <option value="INDETERMINADO">Indeterminado</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="tipoAtendimentoPadrao">Atendimento padrão</Label>
                <Select
                  id="tipoAtendimentoPadrao"
                  {...form.register('tipoAtendimentoPadrao')}
                >
                  <option key="__empty__" value="">--</option>
                  <option value="PARTICULAR">Particular</option>
                  <option value="CONVENIO">Convênio</option>
                  <option value="SUS">SUS</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="nomeMae">
                  Nome da mãe <span className="text-destructive">*</span>
                </Label>
                <Input id="nomeMae" {...form.register('nomeMae')} />
                {form.formState.errors.nomeMae ? (
                  <p role="alert" className="text-xs text-destructive">
                    {form.formState.errors.nomeMae.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="nomePai">Nome do pai</Label>
                <Input id="nomePai" {...form.register('nomePai')} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Demais dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="estadoCivil">Estado civil</Label>
                <Input id="estadoCivil" {...form.register('estadoCivil')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="profissao">Profissão</Label>
                <Input id="profissao" {...form.register('profissao')} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tipoSanguineo">Tipo sanguíneo</Label>
                <Select id="tipoSanguineo" {...form.register('tipoSanguineo')}>
                  <option key="__empty__" value="">--</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <EnderecoFields
              register={form.register}
              errors={form.formState.errors.endereco}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <ContatosFields control={form.control} register={form.register} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <AlergiasField control={form.control} register={form.register} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="space-y-1">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                placeholder="Notas administrativas (não substitui evolução clínica)."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Campo informativo — evoluções clínicas devem ir no PEP.
              </p>
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...form.register('consentimentoLgpd')}
              />
              Consentimento LGPD assinado
            </label>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild type="button" variant="outline">
            <Link to={isEdit && uuid ? `/pacientes/${uuid}` : '/pacientes'}>
              Cancelar
            </Link>
          </Button>
          <Button type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save aria-hidden="true" />
                {isEdit ? 'Salvar alterações' : 'Cadastrar paciente'}
              </>
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}
