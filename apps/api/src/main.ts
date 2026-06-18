import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const port = Number(process.env.PORT || configService.get<number>('API_PORT') || 4000);

  const frontendUrl = configService.get<string>('FRONTEND_URL');

  app.enableCors({
    origin: [
      'http://localhost:3000',
      frontendUrl,
    ].filter(Boolean),
    credentials: true,
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