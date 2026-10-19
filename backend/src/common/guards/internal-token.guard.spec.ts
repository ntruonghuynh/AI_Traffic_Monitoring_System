import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import {
  DEVELOPMENT_TOKEN_PLACEHOLDER,
  InternalTokenGuard,
} from './internal-token.guard';

describe('InternalTokenGuard', () => {
  let values: Record<string, string | undefined>;
  let guard: InternalTokenGuard;
  let suppliedToken: string | undefined;

  beforeEach(() => {
    values = { NODE_ENV: 'development', INTERNAL_API_TOKEN: 'a-secure-test-token-with-enough-entropy' };
    suppliedToken = undefined;
    const config = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
    guard = new InternalTokenGuard(config);
  });

  function context(): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ header: (name: string) => name === 'x-internal-token' ? suppliedToken : undefined }),
      }),
    } as unknown as ExecutionContext;
  }

  it('returns 403 when INTERNAL_API_TOKEN is not configured', () => {
    delete values.INTERNAL_API_TOKEN;
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });

  it('returns 401 when the request has no token', () => {
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
  });

  it('returns 401 when the request token is wrong', () => {
    suppliedToken = 'wrong-token';
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
  });

  it('allows the configured token in development', () => {
    suppliedToken = values.INTERNAL_API_TOKEN;
    expect(guard.canActivate(context())).toBe(true);
  });

  it('rejects the configured placeholder in production even when supplied correctly', () => {
    values.NODE_ENV = 'production';
    values.INTERNAL_API_TOKEN = DEVELOPMENT_TOKEN_PLACEHOLDER;
    suppliedToken = DEVELOPMENT_TOKEN_PLACEHOLDER;
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });

  it('allows the placeholder in development', () => {
    values.INTERNAL_API_TOKEN = DEVELOPMENT_TOKEN_PLACEHOLDER;
    suppliedToken = DEVELOPMENT_TOKEN_PLACEHOLDER;
    expect(guard.canActivate(context())).toBe(true);
  });

  it('allows a non-placeholder token in production', () => {
    values.NODE_ENV = 'production';
    suppliedToken = values.INTERNAL_API_TOKEN;
    expect(guard.canActivate(context())).toBe(true);
  });
});
