import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtAuthenticatedRequest } from '../../modules/auth/jwt-auth.guard.js';

/** Lê o id do usuário que o `JwtAuthGuard` anexou à requisição. */
export function getCurrentUserId(ctx: ExecutionContext): number {
  const request = ctx.switchToHttp().getRequest<JwtAuthenticatedRequest>();
  if (!request.user) {
    throw new UnauthorizedException('Token ausente ou inválido');
  }
  return request.user.id;
}

/**
 * Injeta o id do usuário autenticado no parâmetro do controller, para que o
 * service possa registrar quem fez a alteração na auditoria.
 */
export const CurrentUserId = createParamDecorator((_: unknown, ctx) =>
  getCurrentUserId(ctx),
);
