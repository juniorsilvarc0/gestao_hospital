/**
 * ProtectedRoute — guarda de rota autenticada.
 *
 * Comportamento:
 *  - Se `isAuthenticated` é `false` no auth-store ⇒ redireciona `/login` com
 *    `?redirect=<pathname+search>` para devolver o usuário ao destino.
 *  - Se autenticado, no mount faz `GET /v1/users/me` para revalidar o token e
 *    repopular o store. Em 401, o api-client já dispara `setOnUnauthorized`
 *    que redireciona ao login. Em sucesso, renderiza children.
 *  - Enquanto valida, exibe um spinner full-screen acessível.
 */
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { getCurrentUser } from '@/lib/auth-api';

interface ProtectedRouteProps {
  children?: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps): JSX.Element {
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const [isValidating, setIsValidating] = useState(Boolean(accessToken));
  const [validationDone, setValidationDone] = useState(!accessToken);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken) {
      setIsValidating(false);
      setValidationDone(true);
      return () => {
        cancelled = true;
      };
    }
    setIsValidating(true);
    setValidationDone(false);
    void (async () => {
      try {
        const user = await getCurrentUser();
        if (!cancelled) {
          setUser(user);
        }
      } catch {
        // O api-client já cuida de logout/redirect em 401.
        // Em outros erros, deixamos o store como está (poderia ser rede).
      } finally {
        if (!cancelled) {
          setIsValidating(false);
          setValidationDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Roda apenas na primeira montagem do guard por sessão de tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAuthenticated && validationDone) {
    const redirect = `${location.pathname}${location.search}`;
    const target =
      redirect && redirect !== '/'
        ? `/login?redirect=${encodeURIComponent(redirect)}`
        : '/login';
    return <Navigate to={target} replace />;
  }

  if (isValidating) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-muted/40"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Validando sessão...
        </div>
      </div>
    );
  }

  return <>{children ?? <Outlet />}</>;
}
