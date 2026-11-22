import { Injectable, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './auth.service.js';
import type { LoginDto } from './dto/login.dto.js';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { HttpException } from '@nestjs/common';
import { SecurityTelemetryService } from '../security-telemetry/security-telemetry.service.js';

export interface LoginResponse {
  token: string;
  expiraEm: string;
  usuario: AuthenticatedUser;
}

@Injectable()
export class LoginService {
  constructor(
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
    @Optional() private readonly telemetry?: SecurityTelemetryService,
  ) {}

  async login(credentials: LoginDto, request: Request): Promise<LoginResponse> {
    if (!this.telemetry && process.env.NODE_ENV !== 'test') {
      throw new Error('Persistência de sessões e telemetria indisponível');
    }
    let usuario: AuthenticatedUser;
    try {
      usuario = await this.auth.validateCredentials(credentials);
    } catch (error) {
      await this.telemetry?.registrarEvento({
        source: 'AUTH',
        eventType: 'LOGIN_FAILED',
        outcome: 'FAILURE',
        ip: request.ip,
        userAgent: request.get('user-agent'),
        route: '/auth/login',
        method: 'POST',
        status: error instanceof HttpException ? error.getStatus() : 401,
        correlationId: request.get('x-correlation-id'),
      });
      throw error;
    }
    const sessionId = randomUUID();
    const token = await this.jwt.signAsync({ sub: usuario.id, jti: sessionId });
    const payload: unknown = this.jwt.decode(token);
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('exp' in payload) ||
      typeof payload.exp !== 'number'
    ) {
      throw new Error('JWT emitido sem data de expiração');
    }

    const expiresAt = new Date(payload.exp * 1000);
    await this.telemetry?.criarSessao({
      id: sessionId,
      usuarioId: usuario.id,
      expiresAt,
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });
    await this.telemetry?.registrarEvento({
      usuarioId: usuario.id,
      source: 'AUTH',
      eventType: 'LOGIN_SUCCEEDED',
      outcome: 'SUCCESS',
      ip: request.ip,
      userAgent: request.get('user-agent'),
      route: '/auth/login',
      method: 'POST',
      status: 200,
      correlationId: request.get('x-correlation-id'),
    });
    return {
      token,
      expiraEm: expiresAt.toISOString(),
      usuario,
    };
  }
}
