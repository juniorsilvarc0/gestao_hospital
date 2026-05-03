/**
 * PacientePortalLayout — shell do Portal do Paciente (Fase 11 R-C).
 *
 * Diferencial em relação ao app interno:
 *  - Tipografia maior (text-base/lg em vez de text-sm/xs).
 *  - Linguagem amigável: "Início", "Minhas consultas", "Meus exames" etc.
 *  - Sino com badge de notificações não lidas (busca via `getPacienteMe`
 *    para ter o contador no header sem custo).
 *  - Footer com link de privacidade e suporte.
 *  - Bottom nav em mobile.
 *
 * Acessibilidade:
 *  - aria-labels e descrições claras.
 *  - Focus rings preservados.
 *  - Cores com contraste WCAG AA.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Calendar,
  ChevronDown,
  CreditCard,
  FileHeart,
  Home,
  KeyRound,
  LifeBuoy,
  LogOut,
  Pill,
  ShieldCheck,
  TestTube2,
  User,
  Video,
} from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { postLogout } from '@/lib/auth-api';
import { getPacienteMe } from '@/lib/portal-paciente-api';
import { cn } from '@/lib/utils';

interface MenuItem {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { to: '/portal/paciente', label: 'Início', icon: Home, end: true },
  {
    to: '/portal/paciente/agendamentos',
    label: 'Minhas consultas',
    icon: Calendar,
  },
  { to: '/portal/paciente/exames', label: 'Meus exames', icon: TestTube2 },
  { to: '/portal/paciente/receitas', label: 'Receitas', icon: Pill },
  {
    to: '/portal/paciente/contas',
    label: 'Pagamentos',
    icon: CreditCard,
  },
  {
    to: '/portal/paciente/consentimentos',
    label: 'Termos de privacidade',
    icon: ShieldCheck,
  },
  {
    to: '/portal/paciente/notificacoes',
    label: 'Notificações',
    icon: Bell,
  },
];

interface UserMenuProps {
  userName: string;
  userEmail: string;
  onChangePassword: () => void;
  onLogout: () => void;
  fotoUrl?: string | null;
}

function UserMenu({
  userName,
  userEmail,
  onChangePassword,
  onLogout,
  fotoUrl,
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
        aria-label="Menu da minha conta"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-transparent px-2 py-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {fotoUrl ? (
          <img
            src={fotoUrl}
            alt={`Foto de ${userName}`}
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          >
            {initials || <User className="h-4 w-4" />}
          </span>
        )}
        <span className="hidden text-left sm:flex sm:flex-col">
          <span className="text-sm font-semibold leading-tight">{userName}</span>
          <span className="text-xs leading-tight text-muted-foreground">
            {userEmail}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 text-muted-foreground"
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Ações da minha conta"
          className="absolute right-0 top-full z-40 mt-1 w-64 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <div className="border-b px-3 py-2">
            <p className="text-sm font-semibold">{userName}</p>
            <p className="text-xs text-muted-foreground">{userEmail}</p>
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

export function PacientePortalLayout(): JSX.Element {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logoutAction = useAuthStore((s) => s.logout);

  // Busca dados do paciente para sinalizar notificações não lidas + foto.
  const meQuery = useQuery({
    queryKey: ['portal-paciente', 'me'],
    queryFn: getPacienteMe,
    enabled: Boolean(user),
    staleTime: 60_000,
    retry: false,
  });

  async function handleLogout(): Promise<void> {
    try {
      await postLogout();
    } catch {
      // continua para limpar localmente
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

  const naoLidas = meQuery.data?.resumo.notificacoesNaoLidas ?? 0;
  const fotoUrl = meQuery.data?.fotoUrl ?? null;
  const nomeExibido = meQuery.data?.nome ?? user.nome;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#conteudo-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Pular para o conteúdo principal
      </a>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background px-4 shadow-sm">
        <Link
          to="/portal/paciente"
          className="flex items-center gap-2 text-base font-semibold"
          aria-label="Ir para a página inicial"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground"
          >
            <FileHeart className="h-5 w-5" />
          </span>
          <span className="hidden sm:inline">Meu Portal</span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <Link
            to="/portal/paciente/notificacoes"
            aria-label={
              naoLidas > 0
                ? `Notificações (${naoLidas} não lidas)`
                : 'Notificações'
            }
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Bell aria-hidden="true" className="h-5 w-5" />
            {naoLidas > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
              >
                {naoLidas > 99 ? '99+' : naoLidas}
              </span>
            ) : null}
          </Link>

          <UserMenu
            userName={nomeExibido}
            userEmail={user.email}
            fotoUrl={fotoUrl}
            onChangePassword={() => navigate('/profile/password')}
            onLogout={() => {
              void handleLogout();
            }}
          />
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          aria-label="Menu do portal do paciente"
          className="hidden w-64 shrink-0 border-r bg-muted/20 p-3 lg:block"
        >
          <nav className="space-y-1">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end ?? false}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-3 text-base transition-colors',
                      isActive
                        ? 'bg-accent font-semibold'
                        : 'hover:bg-accent/60',
                    )
                  }
                >
                  <Icon aria-hidden="true" className="h-5 w-5" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
            <div className="border-t pt-2">
              <Link
                to="/portal/paciente/agendar"
                className="flex items-center gap-3 rounded-md bg-primary px-3 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Calendar aria-hidden="true" className="h-5 w-5" />
                <span>Agendar consulta</span>
              </Link>
            </div>
          </nav>
        </aside>

        {/* Bottom nav (mobile only) */}
        <nav
          aria-label="Menu rápido"
          className="fixed bottom-0 left-0 right-0 z-20 flex justify-around border-t bg-background lg:hidden"
        >
          {MENU_ITEMS.slice(0, 5).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) =>
                  cn(
                    'flex flex-1 flex-col items-center gap-0.5 px-2 py-2 text-[11px]',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )
                }
              >
                <Icon aria-hidden="true" className="h-5 w-5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <main
          id="conteudo-principal"
          className="flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-6"
        >
          <Outlet />
        </main>
      </div>

      <footer className="border-t bg-muted/30 px-4 py-4 pb-20 text-xs text-muted-foreground lg:pb-4">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 sm:flex-row">
          <p>
            Em caso de emergência, ligue 192 (SAMU) ou procure o pronto-socorro
            mais próximo.
          </p>
          <div className="flex items-center gap-3">
            <Link
              to="/portal/paciente/consentimentos"
              className="flex items-center gap-1 hover:underline"
            >
              <ShieldCheck aria-hidden="true" className="h-3 w-3" />
              Privacidade
            </Link>
            <a
              href="mailto:suporte@hms.local"
              className="flex items-center gap-1 hover:underline"
            >
              <LifeBuoy aria-hidden="true" className="h-3 w-3" />
              Suporte
            </a>
            <span className="flex items-center gap-1">
              <Video aria-hidden="true" className="h-3 w-3" />
              Teleconsulta
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

PacientePortalLayout.displayName = 'PacientePortalLayout';
