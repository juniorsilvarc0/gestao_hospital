import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Hospital } from 'lucide-react';
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

/**
 * Schema do formulário de login.
 * Em Fase 2 será validado também no backend (`packages/shared-types`).
 */
const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Informe o e-mail.')
    .email('E-mail inválido.'),
  senha: z
    .string()
    .min(8, 'A senha deve ter ao menos 8 caracteres.')
    .max(128, 'Senha muito longa.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * Login mock de Fase 1.
 *
 * O submit resolve um Promise local após ~500ms — não há chamada de API.
 * Quando a Fase 2 (autenticação real) chegar, basta trocar este handler para
 * `apiPost('/auth/login', values)` (ver `@/lib/api-client`).
 */
export function LoginPage(): JSX.Element {
  const [feedback, setFeedback] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', senha: '' },
    mode: 'onBlur',
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit(values: LoginFormValues): Promise<void> {
    setFeedback(null);
    // Latência simulada — Fase 2 substitui por chamada real à API.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });
    // `console.warn` é permitido pelo preset raiz (`no-console: warn` allow list).
    console.warn(
      '[HMS-BR] Login fake — autenticação real será implementada na Fase 2.',
      { email: values.email },
    );
    setFeedback(
      'Login fake — Fase 2 implementa autenticação real (JWT + MFA + RBAC).',
    );
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

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Acessar o sistema</CardTitle>
            <CardDescription>
              Use seu e-mail corporativo e senha. MFA será exigido após Fase 2.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              noValidate
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-4"
              aria-label="Formulário de login"
            >
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="seu.usuario@hospital.com.br"
                  aria-invalid={errors.email ? true : false}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  {...register('email')}
                />
                {errors.email ? (
                  <p
                    id="email-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {errors.email.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={errors.senha ? true : false}
                  aria-describedby={errors.senha ? 'senha-error' : undefined}
                  {...register('senha')}
                />
                {errors.senha ? (
                  <p
                    id="senha-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {errors.senha.message}
                  </p>
                ) : null}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 aria-hidden="true" className="animate-spin" />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>

              {feedback ? (
                <p
                  role="status"
                  className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/40 p-3 text-center text-sm text-muted-foreground"
                >
                  {feedback}
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Fase 1 — esqueleto frontend. Compliance LGPD/TISS/ICP-Brasil ativo a partir
          das fases seguintes.
        </p>
      </div>
    </main>
  );
}
