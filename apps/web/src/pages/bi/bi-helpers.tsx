/**
 * Helpers compartilhados das páginas BI:
 *  - `Tabs` simples (mesmo padrão visual usado em CcihCasoDetalhePage).
 *  - `formatPct` / `formatBR` / `formatMoney` / `formatNumber`.
 *  - `extractRows` — extrai `dados[]` ou cai para array bruto.
 *  - `useExport` — hook para baixar via `/v1/bi/export` com toast feedback.
 */
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';
import {
  defaultExportFilename,
  downloadBlob,
  exportar,
} from '@/lib/bi-api';
import type { BiView, ExportFormato, ExportInput } from '@/types/bi';

/* ---------- formatters ---------- */

export function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('pt-BR');
}

export function formatPct(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return `${n.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}%`;
}

export function formatMoney(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  // Aceita 'YYYY-MM-DD', 'YYYY-MM' ou ISO completo.
  if (/^\d{4}-\d{2}-\d{2}$/u.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  if (/^\d{4}-\d{2}$/u.test(iso)) {
    const [y, m] = iso.split('-');
    return `${m}/${y}`;
  }
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString('pt-BR');
}

/* ---------- response shape helpers ---------- */

export function extractRows<T = Record<string, unknown>>(
  response: unknown,
): T[] {
  if (response === null || response === undefined) return [];
  if (Array.isArray(response)) return response as T[];
  if (typeof response === 'object') {
    const obj = response as Record<string, unknown>;
    if (Array.isArray(obj['dados'])) return obj['dados'] as T[];
    if (Array.isArray(obj['data'])) return obj['data'] as T[];
  }
  return [];
}

/* ---------- Tabs ---------- */

export interface TabDescriptor<K extends string> {
  key: K;
  label: string;
}

export interface TabsProps<K extends string> {
  tabs: TabDescriptor<K>[];
  active: K;
  onChange: (k: K) => void;
  ariaLabel?: string;
}

export function Tabs<K extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: TabsProps<K>): JSX.Element {
  return (
    <nav
      role="tablist"
      aria-label={ariaLabel ?? 'Seções'}
      className="flex flex-wrap gap-1 border-b"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          type="button"
          aria-selected={active === t.key}
          id={`tab-${t.key}`}
          onClick={() => onChange(t.key)}
          className={cn(
            'border-b-2 px-3 py-2 text-sm transition-colors',
            active === t.key
              ? 'border-foreground font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

/* ---------- ExportButton ---------- */

export interface ExportButtonProps {
  view: BiView;
  formato?: ExportFormato;
  body: ExportInput;
  label?: string;
}

export function ExportButton({
  view,
  formato = 'csv',
  body,
  label,
}: ExportButtonProps): JSX.Element {
  const { show: showToast } = useToast();
  const [pending, setPending] = useState(false);

  async function handleClick(): Promise<void> {
    setPending(true);
    try {
      const blob = await exportar(view, formato, body);
      downloadBlob(blob, defaultExportFilename(view, formato));
      showToast({
        title: 'Exportação concluída',
        description: `Arquivo ${formato.toUpperCase()} baixado.`,
        durationMs: 2500,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Erro desconhecido';
      showToast({
        title: 'Falha ao exportar',
        description: detail,
        durationMs: 4500,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        void handleClick();
      }}
    >
      <Download aria-hidden="true" />
      {label ?? `Exportar ${formato.toUpperCase()}`}
    </Button>
  );
}
