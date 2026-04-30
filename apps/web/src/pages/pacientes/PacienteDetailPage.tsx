/**
 * PacienteDetailPage — visualização do paciente em abas.
 *
 * Abas:
 *  - Dados: identificação + endereço + contatos + alergias.
 *  - Convênios: lista vínculos + botão para vincular novo (modal).
 *  - Histórico: placeholder (será preenchido por outras fases).
 *
 * Carrega com X-Finalidade='CONSULTA' (LGPD).
 */
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  Edit,
  Loader2,
  Plus,
  Trash2,
  UserCircle,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { Cpf, Cns } from '@/lib/document-validators';
import {
  createPacienteConvenio,
  deletePacienteConvenio,
  getPaciente,
  listPacienteConvenios,
} from '@/lib/pacientes-api';
import { useToast } from '@/components/Toast';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const convenioSchema = z.object({
  convenioUuid: z.string().min(1, 'Convênio obrigatório'),
  numeroCarteirinha: z.string().min(3, 'Carteirinha obrigatória'),
  validade: z.string().optional(),
  titular: z.boolean().optional(),
  parentescoTitular: z.string().optional(),
});

type ConvenioFormValues = z.infer<typeof convenioSchema>;

type Tab = 'dados' | 'convenios' | 'historico';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

export function PacienteDetailPage(): JSX.Element {
  const { uuid } = useParams<{ uuid: string }>();
  const { show: showToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('dados');
  const [convenioModalOpen, setConvenioModalOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['paciente', uuid],
    queryFn: () => getPaciente(uuid as string, 'CONSULTA'),
    enabled: Boolean(uuid),
  });

  const conveniosQuery = useQuery({
    queryKey: ['paciente', uuid, 'convenios'],
    queryFn: () => listPacienteConvenios(uuid as string),
    enabled: Boolean(uuid) && tab === 'convenios',
  });

  const convenioForm = useForm<ConvenioFormValues>({
    resolver: zodResolver(convenioSchema),
    defaultValues: {
      convenioUuid: '',
      numeroCarteirinha: '',
      validade: '',
      titular: true,
      parentescoTitular: '',
    },
  });

  const createConvenioMutation = useMutation({
    mutationFn: (input: ConvenioFormValues) =>
      createPacienteConvenio(uuid as string, {
        convenioUuid: input.convenioUuid,
        numeroCarteirinha: input.numeroCarteirinha,
        validade: input.validade || undefined,
        titular: input.titular,
        parentescoTitular: input.parentescoTitular || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['paciente', uuid, 'convenios'],
      });
      setConvenioModalOpen(false);
      convenioForm.reset();
      showToast({
        variant: 'success',
        title: 'Convênio vinculado',
        description: 'Vínculo criado com sucesso.',
      });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError
          ? err.detail ?? err.message
          : 'Falha ao vincular convênio.';
      showToast({
        variant: 'destructive',
        title: 'Erro',
        description: msg,
      });
    },
  });

  const removeConvenioMutation = useMutation({
    mutationFn: (vinculoUuid: string) =>
      deletePacienteConvenio(uuid as string, vinculoUuid),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['paciente', uuid, 'convenios'],
      });
      showToast({
        variant: 'success',
        title: 'Vínculo removido',
        description: 'Convênio desvinculado.',
      });
    },
    onError: () => {
      showToast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Falha ao remover vínculo.',
      });
    },
  });

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
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

  const p = detailQuery.data;

  return (
    <section className="space-y-4" aria-label="Detalhe do paciente">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Voltar">
            <Link to="/pacientes">
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <UserCircle aria-hidden="true" className="h-6 w-6" />
              {p.nomeSocial ?? p.nome}
            </h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{p.codigo}</span>
              {p.cpf ? <> · CPF {Cpf.format(p.cpf)}</> : null}
              {' · '}Nascimento {formatDate(p.dataNascimento)}
            </p>
          </div>
        </div>

        <Button asChild>
          <Link to={`/pacientes/${p.uuid}/editar`}>
            <Edit aria-hidden="true" />
            Editar
          </Link>
        </Button>
      </header>

      <div role="tablist" aria-label="Seções do paciente" className="flex gap-2 border-b">
        {(
          [
            { id: 'dados', label: 'Dados' },
            { id: 'convenios', label: 'Convênios' },
            { id: 'historico', label: 'Histórico' },
          ] as Array<{ id: Tab; label: string }>
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm transition-colors',
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dados' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identificação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Field label="Nome" value={p.nome} />
              <Field label="Nome social" value={p.nomeSocial} />
              <Field label="CPF" value={p.cpf ? Cpf.format(p.cpf) : null} />
              <Field label="CNS" value={p.cns ? Cns.format(p.cns) : null} />
              <Field label="RG" value={p.rg} />
              <Field label="Sexo" value={p.sexo} />
              <Field label="Nome da mãe" value={p.nomeMae} />
              <Field label="Nome do pai" value={p.nomePai} />
              <Field label="Tipo sanguíneo" value={p.tipoSanguineo} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Endereço & contatos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Field
                label="Endereço"
                value={
                  p.endereco?.logradouro
                    ? `${p.endereco.logradouro}${p.endereco.numero ? `, ${p.endereco.numero}` : ''} — ${p.endereco.cidade ?? ''}/${p.endereco.uf ?? ''}`
                    : null
                }
              />
              <Field label="CEP" value={p.endereco?.cep} />
              <Field label="E-mail" value={p.contatos?.email} />
              <Field
                label="Telefones"
                value={
                  p.contatos?.telefones && p.contatos.telefones.length > 0
                    ? p.contatos.telefones
                        .map((t) => `${t.tipo} ${t.numero}`)
                        .join(' · ')
                    : null
                }
              />
              <Field
                label="Emergência"
                value={
                  p.contatos?.emergencia
                    ? `${p.contatos.emergencia.nome} (${p.contatos.emergencia.parentesco ?? '-'}) — ${p.contatos.emergencia.telefone}`
                    : null
                }
              />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Alergias e comorbidades</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {p.alergias && p.alergias.length > 0 ? (
                <ul className="list-disc pl-5">
                  {p.alergias.map((a, i) => (
                    <li key={`a-${i}`}>
                      <strong>{a.substancia}</strong>
                      {a.gravidade ? <> — {a.gravidade.toLowerCase()}</> : null}
                      {a.observacao ? <> ({a.observacao})</> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  Nenhuma alergia registrada.
                </p>
              )}

              {p.comorbidades && p.comorbidades.length > 0 ? (
                <div className="pt-2">
                  <p className="font-medium">Comorbidades:</p>
                  <ul className="list-disc pl-5">
                    {p.comorbidades.map((c, i) => (
                      <li key={`c-${i}`}>
                        {c.descricao}
                        {c.cid ? <> ({c.cid})</> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === 'convenios' ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Vínculos com convênios</CardTitle>
            <Button
              type="button"
              size="sm"
              onClick={() => setConvenioModalOpen(true)}
            >
              <Plus aria-hidden="true" />
              Vincular convênio
            </Button>
          </CardHeader>
          <CardContent>
            {conveniosQuery.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : conveniosQuery.data && conveniosQuery.data.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Convênio</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Carteirinha</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Titular</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conveniosQuery.data.map((v) => (
                    <TableRow key={v.uuid}>
                      <TableCell>{v.convenioNome ?? v.convenioUuid}</TableCell>
                      <TableCell>{v.planoNome ?? '—'}</TableCell>
                      <TableCell className="font-mono">
                        {v.numeroCarteirinha}
                      </TableCell>
                      <TableCell>{formatDate(v.validade)}</TableCell>
                      <TableCell>
                        {v.titular ? 'Sim' : v.parentescoTitular ?? 'Dependente'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label="Remover vínculo"
                          onClick={() => removeConvenioMutation.mutate(v.uuid)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum vínculo cadastrado.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'historico' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Será preenchido pelos módulos de Atendimentos (Fase 5) e PEP
            (Fase 6).
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={convenioModalOpen} onOpenChange={setConvenioModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular convênio</DialogTitle>
            <DialogDescription>
              Informe o convênio, carteirinha e validade.
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            onSubmit={convenioForm.handleSubmit((v) =>
              createConvenioMutation.mutate(v),
            )}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label htmlFor="convenioUuid">Convênio (UUID)</Label>
              <Input
                id="convenioUuid"
                placeholder="UUID do convênio"
                {...convenioForm.register('convenioUuid')}
              />
              {convenioForm.formState.errors.convenioUuid ? (
                <p role="alert" className="text-xs text-destructive">
                  {convenioForm.formState.errors.convenioUuid.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="numeroCarteirinha">Carteirinha</Label>
              <Input
                id="numeroCarteirinha"
                {...convenioForm.register('numeroCarteirinha')}
              />
              {convenioForm.formState.errors.numeroCarteirinha ? (
                <p role="alert" className="text-xs text-destructive">
                  {convenioForm.formState.errors.numeroCarteirinha.message}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="validade">Validade</Label>
                <Input
                  id="validade"
                  type="date"
                  {...convenioForm.register('validade')}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="parentescoTitular">Parentesco titular</Label>
                <Input
                  id="parentescoTitular"
                  placeholder="Vazio se for o próprio titular"
                  {...convenioForm.register('parentescoTitular')}
                />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" {...convenioForm.register('titular')} />
              É o titular
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConvenioModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createConvenioMutation.isPending}
                aria-busy={createConvenioMutation.isPending}
              >
                {createConvenioMutation.isPending ? (
                  <>
                    <Loader2 aria-hidden="true" className="animate-spin" />
                    Vinculando...
                  </>
                ) : (
                  'Vincular'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}): JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2">
        {value ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}
