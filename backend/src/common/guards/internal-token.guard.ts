import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export const DEVELOPMENT_TOKEN_PLACEHOLDER = 'replace-with-a-long-random-development-token';

@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('INTERNAL_API_TOKEN');
    if (!expected) {
      throw new ForbiddenException('INTERNAL_API_TOKEN chưa được cấu hình');
    }
    if (
      this.config.get<string>('NODE_ENV') === 'production'
      && expected === DEVELOPMENT_TOKEN_PLACEHOLDER
    ) {
      throw new ForbiddenException('Không được dùng token mẫu trong production');
    }
    const request = context.switchToHttp().getRequest<Request>();
    const supplied = request.header('x-internal-token');
    if (!supplied || !this.matches(supplied, expected)) {
      throw new UnauthorizedException('Internal token không hợp lệ');
    }
    return true;
  }

  private matches(left: string, right: string): boolean {
    const leftHash = createHash('sha256').update(left, 'utf8').digest();
    const rightHash = createHash('sha256').update(right, 'utf8').digest();
    return timingSafeEqual(leftHash, rightHash);
  }
}
