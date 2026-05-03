/**
 * NovoVisitantePage — formulário de cadastro (CPF plain → backend faz hash).
 *
 * Privacidade: CPF é enviado em texto somente nesta requisição (TLS) e o
 * backend armazena apenas hash. Não logamos nem persistimos CPF localmente.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Save, Users } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { createVisitante } from '@/lib/visitantes-api';
import { useToast } from '@/components/Toast';
import type { CreateVisitanteInput } from '@/types/visitantes';

function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function NovoVisitantePage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [documentoFotoUrl, setDocumentoFotoUrl] = useState('');

  const createM = useMutation({
    mutationFn: (input: CreateVisitanteInput) => createVisitante(input),
    onSuccess: (v) => {
      showToast({
        variant: 'success',
        title: 'Visitante cadastrado',
        description: '',
      });
      void queryClient.invalidateQueries({ queryKey: ['visitantes', 'list'] });
      navigate(`/visitantes/${v.uuid}`);
    },
    onError: (e) => {
      const detail =
        e instanceof ApiError ? e.detail ?? e.title ?? e.message : 'Erro.';
      showToast({
        variant: 'destructive',
        title: 'Falha ao cadastrar visitante',
        description: detail,
      });
    },
  });

  const cpfDigits = cpf.replace(/\D/g, '');
  const valid = nome.trim().length >= 3 && cpfDigits.length === 11;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!valid) return;
    createM.mutate({
      nome: nome.trim(),
      cpf: cpfDigits,
      ...(documentoFotoUrl ? { documentoFotoUrl: documentoFotoUrl.trim() } : {}),
    });
  }

  return (
    <section className="space-y-4" aria-label="Novo visitante">
      <header className="space-y-1">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="h-3 w-3" />
          Voltar
        </button>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Users aria-hidden="true" className="h-6 w-6" />
          Novo visitante
        </h1>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Identificação</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="vis-nome">Nome completo *</Label>
                <Input
                  id="vis-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                  minLength={3}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vis-cpf">CPF *</Label>
                <Input
                  id="vis-cpf"
                  value={cpf}
                  onChange={(e) => setCpf(maskCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  required
                  autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground">
                  Armazenado apenas com hash; só os 4 últimos dígitos ficam
                  visíveis depois.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="vis-foto">URL da foto do documento</Label>
                <Input
                  id="vis-foto"
                  value={documentoFotoUrl}
                  onChange={(e) => setDocumentoFotoUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!valid || createM.isPending}>
                {createM.isPending ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Save aria-hidden="true" />
                )}
                Cadastrar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

NovoVisitantePage.displayName = 'NovoVisitantePage';
