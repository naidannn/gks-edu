import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import 'reflect-metadata';
import { AppModule } from './app.module.js';
import { VALIDATION_PIPE_OPTIONS } from './common/validation/validation-pipe.options.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  const port = config.getOrThrow<number>('port');
  const prefix = config.getOrThrow<string>('apiPrefix');
  const isProduction = config.getOrThrow<string>('nodeEnv') === 'production';

  // nginx is the only thing in front of us, and it appends the caller's address
  // to `X-Forwarded-For`. Without this, Express reports every request as coming
  // from 127.0.0.1 — and since the throttler keys on `req.ip`, the whole site
  // then shares one bucket: five sign-in attempts a minute for everybody at
  // once, five consultation requests an hour for the entire country. One hop,
  // never `true`: trusting the header outright would let a caller invent an
  // address and slip the limit.
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: isProduction }));
  app.use(compression());

  app.setGlobalPrefix(prefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableCors({
    origin: config.getOrThrow<string[]>('corsOrigin'),
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));

  app.enableShutdownHooks();

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('GKS Edu API')
      .setDescription('NestJS + Prisma + PostgreSQL 17 (pgvector) + Redis')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    SwaggerModule.setup(
      `${prefix}/docs`,
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
      { swaggerOptions: { persistAuthorization: true } },
    );
  }

  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://localhost:${port}/${prefix}/v1`);
  if (!isProduction) {
    logger.log(`Swagger UI at http://localhost:${port}/${prefix}/docs`);
  }
}

void bootstrap();
