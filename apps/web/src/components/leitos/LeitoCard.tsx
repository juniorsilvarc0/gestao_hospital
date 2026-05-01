/**
 * LeitoCard — card do mapa de leitos.
 *
 * - Exibe código, tipo de acomodação, status (cor) e — quando OCUPADO —
 *   iniciais do paciente e dias internado.
 * - Tooltip nativo com paciente nome, idade, médico, alergias, dias.
 * - Click expõe o leito ao callback (abre Sheet de ações).
 */
import { Bed } from 'lucide-react';
import type { Leito } from '@/types/leitos';
import { LEITO_STATUS_PALETTE } from '@/types/leitos';
import { cn } from '@/lib/utils';

interface LeitoCardProps {
  leito: Leito;
  onClick?: (leito: Leito) => void;
}

function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (24 * 3600_000)));
}

function iniciais(nome: string | null | undefined): string {
  if (!nome) return '';
  return nome
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function LeitoCard({ leito, onClick }: LeitoCardProps): JSX.Element {
  const palette = LEITO_STATUS_PALETTE[leito.status];
  const ocup = leito.ocupacao ?? null;
  const dias = ocup?.diasInternado ?? diasDesde(ocup?.iniciadoEm);
  const tooltipParts: string[] = [];
  if (ocup?.pacienteNome) tooltipParts.push(`Paciente: ${ocup.pacienteNome}`);
  if (ocup?.pacienteIdade !== null && ocup?.pacienteIdade !== undefined) {
    tooltipParts.push(`Idade: ${ocup.pacienteIdade}`);
  }
  if (ocup?.prestadorNome) tooltipParts.push(`Médico: ${ocup.prestadorNome}`);
  if (ocup?.alergias && ocup.alergias.length > 0) {
    tooltipParts.push(`Alergias: ${ocup.alergias.join(', ')}`);
  }
  if (dias !== null) tooltipParts.push(`${dias}d internado`);
  const tooltip = tooltipParts.join(' · ');

  return (
    <button
      type="button"
      onClick={() => onClick?.(leito)}
      title={tooltip || undefined}
      aria-label={`Leito ${leito.codigo} — ${palette.label}`}
      data-testid={`leito-card-${leito.uuid}`}
      data-status={leito.status}
      className={cn(
        'flex h-28 w-full flex-col items-stretch justify-between rounded-md border-2 p-2 text-left text-xs transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2',
        palette.card,
        palette.border,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 font-bold uppercase">
          <Bed aria-hidden="true" className="h-3 w-3" />
          {leito.codigo}
        </span>
        <span aria-hidden="true">{palette.emoji}</span>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {leito.tipoAcomodacao}
      </div>
      <div className="flex items-end justify-between">
        <span className="font-medium">
          {leito.status === 'OCUPADO' && ocup
            ? iniciais(ocup.pacienteNome ?? '')
            : palette.label}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {leito.status === 'OCUPADO' && dias !== null ? `${dias}d` : ''}
        </span>
      </div>
    </button>
  );
}
