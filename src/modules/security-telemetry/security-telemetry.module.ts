import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ApiTelemetryInterceptor } from './api-telemetry.interceptor.js';
import { SecurityTelemetryService } from './security-telemetry.service.js';

@Global()
@Module({
  providers: [
    SecurityTelemetryService,
    ApiTelemetryInterceptor,
    { provide: APP_INTERCEPTOR, useExisting: ApiTelemetryInterceptor },
  ],
  exports: [SecurityTelemetryService],
})
export class SecurityTelemetryModule {}
