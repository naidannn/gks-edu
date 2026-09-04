import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { configuration } from './config/configuration.js';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CasesModule } from './modules/cases/cases.module.js';
import { ContractsModule } from './modules/contracts/contracts.module.js';
import { FaqModule } from './modules/faq/faq.module.js';
import { LeadsModule } from './modules/leads/leads.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { PostsModule } from './modules/posts/posts.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { SavedUniversitiesModule } from './modules/saved-universities/saved-universities.module.js';
import { UniversitiesModule } from './modules/universities/universities.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { VectorModule } from './modules/vector/vector.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RedisModule } from './redis/redis.module.js';
import { SmsModule } from './sms/sms.module.js';
import { StorageModule } from './storage/storage.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: ['.env.local', '.env', '../../.env'],
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    QueueModule,
    StorageModule,
    SmsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    UniversitiesModule,
    SavedUniversitiesModule,
    LeadsModule,
    PricingModule,
    CasesModule,
    ContractsModule,
    PaymentsModule,
    PostsModule,
    FaqModule,
    VectorModule,
  ],
  providers: [
    // Everything is authenticated unless a route opts out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}
