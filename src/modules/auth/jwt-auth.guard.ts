import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { SecurityTelemetryService } from '../security-telemetry/security-telemetry.service.js';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthUserRepository } from './auth-user.repository.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

export interface JwtAuthenticatedRequest extends Request {
  user?: { id: number };
  auth?: { perfil: string; sessionId: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly users: AuthUserRepository,
    private readonly reflector: Reflector,
    @Optional() private readonly sessions?: SecurityTelemetryService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    if (!this.sessions && process.env.NODE_ENV !== 'test') {
      throw new UnauthorizedException('Sessões persistidas indisponíveis');
    }

    const request = context
      .switchToHttp()
      .getRequest<JwtAuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? '');
    if (!match) {
      throw new UnauthorizedException('Token ausente ou inválido');
    }

    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(match[1]);
    } catch {
      throw new UnauthorizedException('Token ausente ou inválido');
    }
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('sub' in payload) ||
      typeof payload.sub !== 'number' ||
      !Number.isSafeInteger(payload.sub) ||
      payload.sub < 1
    ) {
      throw new UnauthorizedException('Token ausente ou inválido');
    }
    const user = await this.users.findById(payload.sub);
    if (!user || !user.ativo || !['ADMIN', 'MASTER'].includes(user.perfil)) {
      throw new UnauthorizedException('Token ausente ou inválido');
    }
    const sessionId =
      'jti' in payload && typeof payload.jti === 'string'
        ? payload.jti
        : undefined;
    if (
      this.sessions &&
      (!sessionId ||
        !(await this.sessions.validarEAtualizarSessao(sessionId, payload.sub)))
    ) {
      throw new UnauthorizedException('Sessão expirada ou revogada');
    }
    request.user = { id: payload.sub };
    request.auth = { perfil: user.perfil, sessionId: sessionId ?? '' };
    return true;
  }
}
