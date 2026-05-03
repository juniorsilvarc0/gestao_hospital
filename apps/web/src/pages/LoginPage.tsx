/**
 * LoginPage — substituição do mock de Fase 1 por chamada real à API.
 *
 * Fluxo:
 *  1. Step `credentials`: tenantCode + e-mail + senha.
 *  2. Backend pode responder `{ mfaRequired: true }` → step `mfa` pede 6 dígitos.
 *  3. Em sucesso: tokens + user gravados no auth-store, navega para a página
 *     de origem (`?redirect=`) ou `/`.
 *
 * RN-SEG aplicáveis:
 *  - Mensagem de erro genérica em credenciais inválidas (não revelar se
 *    e-mail existe — RN-LGP-05/RN-SEG-03).
 *  - Bloqueios (UserLocked/IpLocked) tratados com mensagem clara para o
 *    usuário operar (procurar admin).
 */
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Hospital } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { postLogin } from '@/lib/auth-api';
import { useAuthStore } from '@/stores/auth-store';
import { isMfaRequiredResponse } from '@/types/auth';
import type { LoginRequest } from '@/types/auth';
import { useToast } from '@/components/Toast';

const credentialsSchema = z.object({
  tenantCode: z
    .string()
    .min(1, 'Informe o código do hospital/tenant.')
    .max(64, 'Código muito longo.'),
  email: z.string().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
  senha: z
    .string()
    .min(8, 'A senha deve ter ao menos 8 caracteres.')
    .max(128, 'Senha muito longa.'),
});

type CredentialsValues = z.infer<typeof credentialsSchema>;

const mfaSchema = z.object({
  mfaCode: z
    .string()
    .regex(/^\d{6}$/u, 'Informe os 6 dígitos do app autenticador.'),
});

type MfaValues = z.infer<typeof mfaSchema>;

type Step = 'credentials' | 'mfa';

const DEFAULT_TENANT_CODE = import.meta.env.DEV ? 'dev' : '';

function getRedirectTo(search: string): string {
  const params = new URLSearchParams(search);
  const redirect = params.get('redirect');
  // Aceita só caminhos absolutos internos, evita open-redirect.
  if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect;
  }
  return '/';
}

/**
 * Decide para onde mandar o usuário após login bem-sucedido (Fase 11 R-C).
 *
 * Heurística:
 *  - Se o redirect explícito mira `/portal/medico` ou `/portal/paciente`,
 *    respeita.
 *  - Se o usuário tem perfil PACIENTE → portal do paciente.
 *  - Se o usuário tem perfil PRESTADOR/MEDICO **e nenhum perfil interno** →
 *    portal do médico.
 *  - Caso contrário (perfis administrativos/clínicos do hospital) → app
 *    interno (`/` ou redirect).
 *
 * TODO(R-A/R-B): se o backend passar a expor `tipo_perfil` separado de
 * `perfis[]` no /me ou no JWT, trocar esta heurística por leitura direta
 * do campo. Hoje usamos a string array `perfis` que já vem no payload do
 * /v1/auth/login.
 */
const INTERNAL_APP_PERFIS_FOR_REDIRECT = [
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

export function decidePostLoginPath(args: {
  perfis: string[] | undefined;
  desiredRedirect: string;
}): string {
  const perfis = args.perfis ?? [];
  const desired = args.desiredRedirect;

  if (
    desired.startsWith('/portal/medico') ||
    desired.startsWith('/portal/paciente')
  ) {
    return desired;
  }

  if (perfis.includes('PACIENTE')) {
    return '/portal/paciente';
  }

  const isPrestador = perfis.includes('PRESTADOR') || perfis.includes('MEDICO');
  const hasInternal = perfis.some((p) =>
    INTERNAL_APP_PERFIS_FOR_REDIRECT.includes(p),
  );
  if (isPrestador && !hasInternal) {
    return '/portal/medico';
  }

  return desired;
}

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { show: showToast } = useToast();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const loginAction = useAuthStore((s) => s.login);
  const setMfaPending = useAuthStore((s) => s.setMfaPending);
  const [step, setStep] = useState<Step>('credentials');
  const [pendingCredentials, setPendingCredentials] = useState<LoginRequest | null>(
    null,
  );
  const mfaInputRef = useRef<HTMLInputElement | null>(null);

  const credentialsForm = useForm<CredentialsValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { tenantCode: DEFAULT_TENANT_CODE, email: '', senha: '' },
    mode: 'onBlur',
  });

  const mfaForm = useForm<MfaValues>({
    resolver: zodResolver(mfaSchema),
    defaultValues: { mfaCode: '' },
    mode: 'onSubmit',
  });

  // Auto-focus no campo MFA quando o step muda.
  useEffect(() => {
    if (step === 'mfa') {
      mfaInputRef.current?.focus();
    }
  }, [step]);

  if (isAuthenticated) {
    const user = useAuthStore.getState().user;
    const target = decidePostLoginPath({
      perfis: user?.perfis,
      desiredRedirect: getRedirectTo(location.search),
    });
    return <Navigate to={target} replace />;
  }

  function handleApiError(err: unknown, fallback: string): void {
    if (err instanceof ApiError) {
      // RN-SEG: nunca confirmar existência de e-mail/tenant. Códigos
      // específicos são tratados; demais entram no fallback.
      const code = err.code ?? '';
      let title = err.title ?? 'Não foi possível entrar';
      let description = err.detail ?? fallback;

      if (
        code === 'AUTH_INVALID_CREDENTIALS' ||
        code === 'AUTH_TENANT_NOT_FOUND' ||
        err.status === 401
      ) {
        title = 'Credenciais inválidas';
        description = 'Verifique tenant, e-mail e senha e tente novamente.';
      } else if (code === 'AUTH_USER_LOCKED') {
        title = 'Conta bloqueada';
        description =
          'Sua conta foi temporariamente bloqueada por excesso de tentativas. Aguarde 15 minutos.';
      } else if (code === 'AUTH_IP_LOCKED') {
        title = 'Acesso bloqueado';
        description =
          'Muitas tentativas a partir deste local. Aguarde alguns minutos.';
      } else if (code === 'AUTH_USER_INACTIVE') {
        title = 'Usuário inativo';
        description = 'Procure o administrador do sistema.';
      }
      showToast({ variant: 'destructive', title, description });
      return;
    }
    showToast({ variant: 'destructive', title: 'Erro', description: fallback });
  }

  async function onSubmitCredentials(values: CredentialsValues): Promise<void> {
    try {
      const response = await postLogin({
        tenantCode: values.tenantCode.trim(),
        email: values.email.trim(),
        senha: values.senha,
      });
      if (isMfaRequiredResponse(response)) {
        setMfaPending(true);
        setPendingCredentials({
          tenantCode: values.tenantCode.trim(),
          email: values.email.trim(),
          senha: values.senha,
        });
        setStep('mfa');
        showToast({
          variant: 'info',
          title: 'Verificação adicional',
          description:
            'Informe o código de 6 dígitos do seu app autenticador (Google Authenticator, Authy, 1Password).',
        });
        return;
      }
      // Sucesso direto (sem MFA).
      loginAction({
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      navigate(
        decidePostLoginPath({
          perfis: response.user.perfis,
          desiredRedirect: getRedirectTo(location.search),
        }),
        { replace: true },
      );
    } catch (err) {
      handleApiError(err, 'Falha ao entrar. Tente novamente.');
    }
  }

  async function onSubmitMfa(values: MfaValues): Promise<void> {
    if (!pendingCredentials) {
      setStep('credentials');
      return;
    }
    try {
      const response = await postLogin({
        ...pendingCredentials,
        mfaCode: values.mfaCode,
      });
      if (isMfaRequiredResponse(response)) {
        showToast({
          variant: 'destructive',
          title: 'Código inválido',
          description: 'O código informado não foi aceito. Tente novamente.',
        });
        mfaForm.reset({ mfaCode: '' });
        return;
      }
      loginAction({
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      setMfaPending(false);
      setPendingCredentials(null);
      navigate(
        decidePostLoginPath({
          perfis: response.user.perfis,
          desiredRedirect: getRedirectTo(location.search),
        }),
        { replace: true },
      );
    } catch (err) {
      handleApiError(err, 'Falha ao validar o código MFA.');
    }
  }

  function handleSwitchTenant(): void {
    setStep('credentials');
    setPendingCredentials(null);
    setMfaPending(false);
    credentialsForm.reset({
      tenantCode: '',
      email: credentialsForm.getValues('email'),
      senha: '',
    });
    mfaForm.reset({ mfaCode: '' });
  }

  function handleBackFromMfa(): void {
    setStep('credentials');
    setPendingCredentials(null);
    setMfaPending(false);
    mfaForm.reset({ mfaCode: '' });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Hospital aria-hidden="true" className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            HMS-BR — Hospital Management System
          </h1>
          <p className="text-sm text-muted-foreground">
            Sistema de gestão hospitalar multi-tenant.
          </p>
        </div>

        {step === 'credentials' ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Acessar o sistema</CardTitle>
              <CardDescription>
                Use seu código de tenant, e-mail corporativo e senha.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                noValidate
                onSubmit={credentialsForm.handleSubmit(onSubmitCredentials)}
                className="space-y-4"
                aria-label="Formulário de login"
              >
                <div className="space-y-2">
                  <Label htmlFor="tenantCode">Código do tenant</Label>
                  <Input
                    id="tenantCode"
                    type="text"
                    autoComplete="organization"
                    placeholder="ex.: hospital-sao-judas"
                    aria-invalid={
                      credentialsForm.formState.errors.tenantCode ? true : false
                    }
                    aria-describedby={
                      credentialsForm.formState.errors.tenantCode
                        ? 'tenantCode-error'
                        : undefined
                    }
                    {...credentialsForm.register('tenantCode')}
                  />
                  {credentialsForm.formState.errors.tenantCode ? (
                    <p
                      id="tenantCode-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {credentialsForm.formState.errors.tenantCode.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="seu.usuario@hospital.com.br"
                    aria-invalid={
                      credentialsForm.formState.errors.email ? true : false
                    }
                    aria-describedby={
                      credentialsForm.formState.errors.email
                        ? 'email-error'
                        : undefined
                    }
                    {...credentialsForm.register('email')}
                  />
                  {credentialsForm.formState.errors.email ? (
                    <p
                      id="email-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {credentialsForm.formState.errors.email.message}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="senha">Senha</Label>
                    <Link
                      to="/auth/forgot-password"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Esqueci minha senha
                    </Link>
                  </div>
                  <Input
                    id="senha"
                    type="password"
                    autoComplete="current-password"
                    aria-invalid={
                      credentialsForm.formState.errors.senha ? true : false
                    }
                    aria-describedby={
                      credentialsForm.formState.errors.senha
                        ? 'senha-error'
                        : undefined
                    }
                    {...credentialsForm.register('senha')}
                  />
                  {credentialsForm.formState.errors.senha ? (
                    <p
                      id="senha-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {credentialsForm.formState.errors.senha.message}
                    </p>
                  ) : null}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={credentialsForm.formState.isSubmitting}
                  aria-busy={credentialsForm.formState.isSubmitting}
                >
                  {credentialsForm.formState.isSubmitting ? (
                    <>
                      <Loader2 aria-hidden="true" className="animate-spin" />
                      Continuando...
                    </>
                  ) : (
                    'Continuar'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Verificação MFA</CardTitle>
              <CardDescription>
                Informe o código de 6 dígitos gerado pelo seu app autenticador.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                noValidate
                onSubmit={mfaForm.handleSubmit(onSubmitMfa)}
                className="space-y-4"
                aria-label="Formulário de MFA"
              >
                <div className="space-y-2">
                  <Label htmlFor="mfaCode">Código de 6 dígitos</Label>
                  <Input
                    id="mfaCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    maxLength={6}
                    aria-invalid={mfaForm.formState.errors.mfaCode ? true : false}
                    aria-describedby={
                      mfaForm.formState.errors.mfaCode ? 'mfaCode-error' : undefined
                    }
                    {...mfaForm.register('mfaCode')}
                    ref={(el) => {
                      mfaForm.register('mfaCode').ref(el);
                      mfaInputRef.current = el;
                    }}
                  />
                  {mfaForm.formState.errors.mfaCode ? (
                    <p
                      id="mfaCode-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {mfaForm.formState.errors.mfaCode.message}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="sm:flex-1"
                    onClick={handleBackFromMfa}
                    disabled={mfaForm.formState.isSubmitting}
                  >
                    Voltar
                  </Button>
                  <Button
                    type="submit"
                    className="sm:flex-1"
                    disabled={mfaForm.formState.isSubmitting}
                    aria-busy={mfaForm.formState.isSubmitting}
                  >
                    {mfaForm.formState.isSubmitting ? (
                      <>
                        <Loader2 aria-hidden="true" className="animate-spin" />
                        Validando...
                      </>
                    ) : (
                      'Entrar'
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={handleSwitchTenant}
          >
            Trocar tenant
          </button>
          <p>
            Compliance LGPD/TISS/ICP-Brasil. Acesso registrado em audit log.
          </p>
        </div>
      </div>
    </main>
  );
}
