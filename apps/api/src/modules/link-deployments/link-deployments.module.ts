import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LinkDeployment, LinkDeploymentSchema } from './schemas/link-deployment.schema';
import { LinkDeploymentsService } from './link-deployments.service';
import { WebsitesModule } from '../websites/websites.module';
import { TextLinksModule } from '../text-links/text-links.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: LinkDeployment.name, schema: LinkDeploymentSchema }]),
    forwardRef(() => WebsitesModule),
    forwardRef(() => TextLinksModule),
  ],
  providers: [LinkDeploymentsService],
  exports: [LinkDeploymentsService],
})
export class LinkDeploymentsModule {}
