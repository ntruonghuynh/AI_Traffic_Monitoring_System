import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  liveness() {
    return { status: 'ok', checks: { application: 'up' }, timestamp: new Date().toISOString() };
  }

  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ready: true, checks: { database: 'up' }, timestamp: new Date().toISOString() };
    } catch {
      return { ready: false, checks: { database: 'down' }, timestamp: new Date().toISOString() };
    }
  }
}
