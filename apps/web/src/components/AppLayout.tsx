/**
 * AppLayout — shell do app autenticado (topbar + sidebar + outlet).
 *
 * Topbar:
 *   - Logo HMS-BR (link para `/`).
 *   - Busca global (`⌘K`) — placeholder por enquanto.
 *   - Notificações (placeholder com badge zerado).
 *   - Avatar com dropdown: nome, e-mail, "Trocar senha", "MFA setup", "Sair".
 *
 * Sidebar:
 *   - Items placeholder (Pacientes, Agenda, Leitos, etc.) — apenas links que
 *     levam à home no momento; serão substituídos quando módulos chegarem.
 *
 * Decisões:
 *   - Dropdown construído sem nova dep (Radix-dropdown ainda não instalado).
 *     Fechamento por clique fora + tecla ESC.
 *   - `⌘K` tem listener global mas só mostra um toast informativo até a
 *     command palette ser implementada.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Hospital,
  KeyRound,
  LogOut,
  Search,
  ShieldCheck,
  Calendar,
  Users,
  Bed,
  Pill,
  Activity,
  FileText,
  Receipt,
  ChevronDown,
} from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { postLogout } from '@/lib/auth-api';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

interface SidebarItem {
  to: string;
  label: string;
  icon: typeof Hospital;
  /** Quando `true`, só visualmente — sem rota real ainda. */
  comingSoon?: boolean;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { to: '/', label: 'Home', icon: Hospital },
  { to: '/pacientes', label: 'Pacientes', icon: Users, comingSoon: true },
  { to: '/agenda', label: 'Agenda', icon: Calendar, comingSoon: true },
  { to: '/leitos', label: 'Mapa de leitos', icon: Bed, comingSoon: true },
  { to: '/pep', label: 'PEP', icon: Activity, comingSoon: true },
  { to: '/farmacia', label: 'Farmácia', icon: Pill, comingSoon: true },
  { to: '/laudos', label: 'Laudos', icon: FileText, comingSoon: true },
  { to: '/faturamento', label: 'Faturamento', icon: Receipt, comingSoon: true },
];

interface UserMenuProps {
  userName: string;
  userEmail: string;
  onChangePassword: () => void;
  onMfaSetup: () => void;
  onLogout: () => void;
}

function UserMenu({
  userName,
  userEmail,
  onChangePassword,
  onMfaSetup,
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
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onMfaSetup();
            }}
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
          >
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Configurar MFA
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

interface AppLayoutProps {
  children?: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps): JSX.Element {
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const user = useAuthStore((s) => s.user);
  const logoutAction = useAuthStore((s) => s.logout);

  // ⌘K placeholder — deixa o atalho registrado mas só notifica.
  useEffect(() => {
    function handler(event: KeyboardEvent): void {
      const isMod = event.metaKey || event.ctrlKey;
      if (isMod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        showToast({
          title: 'Busca global',
          description: 'A command palette (⌘K) chega em uma fase próxima.',
          durationMs: 2500,
        });
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showToast]);

  async function handleLogout(): Promise<void> {
    try {
      await postLogout();
    } catch {
      // Mesmo em falha de rede limpamos o estado local.
    } finally {
      logoutAction();
      navigate('/login', { replace: true });
    }
  }

  if (!user) {
    // Acontece em janela curta enquanto /users/me ainda não populou store.
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4 shadow-sm">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm font-semibold"
          aria-label="Ir para a home"
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground"
          >
            <Hospital className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">HMS-BR</span>
        </Link>

        <button
          type="button"
          onClick={() =>
            showToast({
              title: 'Busca global',
              description:
                'A command palette (⌘K) chega em uma fase próxima.',
              durationMs: 2500,
            })
          }
          className="ml-auto flex h-9 w-full max-w-md items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:ml-4"
          aria-label="Busca global (⌘K)"
        >
          <Search aria-hidden="true" className="h-4 w-4" />
          <span className="flex-1 text-left">Buscar pacientes, leitos, exames...</span>
          <kbd className="hidden rounded border px-1.5 text-[10px] sm:inline">
            ⌘K
          </kbd>
        </button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Notificações"
          onClick={() =>
            showToast({
              title: 'Notificações',
              description: 'Centro de notificações chega em uma fase próxima.',
              durationMs: 2500,
            })
          }
        >
          <Bell aria-hidden="true" />
        </Button>

        <UserMenu
          userName={user.nome}
          userEmail={user.email}
          onChangePassword={() => navigate('/profile/password')}
          onMfaSetup={() => navigate('/auth/mfa-setup')}
          onLogout={() => {
            void handleLogout();
          }}
        />
      </header>

      <div className="flex flex-1">
        <aside
          aria-label="Menu lateral"
          className="hidden w-56 shrink-0 border-r bg-muted/20 p-3 lg:block"
        >
          <nav className="space-y-1">
            {SIDEBAR_ITEMS.map((item) => (
              <SidebarLink key={item.to} item={item} />
            ))}
          </nav>
          <p className="mt-6 px-2 text-[11px] text-muted-foreground">
            Itens marcados como <em>em breve</em> serão liberados ao longo das
            próximas fases.
          </p>
        </aside>

        <main className="flex-1 px-4 py-4 lg:px-8">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}

function SidebarLink({ item }: { item: SidebarItem }): JSX.Element {
  const Icon = item.icon;
  if (item.comingSoon) {
    return (
      <div
        aria-disabled="true"
        className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground/70"
        title="Em breve"
      >
        <Icon aria-hidden="true" className="h-4 w-4" />
        <span>{item.label}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide">
          em breve
        </span>
      </div>
    );
  }
  return (
    <NavLink
      to={item.to}
      end
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
}
