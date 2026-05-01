/**
 * Validação fisiológica de sinais vitais.
 *
 * Faixas (RN-PEP-04 / RN-ATE-04):
 *   - PA sistólica  : 50..280 mmHg
 *   - PA diastólica : 30..200 mmHg
 *   - FC            : 30..220 bpm
 *   - FR            : 5..60   ipm
 *   - Temperatura   : 32..43 °C
 *   - SatO2         : 50..100 %
 *   - Glicemia      : 20..1000 mg/dL
 *   - Dor (EVA)     : 0..10
 *
 * Esses limites são MAIS restritos que o DTO (que aceita uma faixa
 * mecânica para detectar erros de digitação grosseiros). Aqui é a
 * faixa fisiologicamente plausível — fora dela, profissional precisa
 * confirmar.
 *
 * Em Fase 6, este validador será movido para `packages/domain` e
 * compartilhado com PEP. Trilha A entrega inline.
 */

export interface SinaisVitaisInput {
  paSistolica?: number;
  paDiastolica?: number;
  fc?: number;
  fr?: number;
  temperatura?: number;
  satO2?: number;
  glicemia?: number;
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
  dorEva: [0, 10],
};

export function validarSinaisVitais(
  input: SinaisVitaisInput,
): FaixaFora[] {
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
  // Coerência PA: sistólica deve ser > diastólica (CHECK ck_triagem_pa).
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
