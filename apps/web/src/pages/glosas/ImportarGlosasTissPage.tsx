/**
 * ImportarGlosasTissPage — importação de glosas a partir de retorno TISS.
 *
 * Por enquanto aceita JSON colado (formato `ImportarGlosasTissInput`).
 * O upload de XML real virá na Fase 13 (parser TISS retorno → JSON).
 */
import { useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Upload } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { importarGlosasTiss } from '@/lib/glosas-api';
import { useToast } from '@/components/Toast';
import type { ImportarGlosasTissInput } from '@/types/glosas';

interface ParsedResult {
  ok: boolean;
  payload: ImportarGlosasTissInput | null;
  error: string | null;
}

const TEMPLATE = JSON.stringify(
  {
    glosas: [
      {
        contaNumero: '202604000123',
        guiaTissNumeroOperadora: 'OP-99887',
        motivo: 'Procedimento sem autorização prévia',
        codigoGlosaTiss: '1909',
        valorGlosado: 350.0,
        dataGlosa: '2026-04-25',
        prazoRecurso: '2026-05-25',
      },
    ],
  } satisfies ImportarGlosasTissInput,
  null,
  2,
);

export function ImportarGlosasTissPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();

  const [json, setJson] = useState<string>(TEMPLATE);

  const parsed: ParsedResult = useMemo(() => {
    try {
      const obj = JSON.parse(json) as unknown;
      if (
        obj &&
        typeof obj === 'object' &&
        'glosas' in (obj as object) &&
        Array.isArray((obj as { glosas: unknown }).glosas)
      ) {
        return { ok: true, payload: obj as ImportarGlosasTissInput, error: null };
      }
      return {
        ok: false,
        payload: null,
        error: 'Estrutura inválida — esperado { glosas: [...] }.',
      };
    } catch (e) {
      return {
        ok: false,
        payload: null,
        error: e instanceof Error ? e.message : 'JSON inválido.',
      };
    }
  }, [json]);

  const importarM = useMutation({
    mutationFn: (input: ImportarGlosasTissInput) => importarGlosasTiss(input),
    onSuccess: (res) => {
      showToast({
        variant: 'success',
        title: 'Importação concluída',
        description: `${res.importadas}/${res.total} importadas · ${res.comAlerta} com alerta.`,
      });
      void queryClient.invalidateQueries({ queryKey: ['glosas'] });
      navigate('/glosas');
    },
    onError: (err) => {
      const detail =
        err instanceof ApiError
          ? err.detail ?? err.title ?? err.message
          : err instanceof Error
            ? err.message
            : 'Erro.';
      showToast({
        variant: 'destructive',
        title: 'Falha ao importar',
        description: detail,
      });
    },
  });

  function handleSubmit(): void {
    if (!parsed.ok || !parsed.payload) return;
    importarM.mutate(parsed.payload);
  }

  const previewCount = parsed.payload?.glosas?.length ?? 0;

  return (
    <section className="space-y-4" aria-label="Importar glosas TISS">
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
          <Upload aria-hidden="true" className="h-6 w-6" />
          Importar glosas (TISS)
        </h1>
        <p className="text-sm text-muted-foreground">
          Cole o JSON com a lista de glosas. Upload de XML real chega na Fase 13.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">JSON de retorno</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            id="import-json"
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={14}
            className="font-mono text-xs"
            aria-label="JSON de glosas"
          />
          {parsed.error ? (
            <p
              role="alert"
              className="mt-2 text-xs text-destructive"
              data-testid="import-json-error"
            >
              {parsed.error}
            </p>
          ) : (
            <p className="mt-2 text-xs text-emerald-700">
              JSON válido · {previewCount} glosa(s) prontas para importar.
            </p>
          )}
        </CardContent>
      </Card>

      {parsed.ok && parsed.payload && parsed.payload.glosas.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pré-visualização</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>Guia operadora</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Prazo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.payload.glosas.map((g, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-xs">
                      {g.contaNumero ?? g.contaUuid ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {g.guiaTissNumeroOperadora ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {g.codigoGlosaTiss}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs">
                      {g.motivo}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {Number(g.valorGlosado).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </TableCell>
                    <TableCell className="text-xs">{g.dataGlosa}</TableCell>
                    <TableCell className="text-xs">{g.prazoRecurso}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <footer className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate('/glosas')}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!parsed.ok || importarM.isPending || previewCount === 0}
        >
          {importarM.isPending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Upload aria-hidden="true" />
          )}
          Importar
        </Button>
      </footer>
    </section>
  );
}

ImportarGlosasTissPage.displayName = 'ImportarGlosasTissPage';
