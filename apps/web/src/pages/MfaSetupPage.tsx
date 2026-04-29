/**
 * MfaSetupPage — habilitar TOTP (segundo fator).
 *
 * Fluxo:
 *  1. Mount → POST /auth/mfa/enable → backend retorna `{ qrCodeDataUrl, secret }`.
 *  2. Usuário escaneia o QR no Google Authenticator/Authy/1Password.
 *  3. Digita os 6 dígitos → POST /auth/mfa/verify → backend retorna `recoveryCodes`.
 *  4. Recovery codes são exibidos UMA ÚNICA vez (com download .txt).
 *
 * RN-SEG-02: MFA é obrigatório para ADMIN, MEDICO, FARMACEUTICO, AUDITOR.
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, ShieldCheck, Download, AlertTriangle } from 'lucide-react';
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
  Skeleton,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { postMfaEnable, postMfaVerify } from '@/lib/auth-api';
import { useToast } from '@/components/Toast';
import type { MfaEnableResponse } from '@/types/auth';

const verifySchema = z.object({
  code: z.string().regex(/^\d{6}$/u, 'Informe os 6 dígitos.'),
});

type VerifyValues = z.infer<typeof verifySchema>;

type Stage = 'loading' | 'scan' | 'success' | 'error';

export function MfaSetupPage(): JSX.Element {
  const navigate = useNavigate();
  const { show: showToast } = useToast();
  const [stage, setStage] = useState<Stage>('loading');
  const [enableData, setEnableData] = useState<MfaEnableResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [savedAcknowledged, setSavedAcknowledged] = useState(false);

  const verifyForm = useForm<VerifyValues>({
    resolver: zodResolver(verifySchema),
    defaultValues: { code: '' },
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await postMfaEnable();
        if (cancelled) return;
        setEnableData(data);
        setStage('scan');
      } catch (err) {
        if (cancelled) return;
        setStage('error');
        const detail =
          err instanceof ApiError
            ? (err.detail ?? err.title ?? 'Erro ao iniciar MFA.')
            : 'Erro ao iniciar MFA.';
        showToast({
          variant: 'destructive',
          title: 'Falha ao habilitar MFA',
          description: detail,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  async function onSubmitVerify(values: VerifyValues): Promise<void> {
    try {
      const result = await postMfaVerify(values.code);
      setRecoveryCodes(result.recoveryCodes);
      setStage('success');
      showToast({
        variant: 'success',
        title: 'MFA habilitado',
        description:
          'Salve os códigos de recuperação em local seguro — eles serão exibidos apenas uma vez.',
      });
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? (err.detail ?? 'Código inválido.')
          : 'Código inválido.';
      showToast({
        variant: 'destructive',
        title: 'Código não aceito',
        description: detail,
      });
      verifyForm.reset({ code: '' });
    }
  }

  function handleDownloadRecoveryCodes(): void {
    const content = [
      '# HMS-BR — Códigos de recuperação MFA',
      `# Gerado em ${new Date().toISOString()}`,
      '# Cada código pode ser usado UMA ÚNICA vez como segundo fator.',
      '# Guarde em local seguro (gerenciador de senhas, cofre).',
      '',
      ...recoveryCodes,
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hms-br-recovery-codes-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleAcknowledge(): void {
    setSavedAcknowledged(true);
    navigate('/', { replace: true });
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck aria-hidden="true" className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Habilitar MFA (Autenticação de dois fatores)
          </h1>
          <p className="text-sm text-muted-foreground">
            Adicione uma camada extra de segurança usando um app autenticador.
          </p>
        </div>
      </div>

      {stage === 'loading' ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Skeleton className="mx-auto h-48 w-48" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ) : null}

      {stage === 'error' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle aria-hidden="true" className="h-4 w-4 text-destructive" />
              Não foi possível iniciar o MFA
            </CardTitle>
            <CardDescription>
              Tente novamente em alguns instantes ou contate o administrador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate(0)}>Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : null}

      {stage === 'scan' && enableData ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">1. Escaneie o QR code</CardTitle>
            <CardDescription>
              Abra o Google Authenticator, Authy, 1Password ou outro app TOTP e
              escaneie a imagem abaixo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center gap-2">
              <img
                src={enableData.qrCodeDataUrl}
                alt="QR code para configurar autenticador TOTP"
                className="h-48 w-48 rounded-md border bg-white p-2"
              />
              <p className="text-xs text-muted-foreground">
                Não consegue escanear? Use a chave manual:
              </p>
              <code className="select-all rounded bg-muted px-2 py-1 text-xs font-mono">
                {enableData.secret}
              </code>
            </div>

            <form
              noValidate
              onSubmit={verifyForm.handleSubmit(onSubmitVerify)}
              className="space-y-4"
              aria-label="Formulário de verificação MFA"
            >
              <div className="space-y-2">
                <Label htmlFor="code">2. Confirme o código gerado</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  maxLength={6}
                  aria-invalid={verifyForm.formState.errors.code ? true : false}
                  {...verifyForm.register('code')}
                />
                {verifyForm.formState.errors.code ? (
                  <p role="alert" className="text-sm text-destructive">
                    {verifyForm.formState.errors.code.message}
                  </p>
                ) : null}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={verifyForm.formState.isSubmitting}
                aria-busy={verifyForm.formState.isSubmitting}
              >
                {verifyForm.formState.isSubmitting ? (
                  <>
                    <Loader2 aria-hidden="true" className="animate-spin" />
                    Verificando...
                  </>
                ) : (
                  'Habilitar MFA'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {stage === 'success' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              MFA habilitado — guarde seus códigos de recuperação
            </CardTitle>
            <CardDescription>
              Estes códigos só são mostrados <strong>uma vez</strong>. Use-os
              caso perca acesso ao app autenticador. Cada código vale apenas
              uma utilização.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-4 font-mono text-sm sm:grid-cols-3">
              {recoveryCodes.map((code) => (
                <div
                  key={code}
                  className="select-all rounded bg-background px-2 py-1 text-center"
                >
                  {code}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="sm:flex-1"
                onClick={handleDownloadRecoveryCodes}
              >
                <Download aria-hidden="true" />
                Baixar como .txt
              </Button>
              <Button
                type="button"
                className="sm:flex-1"
                disabled={savedAcknowledged}
                onClick={handleAcknowledge}
              >
                Já salvei, continuar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
