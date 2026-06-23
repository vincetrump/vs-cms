import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const adminUrl = configService.get<string>('ADMIN_URL', 'http://localhost:5173');

  app.enableCors({
    origin: [adminUrl],
    credentials: true,
    exposedHeaders: ['X-Total-Count'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const port = configService.get<number>('API_PORT', 3001);
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}

bootstrap();
