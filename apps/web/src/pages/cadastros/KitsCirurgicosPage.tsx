/**
 * KitsCirurgicosPage — CRUD de kits cirúrgicos.
 *
 * Tabela com todos os kits ativos + Dialog para criar/editar com itens
 * (procedimento + qtd + obrigatório).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Loader2, Package, Plus, Save, Trash2 } from 'lucide-react';
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
  createKitCirurgico,
  deleteKitCirurgico,
  listKitsCirurgicos,
  updateKitCirurgico,
} from '@/lib/kits-gabaritos-api';
import { useToast } from '@/components/Toast';
import type { KitCirurgico, KitCirurgicoItem } from '@/types/centro-cirurgico';

interface KitFormState {
  nome: string;
  descricao: string;
  itens: KitCirurgicoItem[];
}

const EMPTY_FORM: KitFormState = {
  nome: '',
  descricao: '',
  itens: [],
};

export function KitsCirurgicosPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KitCirurgico | null>(null);
  const [form, setForm] = useState<KitFormState>(EMPTY_FORM);

  const kitsQuery = useQuery({
    queryKey: ['kits-cirurgicos'],
    queryFn: () => listKitsCirurgicos(),
    staleTime: 30_000,
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['kits-cirurgicos'] });
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
    mutationFn: createKitCirurgico,
    onSuccess: () => {
      showToast({ variant: 'success', title: 'Kit criado', description: '' });
      setOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao criar kit'),
  });

  const updateM = useMutation({
    mutationFn: ({
      uuid,
      data,
    }: {
      uuid: string;
      data: KitFormState;
    }) =>
      updateKitCirurgico(uuid, {
        nome: data.nome,
        descricao: data.descricao || undefined,
        itens: data.itens,
      }),
    onSuccess: () => {
      showToast({ variant: 'success', title: 'Kit atualizado', description: '' });
      setOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao atualizar kit'),
  });

  const deleteM = useMutation({
    mutationFn: (uuid: string) => deleteKitCirurgico(uuid),
    onSuccess: () => {
      showToast({ variant: 'success', title: 'Kit removido', description: '' });
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao remover kit'),
  });

  function openCreate(): void {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(kit: KitCirurgico): void {
    setEditing(kit);
    setForm({
      nome: kit.nome,
      descricao: kit.descricao ?? '',
      itens: kit.itens.map((i) => ({ ...i })),
    });
    setOpen(true);
  }

  function addItem(): void {
    setForm((prev) => ({
      ...prev,
      itens: [
        ...prev.itens,
        { procedimentoUuid: '', quantidade: 1, obrigatorio: false },
      ],
    }));
  }

  function handleSubmit(): void {
    if (!form.nome.trim()) {
      showToast({
        variant: 'destructive',
        title: 'Nome obrigatório',
        description: '',
      });
      return;
    }
    if (editing) {
      updateM.mutate({ uuid: editing.uuid, data: form });
    } else {
      createM.mutate({
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || undefined,
        itens: form.itens,
      });
    }
  }

  const kits = kitsQuery.data?.data ?? [];

  return (
    <section className="space-y-4" aria-label="Kits cirúrgicos">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Package aria-hidden="true" className="h-6 w-6" />
            Kits cirúrgicos
          </h1>
          <p className="text-sm text-muted-foreground">
            Cadastro de kits padronizados para o centro cirúrgico.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus aria-hidden="true" />
          Novo kit
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Kits cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="kits-tabela">
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kitsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-sm">
                    <Loader2
                      aria-hidden="true"
                      className="mr-2 inline h-4 w-4 animate-spin"
                    />
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : kits.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    Nenhum kit cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                kits.map((k) => (
                  <TableRow key={k.uuid}>
                    <TableCell className="text-xs font-medium">
                      {k.nome}
                    </TableCell>
                    <TableCell className="text-xs">
                      {k.descricao ?? '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {k.itens.length}
                    </TableCell>
                    <TableCell className="text-xs">
                      {k.ativo ? 'Ativo' : 'Inativo'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(k)}
                          aria-label={`Editar kit ${k.nome}`}
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
                                `Remover o kit "${k.nome}"? Esta ação é irreversível.`,
                              )
                            ) {
                              deleteM.mutate(k.uuid);
                            }
                          }}
                          aria-label={`Remover kit ${k.nome}`}
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
              {editing ? 'Editar kit' : 'Novo kit cirúrgico'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label htmlFor="kit-nome">Nome *</Label>
              <Input
                id="kit-nome"
                value={form.nome}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nome: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="kit-desc">Descrição</Label>
              <Textarea
                id="kit-desc"
                value={form.descricao}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, descricao: e.target.value }))
                }
              />
            </div>

            <div className="rounded-md border p-2">
              <header className="flex items-center justify-between pb-2">
                <span className="text-xs font-medium">Itens</span>
                <Button type="button" size="sm" variant="outline" onClick={addItem}>
                  <Plus aria-hidden="true" />
                  Adicionar
                </Button>
              </header>
              {form.itens.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Nenhum item.
                </p>
              ) : (
                <ul className="space-y-1">
                  {form.itens.map((item, idx) => (
                    <li
                      key={idx}
                      className="grid grid-cols-12 items-end gap-2 border-t pt-1 first:border-t-0 first:pt-0"
                    >
                      <div className="col-span-7 space-y-1">
                        <Label htmlFor={`item-${idx}`}>Procedimento UUID</Label>
                        <Input
                          id={`item-${idx}`}
                          value={item.procedimentoUuid}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              itens: prev.itens.map((x, i) =>
                                i === idx
                                  ? {
                                      ...x,
                                      procedimentoUuid: e.target.value,
                                    }
                                  : x,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label htmlFor={`item-qtd-${idx}`}>Qtd</Label>
                        <Input
                          id={`item-qtd-${idx}`}
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
                      <div className="col-span-2 flex items-center pt-5">
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={item.obrigatorio}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                itens: prev.itens.map((x, i) =>
                                  i === idx
                                    ? { ...x, obrigatorio: e.target.checked }
                                    : x,
                                ),
                              }))
                            }
                          />
                          Obrig.
                        </label>
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
              {editing ? 'Salvar alterações' : 'Criar kit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
