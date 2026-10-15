import { ArgumentsHost, BadRequestException, ValidationPipe } from '@nestjs/common';
import { jest } from '@jest/globals';
import { CreateCameraDto } from '../cameras/dto/create-camera.dto';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { Prisma } from '../generated/prisma/client';

describe('API validation and error handling', () => {
  it('global validation policy từ chối field không khai báo', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    await expect(pipe.transform(
      { name: 'Camera A', location: 'Gate', injected: true },
      { type: 'body', metatype: CreateCameraDto },
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exception filter trả error envelope nhất quán', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
        getRequest: () => ({ method: 'GET', url: '/api/v1/cameras/not-a-uuid' }),
      }),
    } as unknown as ArgumentsHost;
    new AllExceptionsFilter().catch(new BadRequestException('ID không hợp lệ'), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 400,
      message: 'ID không hợp lệ',
      path: '/api/v1/cameras/not-a-uuid',
    }));
  });

  it('map Prisma unique conflict thành HTTP 409 mà không lộ chi tiết DB', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
        getRequest: () => ({ method: 'POST', url: '/api/v1/cameras' }),
      }),
    } as unknown as ArgumentsHost;
    const error = new Prisma.PrismaClientKnownRequestError('sensitive database detail', {
      code: 'P2002',
      clientVersion: '7.10.0',
    });
    new AllExceptionsFilter().catch(error, host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Dữ liệu xung đột với bản ghi hiện có',
    }));
  });
});
