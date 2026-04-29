/**
 * ChangePasswordPage — troca da senha do usuário autenticado.
 *
 * Validações cliente (RN-SEG-01):
 *  - Mínimo 12 caracteres (NIST 800-63B; passphrase aceita).
 *  - Nova senha != confirmação ⇒ erro local.
 *  - Backend reaplica regras (incluindo zxcvbn/blacklist).
 */
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
import { postChangePassword } from '@/lib/auth-api';
import { useToast } from '@/components/Toast';

const schema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual.'),
    senhaNova: z
      .string()
      .min(12, 'A nova senha deve ter ao menos 12 caracteres.')
      .max(256, 'Senha muito longa.'),
    confirmarSenhaNova: z.string().min(1, 'Confirme a nova senha.'),
  })
  .refine((v) => v.senhaNova === v.confirmarSenhaNova, {
    path: ['confirmarSenhaNova'],
    message: 'As senhas não conferem.',
  })
  .refine((v) => v.senhaNova !== v.senhaAtual, {
    path: ['senhaNova'],
    message: 'A nova senha não pode ser igual à atual.',
  });

type Values = z.infer<typeof schema>;

export function ChangePasswordPage(): JSX.Element {
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { senhaAtual: '', senhaNova: '', confirmarSenhaNova: '' },
  });

  async function onSubmit(values: Values): Promise<void> {
    try {
      await postChangePassword({
        senhaAtual: values.senhaAtual,
        senhaNova: values.senhaNova,
      });
      showToast({
        variant: 'success',
        title: 'Senha alterada',
        description: 'Sua senha foi atualizada com sucesso.',
      });
      navigate('/', { replace: true });
    } catch (err) {
      const isApi = err instanceof ApiError;
      let title = 'Não foi possível alterar a senha';
      let description = 'Tente novamente em alguns instantes.';
      if (isApi) {
        if (err.code === 'AUTH_CURRENT_PASSWORD_MISMATCH') {
          title = 'Senha atual incorreta';
          description = 'Verifique a senha atual e tente novamente.';
        } else if (err.code === 'AUTH_WEAK_PASSWORD') {
          title = 'Senha fraca';
          description =
            err.detail ?? 'Escolha uma senha mais forte (passphrase é aceita).';
        } else if (err.code === 'AUTH_PASSWORD_REUSE') {
          title = 'Reuso de senha';
          description = 'Escolha uma senha que não esteja no histórico recente.';
        } else if (err.detail) {
          description = err.detail;
        }
      }
      showToast({ variant: 'destructive', title, description });
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <KeyRound aria-hidden="true" className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trocar senha</h1>
          <p className="text-sm text-muted-foreground">
            Use uma senha forte (mínimo 12 caracteres). Passphrase é aceita.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atualizar credencial</CardTitle>
          <CardDescription>
            Após a alteração, suas demais sessões podem ser revogadas conforme
            política do hospital.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            aria-label="Formulário de troca de senha"
          >
            <div className="space-y-2">
              <Label htmlFor="senhaAtual">Senha atual</Label>
              <Input
                id="senhaAtual"
                type="password"
                autoComplete="current-password"
                aria-invalid={form.formState.errors.senhaAtual ? true : false}
                {...form.register('senhaAtual')}
              />
              {form.formState.errors.senhaAtual ? (
                <p role="alert" className="text-sm text-destructive">
                  {form.formState.errors.senhaAtual.message}
                </p>
              ) : null}
            </div>

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
                'Alterar senha'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
