import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

   app.use((req, res, next) => {
    const startedAt = Date.now();

    console.log(`[REQ] ${req.method} ${req.originalUrl}`);

    res.on('finish', () => {
      const duration = Date.now() - startedAt;
      console.log(`[RES] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    });

    next();
  });

  const configService = app.get(ConfigService);

  const port = Number(process.env.PORT || configService.get<number>('API_PORT') || 4000);

  const frontendUrl = configService.get<string>('FRONTEND_URL');

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4000',
    frontendUrl,
  ].filter(Boolean) as string[];

  console.log('PORT:', port);
  console.log('FRONTEND_URL:', frontendUrl);
  console.log('Allowed CORS origins:', allowedOrigins);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Workspace-Id',
      'ngrok-skip-browser-warning',
    ],
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

  console.log(`API is running on port ${port}`);
}

bootstrap();
