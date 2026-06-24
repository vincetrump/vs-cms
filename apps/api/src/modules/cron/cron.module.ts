import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronService } from './cron.service';
import { JobsModule } from '../jobs/jobs.module';
import { TextLinksModule } from '../text-links/text-links.module';
import { DiscordModule } from '../discord/discord.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    forwardRef(() => JobsModule),
    forwardRef(() => TextLinksModule),
    DiscordModule,
  ],
  providers: [CronService],
})
export class CronModule {}
