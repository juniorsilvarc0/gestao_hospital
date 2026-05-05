/**
 * Sparkline — gráfico de linha minimalista em SVG inline.
 *
 * Renderiza uma `polyline` normalizada para um viewBox 100x30. Quando os
 * valores são todos iguais (ou só há um ponto), desenha uma linha
 * horizontal no centro. Sem dependências externas (Recharts/Chart.js
 * ainda não estão no projeto).
 *
 * Uso típico:
 *   <Sparkline data={[12, 18, 15, 22, 19, 28]} color="#0ea5e9" />
 */
import { cn } from '@/lib/utils';

export interface SparklineProps {
  data: number[];
  color?: string;
  className?: string;
  ariaLabel?: string;
  /** Render fill abaixo da linha (efeito área). */
  filled?: boolean;
}

export function Sparkline({
  data,
  color = '#0ea5e9',
  className,
  ariaLabel,
  filled = false,
}: SparklineProps): JSX.Element {
  const W = 100;
  const H = 30;

  if (!data || data.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={cn('h-8 w-full', className)}
        role="img"
        aria-label={ariaLabel ?? 'Sem dados'}
      >
        <line
          x1="0"
          y1={H / 2}
          x2={W}
          y2={H / 2}
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeDasharray="2 2"
        />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? W / (data.length - 1) : 0;

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const areaPath = filled
    ? `M0,${H} L${points.join(' L')} L${W},${H} Z`
    : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn('h-8 w-full', className)}
      role="img"
      aria-label={ariaLabel ?? `série de ${data.length} pontos`}
    >
      {areaPath ? (
        <path d={areaPath} fill={color} fillOpacity="0.15" />
      ) : null}
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
    </svg>
  );
}

Sparkline.displayName = 'Sparkline';
