import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { CameraSourceType, CameraStatus, PrismaClient } from '../src/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function seed(): Promise<void> {
  await prisma.camera.upsert({
    where: { id: '11111111-1111-4111-8111-111111111111' },
    update: {},
    create: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Camera phát triển mẫu',
      location: 'Khu vực thử nghiệm nội bộ',
      description: 'Metadata giả lập an toàn; không có RTSP credentials hoặc dữ liệu cá nhân.',
      sourceType: CameraSourceType.FILE_UPLOAD,
      status: CameraStatus.INACTIVE,
      configuration: { line: null, note: 'configure per camera before processing' },
    },
  });
}

seed()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Seed failed'}\n`);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
