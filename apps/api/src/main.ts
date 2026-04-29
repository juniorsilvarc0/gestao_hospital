/**
 * Bootstrap NestJS.
 *
 * Sequência:
 *   1. Carrega/valida configuração via Zod (falha cedo se env mal formado).
 *   2. Cria app com `bufferLogs` para que o pino assuma a partir do start.
 *   3. Helmet + CORS dinâmico (origins por env).
 *   4. ValidationPipe global (whitelist + transform + forbid extras).
 *   5. Filter RFC 7807 global.
 *   6. Swagger em `/api/docs` (não publicar em produção sem auth — TODO Fase 2).
 *   7. Listen em 0.0.0.0:API_PORT.
 */
import 'reflect-metadata';

import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { HttpExceptionToProblemDetails } from './common/filters/http-exception.filter';
import { loadConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  // Falha cedo se .env estiver inválido.
  const config = loadConfig();

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    cors: false,
  });
  app.useLogger(app.get(Logger));

  app.use(
    helmet({
      // Swagger UI e seu CSS/JS vêm do mesmo host em dev — sem CORP rígido
      // em dev. Em produção essa flag é ajustada via reverse proxy.
      crossOriginResourcePolicy: false,
    }),
  );

  const corsOrigins = config.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Tenant-Id',
      'X-Request-ID',
      'X-Correlation-ID',
      'Idempotency-Key',
    ],
    exposedHeaders: ['X-Correlation-ID'],
  });

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
    }),
  );

  app.useGlobalFilters(new HttpExceptionToProblemDetails());

  // Swagger / OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('HMS-BR API')
    .setDescription('Hospital Management System Brasil — Core API')
    .setVersion('0.0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(config.API_PORT, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(
    `HMS-BR API listening on http://0.0.0.0:${config.API_PORT} (env=${config.NODE_ENV})`,
  );
}

bootstrap().catch((error: unknown) => {
  // Logger pino ainda não está disponível neste ponto.
  // eslint-disable-next-line no-console
  console.error('Fatal: failed to bootstrap NestJS application', error);
  process.exit(1);
});
