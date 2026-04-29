/**
 * `@RequireMfa()` — marca uma rota como exigindo que o usuário tenha
 * passado pelo segundo fator MFA na sessão atual.
 *
 * O JWT emitido pela Trilha A deve conter a claim `mfa: true` quando o
 * usuário concluiu `/auth/mfa/verify` no fluxo de login. Um `MfaGuard`
 * (registrado globalmente ou no controller) lê esta metadata e:
 *
 *   - se a rota tem @RequireMfa() e `request.user.mfa !== true`,
 *     responde 403 com `error_code = "MFA_REQUIRED"`.
 *
 * Uso:
 *   @RequireMfa()
 *   @Get('/operacoes-sensiveis')
 *   sensiveis() { ... }
 *
 * Quando NÃO usar:
 *   - rotas idempotentes/leitura sem PHI;
 *   - portais externos (paciente/médico) usam fluxos próprios.
 */
import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const REQUIRE_MFA_KEY = 'require-mfa';

export const RequireMfa = (): CustomDecorator<typeof REQUIRE_MFA_KEY> =>
  SetMetadata(REQUIRE_MFA_KEY, true);
