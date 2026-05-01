/**
 * CadernosGabaritosPage — CRUD de cadernos de gabarito.
 *
 * Cada caderno tem nome, procedimento principal, cirurgião (opcional)
 * e versão. Cada item é (procedimento + qtd padrão + obrigatório).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookCopy, Edit, Loader2, Plus, Save, Trash2 } from 'lucide-react';
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
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import {
  createCadernoGabarito,
  deleteCadernoGabarito,
  listCadernosGabaritos,
  updateCadernoGabarito,
} from '@/lib/kits-gabaritos-api';
import { useToast } from '@/components/Toast';
import type {
  CadernoGabarito,
  CadernoGabaritoItem,
} from '@/types/centro-cirurgico';

interface FormState {
  nome: string;
  procedimentoPrincipalUuid: string;
  cirurgiaoUuid: string;
  versao: number;
  itens: CadernoGabaritoItem[];
}

const EMPTY: FormState = {
  nome: '',
  procedimentoPrincipalUuid: '',
  cirurgiaoUuid: '',
  versao: 1,
  itens: [],
};

export function CadernosGabaritosPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CadernoGabarito | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const query = useQuery({
    queryKey: ['cadernos-gabaritos'],
    queryFn: () => listCadernosGabaritos(),
    staleTime: 30_000,
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['cadernos-gabaritos'] });
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
    mutationFn: createCadernoGabarito,
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Caderno criado',
        description: '',
      });
      setOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao criar caderno'),
  });

  const updateM = useMutation({
    mutationFn: ({ uuid, data }: { uuid: string; data: FormState }) =>
      updateCadernoGabarito(uuid, {
        nome: data.nome,
        procedimentoPrincipalUuid: data.procedimentoPrincipalUuid,
        cirurgiaoUuid: data.cirurgiaoUuid || undefined,
        versao: data.versao,
        itens: data.itens,
      }),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Caderno atualizado',
        description: '',
      });
      setOpen(false);
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao atualizar caderno'),
  });

  const deleteM = useMutation({
    mutationFn: (uuid: string) => deleteCadernoGabarito(uuid),
    onSuccess: () => {
      showToast({
        variant: 'success',
        title: 'Caderno removido',
        description: '',
      });
      invalidate();
    },
    onError: (e) => toastErr(e, 'Falha ao remover'),
  });

  function openCreate(): void {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(c: CadernoGabarito): void {
    setEditing(c);
    setForm({
      nome: c.nome,
      procedimentoPrincipalUuid: c.procedimentoPrincipalUuid,
      cirurgiaoUuid: c.cirurgiaoUuid ?? '',
      versao: c.versao,
      itens: c.itens.map((i) => ({ ...i })),
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
          quantidadePadrao: 1,
          obrigatorio: false,
        },
      ],
    }));
  }

  function handleSubmit(): void {
    if (
      !form.nome.trim() ||
      !form.procedimentoPrincipalUuid.trim()
    ) {
      showToast({
        variant: 'destructive',
        title: 'Campos obrigatórios',
        description: 'Nome e procedimento principal são obrigatórios.',
      });
      return;
    }
    if (editing) {
      updateM.mutate({ uuid: editing.uuid, data: form });
    } else {
      createM.mutate({
        nome: form.nome.trim(),
        procedimentoPrincipalUuid: form.procedimentoPrincipalUuid.trim(),
        cirurgiaoUuid: form.cirurgiaoUuid.trim() || undefined,
        versao: form.versao,
        itens: form.itens,
      });
    }
  }

  const cadernos = query.data?.data ?? [];

  return (
    <section className="space-y-4" aria-label="Cadernos de gabaritos">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <BookCopy aria-hidden="true" className="h-6 w-6" />
            Cadernos de gabaritos
          </h1>
          <p className="text-sm text-muted-foreground">
            Cadastros versionados por procedimento principal (RN-CC-09).
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus aria-hidden="true" />
          Novo caderno
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cadernos cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="cadernos-tabela">
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Proc. principal</TableHead>
                <TableHead>Cirurgião</TableHead>
                <TableHead className="text-right">Versão</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm">
                    <Loader2
                      aria-hidden="true"
                      className="mr-2 inline h-4 w-4 animate-spin"
                    />
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : cadernos.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    Nenhum caderno cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                cadernos.map((c) => (
                  <TableRow key={c.uuid}>
                    <TableCell className="text-xs font-medium">
                      {c.nome}
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.procedimentoPrincipalNome ??
                        c.procedimentoPrincipalUuid}
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.cirurgiaoNome ?? c.cirurgiaoUuid ?? '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {c.versao}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {c.itens.length}
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(c)}
                          aria-label={`Editar caderno ${c.nome}`}
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
                                `Remover o caderno "${c.nome}"?`,
                              )
                            ) {
                              deleteM.mutate(c.uuid);
                            }
                          }}
                          aria-label={`Remover caderno ${c.nome}`}
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
              {editing ? 'Editar caderno' : 'Novo caderno de gabarito'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label htmlFor="cad-nome">Nome *</Label>
              <Input
                id="cad-nome"
                value={form.nome}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nome: e.target.value }))
                }
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cad-pp">Procedimento principal (UUID) *</Label>
                <Input
                  id="cad-pp"
                  value={form.procedimentoPrincipalUuid}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      procedimentoPrincipalUuid: e.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cad-cir">Cirurgião (UUID, opcional)</Label>
                <Input
                  id="cad-cir"
                  value={form.cirurgiaoUuid}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      cirurgiaoUuid: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cad-ver">Versão *</Label>
                <Input
                  id="cad-ver"
                  type="number"
                  min="1"
                  value={form.versao}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      versao: Number(e.target.value) || 1,
                    }))
                  }
                />
              </div>
            </div>

            <div className="rounded-md border p-2">
              <header className="flex items-center justify-between pb-2">
                <span className="text-xs font-medium">Itens</span>
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
                        <Label htmlFor={`citem-${idx}`}>
                          Procedimento UUID
                        </Label>
                        <Input
                          id={`citem-${idx}`}
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
                        <Label htmlFor={`citem-qtd-${idx}`}>Qtd padrão</Label>
                        <Input
                          id={`citem-qtd-${idx}`}
                          type="number"
                          min="1"
                          value={item.quantidadePadrao}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              itens: prev.itens.map((x, i) =>
                                i === idx
                                  ? {
                                      ...x,
                                      quantidadePadrao:
                                        Number(e.target.value) || 1,
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
              {editing ? 'Salvar' : 'Criar caderno'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
