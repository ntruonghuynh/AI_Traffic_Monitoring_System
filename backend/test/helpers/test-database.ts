export const testDatabaseUrl = process.env.TEST_DATABASE_URL;
export const runIntegration = Boolean(testDatabaseUrl);

export function assertSafeTestDatabaseUrl(url = testDatabaseUrl): string {
  const allowedPorts = process.env.CI === 'true' ? ['5432', '5433'] : ['5433'];
  const errorMessage = `Integration test chỉ được dùng traffic_monitoring_test trên localhost (cổng ${allowedPorts.join(' hoặc ')})`;

  if (!url) throw new Error('TEST_DATABASE_URL is required for integration tests');

  try {
    const parsedUrl = new URL(url);
    const databaseName = parsedUrl.pathname.slice(1);
    if (
      databaseName !== 'traffic_monitoring_test'
      || !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)
      || !allowedPorts.includes(parsedUrl.port)
    ) {
      throw new Error(errorMessage);
    }
  } catch {
    throw new Error(errorMessage);
  }

  return url;
}
