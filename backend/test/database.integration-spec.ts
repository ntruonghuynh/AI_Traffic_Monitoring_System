import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const testUrl = process.env.TEST_DATABASE_URL;
const runIntegration = Boolean(testUrl);

(runIntegration ? describe : describe.skip)('PostgreSQL integration', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    if (!testUrl) return;
    const databaseName = new URL(testUrl).pathname.slice(1);
    if (!databaseName.endsWith('_test')) {
      throw new Error('TEST_DATABASE_URL phải trỏ tới database có hậu tố _test');
    }
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('kết nối được dedicated test database', async () => {
    const result = await prisma.$queryRaw<Array<{ value: number }>>`SELECT 1 AS value`;
    expect(result[0]?.value).toBe(1);
  });
});
