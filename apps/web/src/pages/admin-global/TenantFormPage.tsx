/**
 * TenantFormPage — criar / editar tenant (Fase 13 R-C).
 *
 * Modo:
 *  - sem `:uuid` → criação (POST /v1/admin/tenants).
 *  - com `:uuid` → edição (PATCH /v1/admin/tenants/:uuid).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, Loader2, Save } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import {
  atualizarTenant,
  criarTenant,
  getTenant,
} from '@/lib/admin-api';

export function TenantFormPage(): JSX.Element {
  const { uuid } = useParams<{ uuid: string }>();
  const isEdit = Boolean(uuid);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');

  const tenantQuery = useQuery({
    queryKey: ['admin', 'tenant', uuid],
    queryFn: () => getTenant(uuid as string),
    enabled: isEdit,
  });

  useEffect(() => {
    if (isEdit && tenantQuery.data) {
      setCodigo(tenantQuery.data.codigo);
      setNome(tenantQuery.data.nome);
      setCnpj(tenantQuery.data.cnpj ?? '');
    }
  }, [isEdit, tenantQuery.data]);

  const podeSalvar = useMemo(
    () => codigo.trim().length >= 2 && nome.trim().length >= 2,
    [codigo, nome],
  );

  const criarMutation = useMutation({
    mutationFn: () =>
      criarTenant({ codigo, nome, ...(cnpj ? { cnpj } : {}) }),
    onSuccess: (data) => {
      showToast({
        title: 'Tenant criado',
        description: `Código ${data.codigo}.`,
        variant: 'success',
        durationMs: 2500,
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      navigate('/admin/tenants', { replace: true });
    },
    onError: (err) => {
      showToast({
        title: 'Falha ao criar',
        description: err instanceof Error ? err.message : 'Erro desconhecido.',
        variant: 'destructive',
        durationMs: 4500,
      });
    },
  });

  const editarMutation = useMutation({
    mutationFn: () =>
      atualizarTenant(uuid as string, { nome, ...(cnpj ? { cnpj } : {}) }),
    onSuccess: () => {
      showToast({
        title: 'Tenant atualizado',
        description: 'Alterações salvas.',
        variant: 'success',
        durationMs: 2500,
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'tenant', uuid],
      });
      navigate('/admin/tenants', { replace: true });
    },
    onError: (err) => {
      showToast({
        title: 'Falha ao atualizar',
        description: err instanceof Error ? err.message : 'Erro desconhecido.',
        variant: 'destructive',
        durationMs: 4500,
      });
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!podeSalvar) return;
    if (isEdit) editarMutation.mutate();
    else criarMutation.mutate();
  }

  const isPending = criarMutation.isPending || editarMutation.isPending;

  return (
    <section
      className="space-y-4"
      aria-label={isEdit ? 'Editar tenant' : 'Novo tenant'}
      data-testid="admin-tenant-form-page"
    >
      <header className="space-y-1">
        <p>
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link to="/admin/tenants">
              <ArrowLeft aria-hidden="true" />
              Voltar
            </Link>
          </Button>
        </p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Building2 aria-hidden="true" className="h-6 w-6" />
          {isEdit ? 'Editar tenant' : 'Novo tenant'}
        </h1>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Identificação</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <Label htmlFor="ten-codigo">Código</Label>
              <Input
                id="ten-codigo"
                value={codigo}
                placeholder="ex.: hsx, hospital-x"
                onChange={(e) => setCodigo(e.target.value)}
                disabled={isEdit}
                aria-describedby="ten-codigo-help"
                data-testid="tenant-codigo"
                required
                minLength={2}
              />
              <p id="ten-codigo-help" className="text-[11px] text-muted-foreground">
                Slug curto, único, imutável após criação.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ten-nome">Nome</Label>
              <Input
                id="ten-nome"
                value={nome}
                placeholder="Hospital São Xavier"
                onChange={(e) => setNome(e.target.value)}
                data-testid="tenant-nome"
                required
                minLength={2}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ten-cnpj">CNPJ (opcional)</Label>
              <Input
                id="ten-cnpj"
                value={cnpj}
                placeholder="00.000.000/0000-00"
                onChange={(e) => setCnpj(e.target.value)}
                data-testid="tenant-cnpj"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="submit"
                disabled={!podeSalvar || isPending}
                data-testid="tenant-salvar"
              >
                {isPending ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <Save aria-hidden="true" />
                )}
                {isEdit ? 'Salvar alterações' : 'Criar tenant'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

TenantFormPage.displayName = 'TenantFormPage';
