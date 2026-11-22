import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { catchError, Observable, tap, throwError } from 'rxjs';
import { SecurityTelemetryService } from './security-telemetry.service.js';

type RequestWithUser = Request & { user?: { id: number } };

@Injectable()
export class ApiTelemetryInterceptor implements NestInterceptor {
  constructor(private readonly telemetry: SecurityTelemetryService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const response = context.switchToHttp().getResponse<Response>();
    const route = normalizeRoute(request);
    const correlationId =
      safeCorrelation(request.get('x-correlation-id')) ?? randomUUID();
    request.headers['x-correlation-id'] = correlationId;
    response.setHeader('x-correlation-id', correlationId);
    if (
      route.endsWith('/health') ||
      route.includes('/telemetry/client') ||
      route.endsWith('/auth/login')
    )
      return next.handle();
    const started = Date.now();
    let recorded = false;
    const record = (status: number) => {
      if (recorded) return;
      recorded = true;
      void this.telemetry
        .registrarEvento({
          usuarioId: request.user?.id,
          source: 'API',
          eventType: 'API_REQUEST',
          method: request.method,
          route,
          status,
          durationMs: Date.now() - started,
          outcome: status >= 400 ? 'FAILURE' : 'SUCCESS',
          correlationId,
          ip: request.ip,
          userAgent: request.get('user-agent'),
        })
        .catch(() => undefined);
    };
    return next.handle().pipe(
      tap(() => record(response.statusCode)),
      catchError((error: unknown) => {
        const status = error instanceof HttpException ? error.getStatus() : 500;
        record(status);
        return throwError(() => error);
      }),
    );
  }
}

function safeCorrelation(value?: string) {
  return value && /^[\w.-]{1,100}$/.test(value) ? value : undefined;
}

function normalizeRoute(request: Request) {
  const route = request.route?.path;
  const base = request.baseUrl ?? '';
  const raw = `${base}${typeof route === 'string' ? route : request.path}`;
  return raw
    .replace(/\b\d+\b/g, ':id')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid')
    .slice(0, 255);
}
