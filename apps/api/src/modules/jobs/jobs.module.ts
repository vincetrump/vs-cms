import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Job, JobSchema } from './schemas/job.schema';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { WorkerService } from './worker.service';
import { LinkDeploymentsModule } from '../link-deployments/link-deployments.module';
import { FooterLinkDeploymentsModule } from '../footer-link-deployments/footer-link-deployments.module';
import { SyncModule } from '../sync/sync.module';
import { TextLinksModule } from '../text-links/text-links.module';
import { FooterLinksModule } from '../footer-links/footer-links.module';
import { DiscordModule } from '../discord/discord.module';
import { TextLinkHistoryModule } from '../text-link-history/text-link-history.module';
import { FooterLinkHistoryModule } from '../footer-link-history/footer-link-history.module';
import { WebsitePagesModule } from '../website-pages/website-pages.module';
import { WebsitesModule } from '../websites/websites.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }]),
    forwardRef(() => LinkDeploymentsModule),
    forwardRef(() => FooterLinkDeploymentsModule),
    forwardRef(() => SyncModule),
    forwardRef(() => TextLinksModule),
    forwardRef(() => FooterLinksModule),
    forwardRef(() => WebsitesModule),
    DiscordModule,
    TextLinkHistoryModule,
    FooterLinkHistoryModule,
    WebsitePagesModule,
  ],
  providers: [JobsService, WorkerService],
  controllers: [JobsController],
  exports: [JobsService],
})
export class JobsModule {}
