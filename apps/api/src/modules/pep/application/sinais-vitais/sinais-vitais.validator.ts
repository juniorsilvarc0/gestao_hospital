/**
 * Validação fisiológica de sinais vitais para o PEP (RN-PEP-04).
 *
 * Faixas (estritas — fora delas exige `valorConfirmado=true` +
 * `justificativa` no DTO):
 *   - PA sistólica  : 50..280 mmHg
 *   - PA diastólica : 30..200 mmHg
 *   - FC            : 30..220 bpm
 *   - FR            : 5..60 ipm
 *   - Temperatura   : 32..43 °C
 *   - SatO2         : 50..100 %
 *   - Glicemia      : 20..1000 mg/dL
 *   - Peso          : 0.3..400 kg
 *   - Altura        : 25..230 cm
 *   - EVA           : 0..10
 *
 * Observação: a Fase 5 tem um validator equivalente em
 * `apps/api/src/modules/atendimentos/application/sinais-vitais.validator.ts`.
 * Mantemos cópia local para não criar dependência cruzada entre módulos
 * (cada bounded context é dono da sua validação). Em
 * `packages/domain` (Fase 13) os dois convergem.
 */

export interface SinaisVitaisInput {
  paSistolica?: number;
  paDiastolica?: number;
  fc?: number;
  fr?: number;
  temperatura?: number;
  satO2?: number;
  glicemia?: number;
  pesoKg?: number;
  alturaCm?: number;
  dorEva?: number;
}

export interface FaixaFora {
  campo: string;
  valor: number;
  faixa: [number, number];
}

const FAIXAS: Record<keyof SinaisVitaisInput, [number, number]> = {
  paSistolica: [50, 280],
  paDiastolica: [30, 200],
  fc: [30, 220],
  fr: [5, 60],
  temperatura: [32, 43],
  satO2: [50, 100],
  glicemia: [20, 1000],
  pesoKg: [0.3, 400],
  alturaCm: [25, 230],
  dorEva: [0, 10],
};

export function validarSinaisVitaisPep(input: SinaisVitaisInput): FaixaFora[] {
  const fora: FaixaFora[] = [];
  for (const [campo, faixa] of Object.entries(FAIXAS) as Array<
    [keyof SinaisVitaisInput, [number, number]]
  >) {
    const valor = input[campo];
    if (valor === undefined || valor === null) continue;
    const [min, max] = faixa;
    if (valor < min || valor > max) {
      fora.push({ campo, valor, faixa });
    }
  }
  if (
    input.paSistolica !== undefined &&
    input.paDiastolica !== undefined &&
    input.paSistolica <= input.paDiastolica
  ) {
    fora.push({
      campo: 'paSistolica_vs_paDiastolica',
      valor: input.paSistolica,
      faixa: [input.paDiastolica + 1, 280],
    });
  }
  return fora;
}
