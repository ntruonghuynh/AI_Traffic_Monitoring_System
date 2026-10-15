import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('Review endpoint bị vô hiệu hóa trong production cho đến khi có authentication');
    }
    const expected = this.config.get<string>('INTERNAL_API_TOKEN');
    if (!expected) {
      throw new ForbiddenException('INTERNAL_API_TOKEN chưa được cấu hình');
    }
    const request = context.switchToHttp().getRequest<Request>();
    const supplied = request.header('x-internal-token');
    if (!supplied || !this.matches(supplied, expected)) {
      throw new UnauthorizedException('Internal token không hợp lệ');
    }
    return true;
  }

  private matches(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
