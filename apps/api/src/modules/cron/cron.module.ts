import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronService } from './cron.service';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    JobsModule,
  ],
  providers: [CronService],
})
export class CronModule {}
