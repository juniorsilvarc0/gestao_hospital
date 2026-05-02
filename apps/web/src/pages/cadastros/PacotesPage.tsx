/**
 * PacotesPage — CRUD de pacotes de procedimentos.
 *
 * Tabela: código · nome · convênio · valor total · vigência · ativo · ações.
 * Dialog para criar/editar com itens nested (procedimento UUID + qtd + faixa).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookCopy,
  Edit,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  createPacote,
  deletePacote,
  listPacotes,
  updatePacote,
} from '@/lib/pacotes-api';
import { useToast } from '@/components/Toast';
import type {
  CreatePacoteInput,
  Pacote,
  PacoteItem,
} from '@/types/contas';

interface PacoteFormState {
  codigo: string;
  nome: string;
  descricao: string;
  procedimentoPrincipalUuid: string;
  convenioUuid: string;
  valorTotal: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  itens: PacoteItem[];
}

const EMPTY_FORM: PacoteFormState = {
  codigo: '',
  nome: '',
  descricao: '',
  procedimentoPrincipalUuid: '',
  convenioUuid: '',
  valorTotal: '0',
  vigenciaInicio: '',
  vigenciaFim: '',
  itens: [],
};

function formatBR(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function formatMoney(raw: string | null): string {
  if (!raw) return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function PacotesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Pacote | null>(null);
  const [form, setForm] = useState<PacoteFormState>(EMPTY_FORM);

  const pacotesQuery = useQuery({
    queryKey: ['pacotes'],
    queryFn: () => listPacotes({ pageSize: 100 }),
    staleTime: 30_000,
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['pacotes'] });
  }

  function toastErr(err: unknown, fallback: string): void {
    const detail =
      err instanceof ApiError
        ? err.detail ?? err.title ?? err.message
        : err instanceof Error
          ? err.message
          : 'Erro.';
    showToast({ variant: 'destructive', title: fallback, description: detail });
  }

  const createM = useMutation({
    mutationFn: (input: CreatePacoteInput) => createPacote(input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Pacote criado',
        description: '',
      });
      setOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao criar pacote'),
  });

  const updateM = useMutation({
    mutationFn: ({
      uuid,
      input,
    }: {
      uuid: string;
      input: Partial<CreatePacoteInput>;
    }) => updatePacote(uuid, input),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Pacote atualizado',
        description: '',
      });
      setOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao atualizar pacote'),
  });

  const deleteM = useMutation({
    mutationFn: (uuid: string) => deletePacote(uuid),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Pacote removido',
        description: '',
      });
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao remover pacote'),
  });

  function openCreate(): void {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(p: Pacote): void {
    setEditing(p);
    setForm({
      codigo: p.codigo,
      nome: p.nome,
      descricao: p.descricao ?? '',
      procedimentoPrincipalUuid: p.procedimentoPrincipalUuid,
      convenioUuid: p.convenioUuid,
      valorTotal: String(p.valorTotal),
      vigenciaInicio: p.vigenciaInicio.slice(0, 10),
      vigenciaFim: p.vigenciaFim ? p.vigenciaFim.slice(0, 10) : '',
      itens: p.itens.map((i) => ({ ...i })),
    });
    setOpen(true);
  }

  function addItem(): void {
    setForm((prev) => ({
      ...prev,
      itens: [
        ...prev.itens,
        {
          procedimentoUuid: '',
          quantidade: 1,
          faixaInicio: null,
          faixaFim: null,
        },
      ],
    }));
  }

  function handleSubmit(): void {
    const valor = Number(form.valorTotal);
    if (
      !form.codigo.trim() ||
      !form.nome.trim() ||
      !form.procedimentoPrincipalUuid ||
      !form.convenioUuid ||
      !Number.isFinite(valor) ||
      valor < 0 ||
      !form.vigenciaInicio
    ) {
      showToast({
        variant: 'destructive',
        title: 'Campos obrigatórios faltando',
        description: 'Verifique código, nome, convênio, valor e vigência.',
      });
      return;
    }
    const payload: CreatePacoteInput = {
      codigo: form.codigo.trim(),
      nome: form.nome.trim(),
      ...(form.descricao ? { descricao: form.descricao } : {}),
      procedimentoPrincipalUuid: form.procedimentoPrincipalUuid,
      convenioUuid: form.convenioUuid,
      valorTotal: valor,
      vigenciaInicio: form.vigenciaInicio,
      ...(form.vigenciaFim ? { vigenciaFim: form.vigenciaFim } : {}),
      itens: form.itens.filter((i) => i.procedimentoUuid),
    };
    if (editing) {
      updateM.mutate({ uuid: editing.uuid, input: payload });
    } else {
      createM.mutate(payload);
    }
  }

  const pacotes = pacotesQuery.data?.data ?? [];

  return (
    <section className="space-y-4" aria-label="Pacotes de procedimentos">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <BookCopy aria-hidden="true" className="h-6 w-6" />
            Pacotes
          </h1>
          <p className="text-sm text-muted-foreground">
            Pacotes fechados por convênio (procedimento principal + composição
            de itens com faixas).
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus aria-hidden="true" />
          Novo pacote
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Pacotes cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="pacotes-tabela">
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Convênio</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pacotesQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm">
                    <Loader2
                      aria-hidden="true"
                      className="mr-2 inline h-4 w-4 animate-spin"
                    />
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : pacotes.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    Nenhum pacote cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                pacotes.map((p) => (
                  <TableRow key={p.uuid}>
                    <TableCell className="text-xs font-mono">
                      {p.codigo}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {p.nome}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.convenioNome ?? p.convenioUuid}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatMoney(p.valorTotal)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatBR(p.vigenciaInicio)}
                      {p.vigenciaFim ? ` → ${formatBR(p.vigenciaFim)}` : ''}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(p)}
                          aria-label={`Editar pacote ${p.nome}`}
                        >
                          <Edit aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remover o pacote "${p.nome}"?`,
                              )
                            ) {
                              deleteM.mutate(p.uuid);
                            }
                          }}
                          aria-label={`Remover pacote ${p.nome}`}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar pacote' : 'Novo pacote'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="pkg-cod">Código *</Label>
                <Input
                  id="pkg-cod"
                  value={form.codigo}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, codigo: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pkg-nome">Nome *</Label>
                <Input
                  id="pkg-nome"
                  value={form.nome}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, nome: e.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pkg-desc">Descrição</Label>
              <Textarea
                id="pkg-desc"
                value={form.descricao}
                onChange={(e) =>
                  setForm((p) => ({ ...p, descricao: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="pkg-proc">Procedimento principal (UUID) *</Label>
                <Input
                  id="pkg-proc"
                  value={form.procedimentoPrincipalUuid}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      procedimentoPrincipalUuid: e.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pkg-conv">Convênio (UUID) *</Label>
                <Input
                  id="pkg-conv"
                  value={form.convenioUuid}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, convenioUuid: e.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="pkg-valor">Valor total *</Label>
                <Input
                  id="pkg-valor"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valorTotal}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, valorTotal: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pkg-ini">Vigência início *</Label>
                <Input
                  id="pkg-ini"
                  type="date"
                  value={form.vigenciaInicio}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, vigenciaInicio: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pkg-fim">Vigência fim</Label>
                <Input
                  id="pkg-fim"
                  type="date"
                  value={form.vigenciaFim}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, vigenciaFim: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="rounded-md border p-2">
              <header className="flex items-center justify-between pb-2">
                <span className="text-xs font-medium">Itens do pacote</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addItem}
                >
                  <Plus aria-hidden="true" />
                  Adicionar
                </Button>
              </header>
              {form.itens.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Nenhum item. Pacote pode ser composto só pelo procedimento
                  principal se desejar.
                </p>
              ) : (
                <ul className="space-y-1">
                  {form.itens.map((item, idx) => (
                    <li
                      key={idx}
                      className="grid grid-cols-12 items-end gap-2 border-t pt-1 first:border-t-0 first:pt-0"
                    >
                      <div className="col-span-5 space-y-1">
                        <Label htmlFor={`pkg-i-${idx}`}>Procedimento UUID</Label>
                        <Input
                          id={`pkg-i-${idx}`}
                          value={item.procedimentoUuid}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              itens: prev.itens.map((x, i) =>
                                i === idx
                                  ? { ...x, procedimentoUuid: e.target.value }
                                  : x,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label htmlFor={`pkg-q-${idx}`}>Qtd</Label>
                        <Input
                          id={`pkg-q-${idx}`}
                          type="number"
                          min="1"
                          value={item.quantidade}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              itens: prev.itens.map((x, i) =>
                                i === idx
                                  ? {
                                      ...x,
                                      quantidade: Number(e.target.value) || 1,
                                    }
                                  : x,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label htmlFor={`pkg-fi-${idx}`}>Faixa ini.</Label>
                        <Input
                          id={`pkg-fi-${idx}`}
                          type="number"
                          min="0"
                          value={item.faixaInicio ?? ''}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              itens: prev.itens.map((x, i) =>
                                i === idx
                                  ? {
                                      ...x,
                                      faixaInicio: e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    }
                                  : x,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label htmlFor={`pkg-ff-${idx}`}>Faixa fim</Label>
                        <Input
                          id={`pkg-ff-${idx}`}
                          type="number"
                          min="0"
                          value={item.faixaFim ?? ''}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              itens: prev.itens.map((x, i) =>
                                i === idx
                                  ? {
                                      ...x,
                                      faixaFim: e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    }
                                  : x,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="col-span-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              itens: prev.itens.filter((_, i) => i !== idx),
                            }))
                          }
                          aria-label="Remover item"
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={createM.isPending || updateM.isPending}
            >
              {createM.isPending || updateM.isPending ? (
                <Loader2
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <Save aria-hidden="true" />
              )}
              {editing ? 'Salvar alterações' : 'Criar pacote'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

PacotesPage.displayName = 'PacotesPage';
