/**
 * HomePage — placeholder pós-login. O Dashboard real é entregue em Fase 12.
 */
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

export function HomePage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.nome?.split(/\s+/u)[0] ?? 'colega';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Bem-vindo, {firstName}.
        </h1>
        <p className="text-sm text-muted-foreground">
          HMS-BR — Sistema de Gestão Hospitalar. Os módulos serão liberados ao
          longo das próximas fases.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configurar segurança</CardTitle>
            <CardDescription>
              Ative o MFA e fortaleça sua senha.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Link
              to="/auth/mfa-setup"
              className="block text-primary hover:underline"
            >
              Habilitar MFA →
            </Link>
            <Link
              to="/profile/password"
              className="block text-primary hover:underline"
            >
              Trocar senha →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sua sessão</CardTitle>
            <CardDescription>
              Tenant: <strong>{user?.tenantCode ?? user?.tenantId ?? '—'}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Perfis: </span>
              {user?.perfis?.join(', ') || '—'}
            </p>
            <p>
              <span className="font-medium text-foreground">MFA ativo: </span>
              {user?.mfa ? 'sim' : 'não'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
