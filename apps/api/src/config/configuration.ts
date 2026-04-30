/**
 * Configuração tipada e validada de runtime, lida de `process.env`.
 *
 * - Validação via Zod garante que a API não sobe com env mal formado
 *   (DATABASE_URL inválido, segredo JWT vazio, etc.).
 * - `loadConfig()` deve ser chamado uma única vez em `main.ts`/`AppModule`.
 * - `Config` é exportado para injeção via `ConfigService<Config, true>`.
 */
import { z } from 'zod';

const numericString = (defaultValue?: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') {
        return defaultValue;
      }
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        throw new Error(`Expected numeric value, received "${value}"`);
      }
      return parsed;
    });

export const ConfigSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  TZ: z.string().default('America/Sao_Paulo'),

  // API
  API_PORT: numericString(3000).pipe(z.number().int().positive()),
  CORS_ORIGINS: z.string().default(''),

  // Persistência
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // JWT (lidos aqui, mas usados na Fase 2)
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_SECONDS: numericString(900).pipe(z.number().int().positive()),
  JWT_REFRESH_TTL_SECONDS: numericString(604800).pipe(
    z.number().int().positive(),
  ),

  // S3 / MinIO
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),

  // SMTP
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: numericString(587).pipe(z.number().int().positive()),
  SMTP_FROM: z.string().min(1),

  // AI Service (Fase 11)
  AI_SERVICE_URL: z.string().url(),

  // Multi-tenant
  TENANT_DEFAULT: z.string().default('dev'),

  // pgcrypto — chave simétrica usada por `pgp_sym_encrypt` para colunas
  // sensíveis (CPF). Em produção a chave deve vir de um KMS (RN-LGP-07);
  // este env é só a fallback dev/CI. Nunca reaproveite as JWT/MFA.
  PGCRYPTO_KEY: z.string().min(16),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

/**
 * Helper para uso pelo NestJS ConfigModule (`load: [configFactory]`).
 * Mantém o objeto plano para que `ConfigService.get('DATABASE_URL')` funcione.
 */
export function configFactory(): Config {
  return loadConfig();
}
