import { ForbiddenException } from '@nestjs/common';
import { MasterOnlyGuard } from './master-only.guard.js';

describe('MasterOnlyGuard', () => {
  const guard = new MasterOnlyGuard();
  const context = (perfil?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ auth: perfil ? { perfil } : undefined }),
      }),
    }) as never;

  it('permite somente MASTER', () =>
    expect(guard.canActivate(context('MASTER'))).toBe(true));
  it('retorna 403 para ADMIN', () =>
    expect(() => guard.canActivate(context('ADMIN'))).toThrow(
      ForbiddenException,
    ));
  it('retorna 403 sem identidade anexada', () =>
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException));
});
