/**
 * AbrirAtendimentoModal — modal de criação de atendimento (recepção).
 *
 * Form RHF + Zod:
 *  - Paciente (autocomplete /pacientes/buscar via PacienteAutocomplete).
 *  - Prestador (autocomplete /prestadores).
 *  - Setor + Unidades (selects de catálogo).
 *  - Tipo cobrança (PARTICULAR / CONVENIO / SUS).
 *  - Tipo de atendimento (CONSULTA, EXAME, INTERNACAO, ...).
 *  - Motivo (textarea).
 *  - Senha de autorização opcional (RN-ATE-03).
 *  - Se CONVENIO: convênio + carteirinha + botão "Verificar elegibilidade".
 *
 * Submit → POST /v1/atendimentos. Em sucesso, redireciona para
 * `/atendimentos/:uuid` (callback `onSuccess` lida com isso).
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
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
import {
  createAtendimento,
  listConvenios,
  listSetores,
  listUnidadesAtendimento,
  listUnidadesFaturamento,
  verificarElegibilidade,
} from '@/lib/atendimentos-api';
import { useToast } from '@/components/Toast';
import { PacienteAutocomplete } from '@/components/agenda/PacienteAutocomplete';
import { PrestadorAutocomplete } from './PrestadorAutocomplete';
import type {
  AtendimentoTipo,
  ElegibilidadeResultado,
  TipoCobranca,
} from '@/types/atendimentos';

const TIPOS_ATENDIMENTO: AtendimentoTipo[] = [
  'CONSULTA',
  'EXAME',
  'PRONTO_ATENDIMENTO',
  'INTERNACAO',
  'CIRURGIA',
  'TELECONSULTA',
  'OBSERVACAO',
];

const TIPOS_COBRANCA: TipoCobranca[] = ['PARTICULAR', 'CONVENIO', 'SUS'];

const TIPO_LABEL: Record<AtendimentoTipo, string> = {
  CONSULTA: 'Consulta',
  EXAME: 'Exame',
  PRONTO_ATENDIMENTO: 'Pronto atendimento',
  INTERNACAO: 'Internação',
  CIRURGIA: 'Cirurgia',
  TELECONSULTA: 'Teleconsulta',
  OBSERVACAO: 'Observação',
};

const schema = z
  .object({
    pacienteUuid: z.string().min(1, 'Paciente obrigatório'),
    prestadorUuid: z.string().min(1, 'Prestador obrigatório'),
    setorUuid: z.string().min(1, 'Setor obrigatório'),
    unidadeAtendimentoUuid: z.string().min(1, 'Unidade obrigatória'),
    unidadeFaturamentoUuid: z.string().min(1, 'Unidade de faturamento obrigatória'),
    tipo: z.enum([
      'CONSULTA',
      'EXAME',
      'PRONTO_ATENDIMENTO',
      'INTERNACAO',
      'CIRURGIA',
      'TELECONSULTA',
      'OBSERVACAO',
    ]),
    tipoCobranca: z.enum(['PARTICULAR', 'CONVENIO', 'SUS']),
    convenioUuid: z.string().optional(),
    numeroCarteirinha: z.string().optional(),
    senhaAutorizacao: z.string().optional(),
    motivoAtendimento: z.string().optional(),
  })
  .refine(
    (v) =>
      v.tipoCobranca !== 'CONVENIO' ||
      (Boolean(v.convenioUuid) && Boolean(v.numeroCarteirinha)),
    {
      path: ['numeroCarteirinha'],
      message: 'Convênio e carteirinha obrigatórios para tipo CONVENIO',
    },
  );

type FormValues = z.infer<typeof schema>;

interface AbrirAtendimentoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (atendimentoUuid: string) => void;
  /** Pré-preenche prestador/setor a partir de um agendamento (check-in). */
  defaults?: Partial<FormValues> & { agendamentoUuid?: string };
}

export function AbrirAtendimentoModal({
  open,
  onOpenChange,
  onSuccess,
  defaults,
}: AbrirAtendimentoModalProps): JSX.Element {
  const { show: showToast } = useToast();

  const setoresQuery = useQuery({
    queryKey: ['setores'],
    queryFn: () => listSetores(),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const unidadesAtdQuery = useQuery({
    queryKey: ['unidades-atendimento'],
    queryFn: () => listUnidadesAtendimento(),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const unidadesFatQuery = useQuery({
    queryKey: ['unidades-faturamento'],
    queryFn: () => listUnidadesFaturamento(),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const conveniosQuery = useQuery({
    queryKey: ['convenios'],
    queryFn: () => listConvenios(),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      pacienteUuid: defaults?.pacienteUuid ?? '',
      prestadorUuid: defaults?.prestadorUuid ?? '',
      setorUuid: defaults?.setorUuid ?? '',
      unidadeAtendimentoUuid: defaults?.unidadeAtendimentoUuid ?? '',
      unidadeFaturamentoUuid: defaults?.unidadeFaturamentoUuid ?? '',
      tipo: defaults?.tipo ?? 'CONSULTA',
      tipoCobranca: defaults?.tipoCobranca ?? 'PARTICULAR',
      convenioUuid: defaults?.convenioUuid ?? '',
      numeroCarteirinha: defaults?.numeroCarteirinha ?? '',
      senhaAutorizacao: defaults?.senhaAutorizacao ?? '',
      motivoAtendimento: defaults?.motivoAtendimento ?? '',
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      pacienteUuid: defaults?.pacienteUuid ?? '',
      prestadorUuid: defaults?.prestadorUuid ?? '',
      setorUuid: defaults?.setorUuid ?? '',
      unidadeAtendimentoUuid: defaults?.unidadeAtendimentoUuid ?? '',
      unidadeFaturamentoUuid: defaults?.unidadeFaturamentoUuid ?? '',
      tipo: defaults?.tipo ?? 'CONSULTA',
      tipoCobranca: defaults?.tipoCobranca ?? 'PARTICULAR',
      convenioUuid: defaults?.convenioUuid ?? '',
      numeroCarteirinha: defaults?.numeroCarteirinha ?? '',
      senhaAutorizacao: defaults?.senhaAutorizacao ?? '',
      motivoAtendimento: defaults?.motivoAtendimento ?? '',
    });
    setElegibilidade(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaults]);

  const tipoCobranca = form.watch('tipoCobranca');
  const convenioUuid = form.watch('convenioUuid');
  const numeroCarteirinha = form.watch('numeroCarteirinha');
  const pacienteUuid = form.watch('pacienteUuid');

  const [elegibilidade, setElegibilidade] = useState<ElegibilidadeResultado | null>(
    null,
  );

  const elegibilidadeMutation = useMutation({
    mutationFn: () =>
      verificarElegibilidade({
        convenioUuid: convenioUuid ?? '',
        numeroCarteirinha: numeroCarteirinha ?? '',
        ...(pacienteUuid ? { pacienteUuid } : {}),
      }),
    onSuccess: (res) => {
      setElegibilidade(res);
      showToast({
        variant: res.elegivel ? 'success' : 'destructive',
        title: res.elegivel ? 'Elegível' : 'Não elegível',
        description: res.mensagem ?? res.status,
      });
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? err.detail ?? err.message
          : 'Falha ao consultar elegibilidade.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      createAtendimento({
        pacienteUuid: values.pacienteUuid,
        prestadorUuid: values.prestadorUuid,
        setorUuid: values.setorUuid,
        unidadeAtendimentoUuid: values.unidadeAtendimentoUuid,
        unidadeFaturamentoUuid: values.unidadeFaturamentoUuid,
        tipo: values.tipo,
        tipoCobranca: values.tipoCobranca,
        ...(values.motivoAtendimento
          ? { motivoAtendimento: values.motivoAtendimento }
          : {}),
        ...(defaults?.agendamentoUuid
          ? { agendamentoUuid: defaults.agendamentoUuid }
          : {}),
        ...(values.tipoCobranca === 'CONVENIO' && values.convenioUuid
          ? {
              convenioUuid: values.convenioUuid,
              numeroCarteirinha: values.numeroCarteirinha ?? '',
            }
          : {}),
        ...(values.senhaAutorizacao
          ? { senhaAutorizacao: values.senhaAutorizacao }
          : {}),
      }),
    onSuccess: (atendimento) => {
      showToast({
        variant: 'success',
        title: 'Atendimento aberto',
        description: `Número ${atendimento.numero}.`,
      });
      onSuccess(atendimento.uuid);
      onOpenChange(false);
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? err.detail ?? err.message
          : 'Falha ao abrir atendimento.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
    },
  });

  const elegibilidadeDisabled =
    !convenioUuid || !numeroCarteirinha || elegibilidadeMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo atendimento</DialogTitle>
          <DialogDescription>
            Preencha os dados de recepção. RN-ATE-01 a 03 aplicáveis.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
          className="space-y-3"
        >
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

          <div className="space-y-1">
            <Label htmlFor="prestadorUuid">Médico/prestador</Label>
            <PrestadorAutocomplete
              id="prestadorUuid"
              value={form.watch('prestadorUuid')}
              onChange={(uuid) =>
                form.setValue('prestadorUuid', uuid, { shouldValidate: true })
              }
            />
            {form.formState.errors.prestadorUuid ? (
              <p role="alert" className="text-xs text-destructive">
                {form.formState.errors.prestadorUuid.message}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="setorUuid">Setor</Label>
              <Select id="setorUuid" {...form.register('setorUuid')}>
                <option value="">Selecione...</option>
                {(setoresQuery.data ?? []).map((s) => (
                  <option key={s.uuid} value={s.uuid}>
                    {s.nome}
                  </option>
                ))}
              </Select>
              {form.formState.errors.setorUuid ? (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.setorUuid.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="unidadeAtendimentoUuid">Unidade atend.</Label>
              <Select
                id="unidadeAtendimentoUuid"
                {...form.register('unidadeAtendimentoUuid')}
              >
                <option value="">Selecione...</option>
                {(unidadesAtdQuery.data ?? []).map((u) => (
                  <option key={u.uuid} value={u.uuid}>
                    {u.nome}
                  </option>
                ))}
              </Select>
              {form.formState.errors.unidadeAtendimentoUuid ? (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.unidadeAtendimentoUuid.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="unidadeFaturamentoUuid">Unidade fatur.</Label>
              <Select
                id="unidadeFaturamentoUuid"
                {...form.register('unidadeFaturamentoUuid')}
              >
                <option value="">Selecione...</option>
                {(unidadesFatQuery.data ?? []).map((u) => (
                  <option key={u.uuid} value={u.uuid}>
                    {u.nome}
                  </option>
                ))}
              </Select>
              {form.formState.errors.unidadeFaturamentoUuid ? (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.unidadeFaturamentoUuid.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="tipo">Tipo de atendimento</Label>
              <Select id="tipo" {...form.register('tipo')}>
                {TIPOS_ATENDIMENTO.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tipoCobranca">Tipo de cobrança</Label>
              <Select id="tipoCobranca" {...form.register('tipoCobranca')}>
                {TIPOS_COBRANCA.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {tipoCobranca === 'CONVENIO' ? (
            <div className="space-y-3 rounded-md border p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="convenioUuid">Convênio</Label>
                  <Select
                    id="convenioUuid"
                    {...form.register('convenioUuid')}
                  >
                    <option value="">Selecione...</option>
                    {(conveniosQuery.data ?? []).map((c) => (
                      <option key={c.uuid} value={c.uuid}>
                        {c.nome}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="numeroCarteirinha">Carteirinha</Label>
                  <Input
                    id="numeroCarteirinha"
                    {...form.register('numeroCarteirinha')}
                  />
                  {form.formState.errors.numeroCarteirinha ? (
                    <p role="alert" className="text-xs text-destructive">
                      {form.formState.errors.numeroCarteirinha.message}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={elegibilidadeDisabled}
                  aria-busy={elegibilidadeMutation.isPending}
                  onClick={() => elegibilidadeMutation.mutate()}
                >
                  {elegibilidadeMutation.isPending ? (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  ) : (
                    <ShieldCheck aria-hidden="true" />
                  )}
                  Verificar elegibilidade
                </Button>
                {elegibilidade ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                      elegibilidade.elegivel
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-red-100 text-red-900'
                    }`}
                  >
                    {elegibilidade.elegivel ? (
                      <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
                    ) : (
                      <XCircle aria-hidden="true" className="h-3 w-3" />
                    )}
                    {elegibilidade.elegivel ? 'Elegível' : 'Não elegível'}
                    {elegibilidade.protocolo
                      ? ` · ${elegibilidade.protocolo}`
                      : ''}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="senhaAutorizacao">Senha de autorização</Label>
            <Input
              id="senhaAutorizacao"
              {...form.register('senhaAutorizacao')}
              placeholder="Quando o procedimento exigir autorização (RN-ATE-03)"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="motivoAtendimento">Motivo do atendimento</Label>
            <Textarea
              id="motivoAtendimento"
              rows={2}
              {...form.register('motivoAtendimento')}
            />
          </div>

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
              disabled={createMutation.isPending}
              aria-busy={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  Abrindo...
                </>
              ) : (
                'Abrir atendimento'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
