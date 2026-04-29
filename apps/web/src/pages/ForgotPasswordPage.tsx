/**
 * ForgotPasswordPage — solicitação de e-mail de redefinição de senha.
 *
 * IMPORTANTE (RN-LGP/RN-SEG): a resposta exibida ao usuário é SEMPRE
 * genérica — nunca confirmar/revelar se o e-mail está cadastrado.
 * Tanto sucesso quanto 404 do backend resultam na mesma mensagem.
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Mail, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
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
import { postForgotPassword } from '@/lib/auth-api';

const schema = z.object({
  tenantCode: z.string().min(1, 'Informe o tenant.'),
  email: z.string().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
});

type Values = z.infer<typeof schema>;

const DEFAULT_TENANT_CODE = import.meta.env.DEV ? 'dev' : '';

export function ForgotPasswordPage(): JSX.Element {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { tenantCode: DEFAULT_TENANT_CODE, email: '' },
  });

  async function onSubmit(values: Values): Promise<void> {
    try {
      await postForgotPassword({
        tenantCode: values.tenantCode.trim(),
        email: values.email.trim(),
      });
    } catch {
      // Intencionalmente silenciamos: a UX deve ser idêntica para conta
      // existente ou não. O backend já loga internamente.
    } finally {
      setSubmitted(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mail aria-hidden="true" className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Recuperar acesso
          </h1>
        </div>

        <Card>
          {submitted ? (
            <CardContent className="space-y-4 pt-6">
              <p role="status" className="text-sm text-muted-foreground">
                Se o e-mail informado estiver cadastrado, enviaremos um link de
                redefinição em breve. Cheque sua caixa de entrada e a pasta de
                spam.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">
                  <ArrowLeft aria-hidden="true" />
                  Voltar ao login
                </Link>
              </Button>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-lg">Esqueci minha senha</CardTitle>
                <CardDescription>
                  Informe o tenant e o e-mail cadastrados. Enviaremos um link de
                  redefinição.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  noValidate
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                  aria-label="Formulário de recuperação de senha"
                >
                  <div className="space-y-2">
                    <Label htmlFor="tenantCode">Código do tenant</Label>
                    <Input
                      id="tenantCode"
                      type="text"
                      autoComplete="organization"
                      aria-invalid={form.formState.errors.tenantCode ? true : false}
                      {...form.register('tenantCode')}
                    />
                    {form.formState.errors.tenantCode ? (
                      <p role="alert" className="text-sm text-destructive">
                        {form.formState.errors.tenantCode.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="username"
                      aria-invalid={form.formState.errors.email ? true : false}
                      {...form.register('email')}
                    />
                    {form.formState.errors.email ? (
                      <p role="alert" className="text-sm text-destructive">
                        {form.formState.errors.email.message}
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
                        Enviando...
                      </>
                    ) : (
                      'Enviar link de redefinição'
                    )}
                  </Button>

                  <Link
                    to="/login"
                    className="block text-center text-xs font-medium text-primary hover:underline"
                  >
                    Voltar ao login
                  </Link>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
