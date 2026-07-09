import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FooterLinkDeployment, FooterLinkDeploymentSchema } from './schemas/footer-link-deployment.schema';
import { FooterLinkDeploymentsService } from './footer-link-deployments.service';
import { WebsitesModule } from '../websites/websites.module';
import { FooterLinksModule } from '../footer-links/footer-links.module';
import { WebsitePagesModule } from '../website-pages/website-pages.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FooterLinkDeployment.name, schema: FooterLinkDeploymentSchema }]),
    forwardRef(() => WebsitesModule),
    forwardRef(() => FooterLinksModule),
    WebsitePagesModule,
  ],
  providers: [FooterLinkDeploymentsService],
  exports: [FooterLinkDeploymentsService],
})
export class FooterLinkDeploymentsModule {}
