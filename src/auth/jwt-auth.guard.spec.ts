import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  it('rejects requests without a bearer token', async () => {
    const authService = { verify: vi.fn() };
    const guard = new JwtAuthGuard(authService as never);
    const request = { headers: {} };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
    expect(authService.verify).not.toHaveBeenCalled();
  });

  it('rejects requests with an invalid bearer token', async () => {
    const authService = {
      verify: vi.fn().mockRejectedValue(new UnauthorizedException()),
    };
    const guard = new JwtAuthGuard(authService as never);
    const request = { headers: { authorization: 'Bearer invalid' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
  });
});
