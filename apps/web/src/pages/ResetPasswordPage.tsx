/**
 * ResetPasswordPage — efetiva a redefinição de senha usando token do e-mail.
 *
 * Token vem na query string `?token=<jwt-ou-opaque>`. Se ausente/expirado,
 * UI mostra mensagem genérica orientando solicitar novo link.
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, KeyRound, ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
import { postResetPassword } from '@/lib/auth-api';
import { useToast } from '@/components/Toast';

const schema = z
  .object({
    senhaNova: z
      .string()
      .min(12, 'A nova senha deve ter ao menos 12 caracteres.')
      .max(256, 'Senha muito longa.'),
    confirmarSenhaNova: z.string().min(1, 'Confirme a nova senha.'),
  })
  .refine((v) => v.senhaNova === v.confirmarSenhaNova, {
    path: ['confirmarSenhaNova'],
    message: 'As senhas não conferem.',
  });

type Values = z.infer<typeof schema>;

export function ResetPasswordPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const [tokenMissing, setTokenMissing] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { senhaNova: '', confirmarSenhaNova: '' },
  });

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setTokenMissing(true);
    }
  }, [searchParams]);

  async function onSubmit(values: Values): Promise<void> {
    const token = searchParams.get('token') ?? '';
    if (!token) {
      setTokenMissing(true);
      return;
    }
    try {
      await postResetPassword({ token, senhaNova: values.senhaNova });
      showToast({
        variant: 'success',
        title: 'Senha redefinida',
        description: 'Faça login com sua nova senha.',
      });
      navigate('/login', { replace: true });
    } catch (err) {
      let title = 'Não foi possível redefinir a senha';
      let description =
        'Se o link expirou, solicite um novo na tela de recuperação.';
      if (err instanceof ApiError) {
        if (err.code === 'AUTH_INVALID_RESET_TOKEN') {
          title = 'Link inválido ou expirado';
        } else if (err.code === 'AUTH_WEAK_PASSWORD') {
          title = 'Senha fraca';
          description = err.detail ?? description;
        } else if (err.detail) {
          description = err.detail;
        }
      }
      showToast({ variant: 'destructive', title, description });
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <KeyRound aria-hidden="true" className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Redefinir senha
          </h1>
        </div>

        <Card>
          {tokenMissing ? (
            <CardContent className="space-y-4 pt-6">
              <p role="alert" className="text-sm text-destructive">
                Link de redefinição inválido ou ausente. Solicite um novo.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/auth/forgot-password">
                  <ArrowLeft aria-hidden="true" />
                  Solicitar novo link
                </Link>
              </Button>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-lg">Defina sua nova senha</CardTitle>
                <CardDescription>
                  Mínimo 12 caracteres. Passphrase é aceita.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  noValidate
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                  aria-label="Formulário de redefinição de senha"
                >
                  <div className="space-y-2">
                    <Label htmlFor="senhaNova">Nova senha</Label>
                    <Input
                      id="senhaNova"
                      type="password"
                      autoComplete="new-password"
                      aria-invalid={form.formState.errors.senhaNova ? true : false}
                      {...form.register('senhaNova')}
                    />
                    {form.formState.errors.senhaNova ? (
                      <p role="alert" className="text-sm text-destructive">
                        {form.formState.errors.senhaNova.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmarSenhaNova">Confirmar nova senha</Label>
                    <Input
                      id="confirmarSenhaNova"
                      type="password"
                      autoComplete="new-password"
                      aria-invalid={
                        form.formState.errors.confirmarSenhaNova ? true : false
                      }
                      {...form.register('confirmarSenhaNova')}
                    />
                    {form.formState.errors.confirmarSenhaNova ? (
                      <p role="alert" className="text-sm text-destructive">
                        {form.formState.errors.confirmarSenhaNova.message}
                      </p>
                    ) : null}
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={form.formState.isSubmitting}
                    aria-busy={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting ? (
                      <>
                        <Loader2 aria-hidden="true" className="animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      'Redefinir senha'
                    )}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
