/**
 * MedicoPortalLayout — shell do Portal do Médico (Fase 11 R-C).
 *
 * Sidebar reduzida com itens do dia-a-dia clínico do prestador (médico).
 * Mantém um botão "Voltar ao painel completo" quando o usuário também tem
 * permissão para o app interno (heurística: existe ao menos um perfil
 * diferente de PRESTADOR/MEDICO/PACIENTE em `user.perfis`).
 */
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  FileText,
  Hospital,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Stethoscope,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { postLogout } from '@/lib/auth-api';
import { cn } from '@/lib/utils';

interface SidebarItem {
  to: string;
  label: string;
  icon: typeof Hospital;
  end?: boolean;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { to: '/portal/medico', label: 'Início', icon: LayoutDashboard, end: true },
  { to: '/portal/medico/agenda', label: 'Agenda', icon: Calendar },
  {
    to: '/portal/medico/laudos-pendentes',
    label: 'Laudos pendentes',
    icon: FileText,
  },
  {
    to: '/portal/medico/cirurgias',
    label: 'Cirurgias',
    icon: Stethoscope,
  },
  {
    to: '/portal/medico/producao',
    label: 'Produção',
    icon: TrendingUp,
  },
  { to: '/portal/medico/repasses', label: 'Repasses', icon: Wallet },
];

const INTERNAL_APP_PERFIS = [
  'ADMIN',
  'ENFERMEIRO',
  'FARMACEUTICO',
  'AUDITOR',
  'RECEPCAO',
  'TRIAGEM',
  'FATURAMENTO',
  'GESTAO',
  'SAME',
  'CCIH',
  'CME',
];

function userHasInternalAccess(perfis: string[] | undefined): boolean {
  if (!perfis || perfis.length === 0) return false;
  return perfis.some((p) => INTERNAL_APP_PERFIS.includes(p));
}

interface UserMenuProps {
  userName: string;
  userEmail: string;
  onChangePassword: () => void;
  onLogout: () => void;
}

function UserMenu({
  userName,
  userEmail,
  onChangePassword,
  onLogout,
}: UserMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent): void {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const initials = userName
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu do usuário"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          {initials || '?'}
        </span>
        <span className="hidden text-left sm:flex sm:flex-col">
          <span className="text-xs font-semibold leading-tight">{userName}</span>
          <span className="text-[11px] leading-tight text-muted-foreground">
            {userEmail}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className="h-3 w-3 text-muted-foreground" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Ações do usuário"
          className="absolute right-0 top-full z-40 mt-1 w-60 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <div className="border-b px-3 py-2 text-xs">
            <p className="font-semibold">{userName}</p>
            <p className="text-muted-foreground">{userEmail}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onChangePassword();
            }}
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
          >
            <KeyRound aria-hidden="true" className="h-4 w-4" />
            Trocar senha
          </button>
          <div className="my-1 border-t" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            Sair
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function MedicoPortalLayout(): JSX.Element {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logoutAction = useAuthStore((s) => s.logout);

  async function handleLogout(): Promise<void> {
    try {
      await postLogout();
    } catch {
      // Mesmo em falha de rede, limpamos o estado local.
    } finally {
      logoutAction();
      navigate('/login', { replace: true });
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const showInternalSwitch = userHasInternalAccess(user.perfis);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4 shadow-sm">
        <Link
          to="/portal/medico"
          className="flex items-center gap-2 text-sm font-semibold"
          aria-label="Ir para o início do portal do médico"
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground"
          >
            <Stethoscope className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">Portal do Médico</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {showInternalSwitch ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate('/')}
              aria-label="Voltar ao painel completo"
            >
              <ArrowLeft aria-hidden="true" />
              <span className="hidden sm:inline">Painel completo</span>
            </Button>
          ) : null}

          <UserMenu
            userName={user.nome}
            userEmail={user.email}
            onChangePassword={() => navigate('/profile/password')}
            onLogout={() => {
              void handleLogout();
            }}
          />
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          aria-label="Menu do portal do médico"
          className="hidden w-56 shrink-0 border-r bg-muted/20 p-3 lg:block"
        >
          <nav className="space-y-1">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end ?? false}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive ? 'bg-accent font-medium' : 'hover:bg-accent/60',
                    )
                  }
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </aside>

        {/* Mobile nav: top tabs scroll horizontal. */}
        <nav
          aria-label="Menu rápido do portal do médico"
          className="fixed bottom-0 left-0 right-0 z-20 flex justify-around border-t bg-background lg:hidden"
        >
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) =>
                  cn(
                    'flex flex-1 flex-col items-center gap-0.5 px-2 py-2 text-[10px]',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )
                }
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <main className="flex-1 px-4 py-4 pb-20 lg:px-8 lg:pb-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

MedicoPortalLayout.displayName = 'MedicoPortalLayout';

export const __test = {
  userHasInternalAccess,
  INTERNAL_APP_PERFIS,
  SIDEBAR_ITEMS,
};
