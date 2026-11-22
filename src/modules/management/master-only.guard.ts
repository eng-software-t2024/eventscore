import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class MasterOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { auth?: { perfil?: string } }>();
    if (request.auth?.perfil !== 'MASTER')
      throw new ForbiddenException('Acesso exclusivo ao perfil MASTER');
    return true;
  }
}
