import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';

@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService, private readonly storage: LocalStorageService) {}

  async read(id: string) {
    const asset = await this.prisma.evidenceAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Không tìm thấy evidence asset');
    return { asset, content: await this.storage.read(asset.storageKey) };
  }
}
