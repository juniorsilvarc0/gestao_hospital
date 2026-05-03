/**
 * `POST /v1/portal/paciente/consentimentos` — aceite/recusa de termo.
 *
 * O paciente é resolvido do contexto. `ip_origem` e `user_agent` são
 * extraídos da `Request` no controller — não vêm do body.
 */
import { IsBoolean, IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { CONSENTIMENTO_FINALIDADES } from '../domain/consentimento';

export class RegistrarConsentimentoDto {
  @IsEnum(CONSENTIMENTO_FINALIDADES)
  finalidade!: (typeof CONSENTIMENTO_FINALIDADES)[number];

  /**
   * Versão do termo aceito. Padrão `vMAJOR.MINOR[.PATCH]` ou
   * `MAJOR.MINOR[.PATCH]` — validação leve aqui (regex) e dura no
   * domínio.
   */
  @IsString()
  @Matches(/^v?\d+(\.\d+){1,2}$/, {
    message: 'versaoTermo deve seguir vMAJOR.MINOR[.PATCH] (ex.: v1.2.0).',
  })
  versaoTermo!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(32_000)
  textoApresentado!: string;

  @IsBoolean()
  aceito!: boolean;
}
