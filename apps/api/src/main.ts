import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import 'reflect-metadata';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  const port = config.getOrThrow<number>('port');
  const prefix = config.getOrThrow<string>('apiPrefix');
  const isProduction = config.getOrThrow<string>('nodeEnv') === 'production';

  app.use(helmet({ contentSecurityPolicy: isProduction }));
  app.use(compression());

  app.setGlobalPrefix(prefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableCors({
    origin: config.getOrThrow<string[]>('corsOrigin'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // No `enableImplicitConversion`: it coerces by the reflected design type,
      // which turns the query string "false" into `Boolean('false') === true`
      // and overrides a DTO's own @Transform. Query DTOs state their
      // conversions explicitly with @Type / @Transform instead.
    }),
  );

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
