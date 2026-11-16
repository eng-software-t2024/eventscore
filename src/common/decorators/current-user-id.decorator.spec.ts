import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { getCurrentUserId } from './current-user-id.decorator.js';

describe('getCurrentUserId', () => {
  function context(request: object): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('retorna o id anexado pelo guard JWT', () => {
    expect(getCurrentUserId(context({ user: { id: 7 } }))).toBe(7);
  });

  it('recusa requisição sem usuário autenticado', () => {
    expect(() => getCurrentUserId(context({}))).toThrow(UnauthorizedException);
  });
});
