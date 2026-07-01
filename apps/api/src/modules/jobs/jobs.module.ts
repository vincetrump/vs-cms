import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Job, JobSchema } from './schemas/job.schema';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { WorkerService } from './worker.service';
import { LinkDeploymentsModule } from '../link-deployments/link-deployments.module';
import { SyncModule } from '../sync/sync.module';
import { TextLinksModule } from '../text-links/text-links.module';
import { DiscordModule } from '../discord/discord.module';
import { TextLinkHistoryModule } from '../text-link-history/text-link-history.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }]),
    forwardRef(() => LinkDeploymentsModule),
    forwardRef(() => SyncModule),
    forwardRef(() => TextLinksModule),
    DiscordModule,
    TextLinkHistoryModule,
  ],
  providers: [JobsService, WorkerService],
  controllers: [JobsController],
  exports: [JobsService],
})
export class JobsModule {}
