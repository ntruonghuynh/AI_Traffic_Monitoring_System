import { jest } from '@jest/globals';
import { validate } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CamerasService } from './cameras.service';
import { CreateCameraDto } from './dto/create-camera.dto';

describe('CamerasService', () => {
  it('tạo camera qua Prisma service', async () => {
    const create = jest.fn<() => Promise<{ id: string; name: string }>>()
      .mockResolvedValue({ id: 'camera-id', name: 'Camera A' });
    const prisma = { camera: { create } } as unknown as PrismaService;
    const service = new CamerasService(prisma);
    await expect(service.create({ name: ' Camera A ', location: ' Gate ' })).resolves.toMatchObject({ id: 'camera-id' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: 'Camera A', location: 'Gate' }) }));
  });

  it('DTO từ chối camera thiếu name/location', async () => {
    const dto = new CreateCameraDto();
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['name', 'location']));
  });
});
