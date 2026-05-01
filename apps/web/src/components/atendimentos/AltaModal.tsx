/**
 * AltaModal — encerra o atendimento.
 *
 * Campos:
 *  - tipoAlta (obrigatório).
 *  - cidPrincipal (opcional, recomendado).
 *  - cidsSecundarios (string CSV → array no submit).
 *  - resumo de alta (textarea).
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Loader2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Textarea,
} from '@/components/ui';
import { ApiError } from '@/lib/api-client';
import { altaAtendimento } from '@/lib/atendimentos-api';
import { useToast } from '@/components/Toast';
import type { TipoAlta } from '@/types/atendimentos';

const TIPOS_ALTA: { value: TipoAlta; label: string }[] = [
  { value: 'ALTA_MEDICA', label: 'Alta médica' },
  { value: 'ALTA_PEDIDO', label: 'Alta a pedido' },
  { value: 'TRANSFERENCIA', label: 'Transferência' },
  { value: 'EVASAO', label: 'Evasão' },
  { value: 'OBITO', label: 'Óbito' },
];

interface AltaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimentoUuid: string;
  onSuccess?: () => void;
}

export function AltaModal({
  open,
  onOpenChange,
  atendimentoUuid,
  onSuccess,
}: AltaModalProps): JSX.Element {
  const queryClient = useQueryClient();
  const { show: showToast } = useToast();
  const [tipoAlta, setTipoAlta] = useState<TipoAlta>('ALTA_MEDICA');
  const [cidPrincipal, setCidPrincipal] = useState('');
  const [cidsSecundarios, setCidsSecundarios] = useState('');
  const [resumo, setResumo] = useState('');

  useEffect(() => {
    if (!open) return;
    setTipoAlta('ALTA_MEDICA');
    setCidPrincipal('');
    setCidsSecundarios('');
    setResumo('');
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      altaAtendimento(atendimentoUuid, {
        tipoAlta,
        ...(cidPrincipal ? { cidPrincipal } : {}),
        ...(cidsSecundarios
          ? {
              cidsSecundarios: cidsSecundarios
                .split(',')
                .map((c) => c.trim())
                .filter(Boolean),
            }
          : {}),
        ...(resumo ? { resumo } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['atendimentos'] });
      void queryClient.invalidateQueries({ queryKey: ['leitos'] });
      void queryClient.invalidateQueries({ queryKey: ['mapa-leitos'] });
      showToast({
        variant: 'success',
        title: 'Alta concedida',
        description: '',
      });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError ? err.detail ?? err.message : 'Falha na alta.';
      showToast({ variant: 'destructive', title: 'Erro', description: msg });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conceder alta</DialogTitle>
          <DialogDescription>
            Encerra o atendimento. RN-ATE-07: itens de prescrição/exame não
            podem ser adicionados após `data_hora_saida`.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="tipoAlta">Tipo de alta *</Label>
            <Select
              id="tipoAlta"
              value={tipoAlta}
              onChange={(event) => setTipoAlta(event.target.value as TipoAlta)}
            >
              {TIPOS_ALTA.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="cidPrincipal">CID principal</Label>
              <Input
                id="cidPrincipal"
                value={cidPrincipal}
                onChange={(event) => setCidPrincipal(event.target.value)}
                placeholder="I10"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cidsSecundarios">CIDs secundários</Label>
              <Input
                id="cidsSecundarios"
                value={cidsSecundarios}
                onChange={(event) => setCidsSecundarios(event.target.value)}
                placeholder="E11.9, I25 (separados por vírgula)"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="resumo">Resumo de alta</Label>
            <Textarea
              id="resumo"
              rows={4}
              value={resumo}
              onChange={(event) => setResumo(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending}
            aria-busy={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <LogOut aria-hidden="true" />
            )}
            Conceder alta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
