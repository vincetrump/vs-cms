import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FooterLink, FooterLinkSchema } from './schemas/footer-link.schema';
import { FooterLinksService } from './footer-links.service';
import { FooterLinksController } from './footer-links.controller';
import { FooterLinkDeploymentsModule } from '../footer-link-deployments/footer-link-deployments.module';
import { DiscordModule } from '../discord/discord.module';
import { JobsModule } from '../jobs/jobs.module';
import { FooterLinkHistoryModule } from '../footer-link-history/footer-link-history.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FooterLink.name, schema: FooterLinkSchema }]),
    forwardRef(() => FooterLinkDeploymentsModule),
    forwardRef(() => JobsModule),
    DiscordModule,
    FooterLinkHistoryModule,
  ],
  providers: [FooterLinksService],
  controllers: [FooterLinksController],
  exports: [FooterLinksService],
})
export class FooterLinksModule {}
