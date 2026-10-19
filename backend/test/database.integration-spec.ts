import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { assertSafeTestDatabaseUrl, runIntegration, testDatabaseUrl } from './helpers/test-database';

(runIntegration ? describe : describe.skip)('PostgreSQL integration', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    if (!testDatabaseUrl) return;
    const safeUrl = assertSafeTestDatabaseUrl(testDatabaseUrl);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: safeUrl }) });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('kết nối được dedicated test database', async () => {
    const result = await prisma.$queryRaw<Array<{ value: number }>>`SELECT 1 AS value`;
    expect(result[0]?.value).toBe(1);
  });
});
