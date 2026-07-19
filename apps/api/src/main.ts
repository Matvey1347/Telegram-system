import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApplicationLoggerService } from './application-logs/application-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(ApplicationLoggerService));

  const configService = app.get(ConfigService);

  const port = Number(process.env.PORT || configService.get<number>('API_PORT') || 4000);

  const frontendUrl = configService.get<string>('FRONTEND_URL');

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4000',
    frontendUrl,
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Workspace-Id',
      'X-Correlation-Id',
      'ngrok-skip-browser-warning',
    ],
    exposedHeaders: ['X-Correlation-Id'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(port, '0.0.0.0');
}

bootstrap();
