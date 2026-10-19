import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const prismaError = exception instanceof Prisma.PrismaClientKnownRequestError;
    const status = prismaError
      ? this.prismaStatus(exception.code)
      : exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = prismaError
      ? this.prismaMessage(exception.code)
      : exception instanceof HttpException
        ? exception.getResponse()
        : null;
    const message = this.extractMessage(payload, exception, status);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} failed`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private extractMessage(payload: string | object | null, exception: unknown, status: number): string | string[] {
    if (typeof payload === 'string') return payload;
    if (payload && 'message' in payload) {
      const message = payload.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && message.every((item) => typeof item === 'string')) return message;
    }
    if (status < 500 && exception instanceof Error) return exception.message;
    return 'Internal server error';
  }

  private prismaStatus(code: string): number {
    if (code === 'P2025') return HttpStatus.NOT_FOUND;
    if (code === 'P2002' || code === 'P2003') return HttpStatus.CONFLICT;
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private prismaMessage(code: string): string {
    if (code === 'P2025') return 'Không tìm thấy tài nguyên';
    if (code === 'P2002') return 'Dữ liệu xung đột với bản ghi hiện có';
    if (code === 'P2003') return 'Thao tác vi phạm liên kết dữ liệu';
    return 'Database operation failed';
  }
}
