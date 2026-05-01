/**
 * DateRangePicker — wrapper simples sobre dois `<input type="date">`.
 *
 * Sem dependência externa (shadcn `<Calendar>` ainda não instalado).
 * Usa formato ISO `YYYY-MM-DD` para start/end. Strings vazias = sem
 * filtro naquele lado.
 */
import { Label } from '@/components/ui';

interface DateRangePickerProps {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  startLabel?: string;
  endLabel?: string;
}

export function DateRangePicker({
  start,
  end,
  onChange,
  startLabel = 'De',
  endLabel = 'Até',
}: DateRangePickerProps): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-xs">
        <span className="sr-only">{startLabel}</span>
        <Label htmlFor="dr-start" className="text-[11px] text-muted-foreground">
          {startLabel}
        </Label>
        <input
          id="dr-start"
          type="date"
          value={start}
          onChange={(e) => onChange(e.target.value, end)}
          className="h-8 rounded-md border bg-background px-2 text-xs"
          aria-label={startLabel}
        />
      </label>
      <label className="flex items-center gap-1 text-xs">
        <Label htmlFor="dr-end" className="text-[11px] text-muted-foreground">
          {endLabel}
        </Label>
        <input
          id="dr-end"
          type="date"
          value={end}
          onChange={(e) => onChange(start, e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-xs"
          aria-label={endLabel}
        />
      </label>
    </div>
  );
}
