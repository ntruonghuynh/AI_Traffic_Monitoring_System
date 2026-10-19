import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { paginate } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CameraQueryDto } from './dto/camera-query.dto';
import { CreateCameraDto } from './dto/create-camera.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';

@Injectable()
export class CamerasService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCameraDto) {
    return this.prisma.camera.create({
      data: {
        name: dto.name.trim(),
        location: dto.location.trim(),
        description: dto.description?.trim(),
        sourceType: dto.sourceType,
        status: dto.status,
        configuration: dto.configuration as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async findAll(query: CameraQueryDto) {
    const where = { status: query.status };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.camera.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { _count: { select: { videos: true } } },
      }),
      this.prisma.camera.count({ where }),
    ]);
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const camera = await this.prisma.camera.findUnique({
      where: { id },
      include: { _count: { select: { videos: true } } },
    });
    if (!camera) throw new NotFoundException('Không tìm thấy camera');
    return camera;
  }

  async update(id: string, dto: UpdateCameraDto) {
    await this.findOne(id);
    return this.prisma.camera.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        location: dto.location?.trim(),
        description: dto.description?.trim(),
        sourceType: dto.sourceType,
        status: dto.status,
        configuration: dto.configuration as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.camera.delete({ where: { id } });
  }
}
