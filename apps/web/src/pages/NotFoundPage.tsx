import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

export function NotFoundPage(): JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const target = isAuthenticated ? '/' : '/login';
  const label = isAuthenticated ? 'Voltar para a home' : 'Voltar para o login';

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="max-w-md space-y-4 text-center">
        <p className="text-sm font-medium text-muted-foreground">Erro 404</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Página não encontrada
        </h1>
        <p className="text-sm text-muted-foreground">
          O endereço acessado não existe ou foi movido. Verifique o link ou
          retorne ao início.
        </p>
        <Button asChild>
          <Link to={target}>{label}</Link>
        </Button>
      </div>
    </main>
  );
}
