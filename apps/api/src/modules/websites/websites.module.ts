import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Website, WebsiteSchema } from './schemas/website.schema';
import { WebsitesService } from './websites.service';
import { WebsitesController } from './websites.controller';
import { JobsModule } from '../jobs/jobs.module';
import { LinkDeploymentsModule } from '../link-deployments/link-deployments.module';
import { FooterLinkDeploymentsModule } from '../footer-link-deployments/footer-link-deployments.module';
import { WebsitePagesModule } from '../website-pages/website-pages.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Website.name, schema: WebsiteSchema }]),
    forwardRef(() => JobsModule),
    forwardRef(() => LinkDeploymentsModule),
    forwardRef(() => FooterLinkDeploymentsModule),
    forwardRef(() => WebsitePagesModule),
  ],
  providers: [WebsitesService],
  controllers: [WebsitesController],
  exports: [WebsitesService],
})
export class WebsitesModule {}
