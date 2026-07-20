import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { SqlInjectionDetectorService } from './sql-injection';
import {
  createGlobalHttpRateLimit,
  GlobalHttpExceptionFilter,
  HttpThrottlerGuard,
} from './http-security';

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        createGlobalHttpRateLimit(configService),
      ],
    }),
  ],
  providers: [
    SqlInjectionDetectorService,
    {
      provide: APP_GUARD,
      useClass: HttpThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalHttpExceptionFilter,
    },
  ],
  exports: [SqlInjectionDetectorService],
})
export class SecurityModule {}
