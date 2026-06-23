import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { UsersService } from './modules/users/users.service';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  await usersService.seedAdmin();
  await app.close();
  console.log('Seed completed');
}

seed().catch(console.error);
