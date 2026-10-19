import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const expressApp = app.getHttpAdapter().getInstance() as { disable(header: string): void };
  expressApp.disable('x-powered-by');
  app.useLogger(new Logger('TrafficMonitoringBackend'));
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: false },
  }));
  app.useGlobalFilters(new AllExceptionsFilter());

  const configuredOrigins = config.get<string>('CORS_ORIGIN', 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: configuredOrigins, credentials: false });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Traffic Monitoring Backend')
    .setDescription('Phase 02 API cho camera, video, AI processing job và line-crossing candidate')
    .setVersion('2.0')
    .addApiKey({ type: 'apiKey', name: 'X-Internal-Token', in: 'header' }, 'internal-token')
    .build();
  SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, swaggerConfig), {
    jsonDocumentUrl: 'api/docs-json',
  });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(`Backend listening on http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
