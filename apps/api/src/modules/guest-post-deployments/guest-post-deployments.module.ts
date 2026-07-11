import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GuestPostDeployment, GuestPostDeploymentSchema } from './schemas/guest-post-deployment.schema';
import { GuestPostDeploymentsService } from './guest-post-deployments.service';
import { WebsitesModule } from '../websites/websites.module';
import { GuestPostsModule } from '../guest-posts/guest-posts.module';
import { WebsiteMetadataModule } from '../website-metadata/website-metadata.module';
import { SshModule } from '../ssh/ssh.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: GuestPostDeployment.name, schema: GuestPostDeploymentSchema }]),
    SshModule,
    forwardRef(() => WebsitesModule),
    forwardRef(() => GuestPostsModule),
    WebsiteMetadataModule,
  ],
  providers: [GuestPostDeploymentsService],
  exports: [GuestPostDeploymentsService],
})
export class GuestPostDeploymentsModule {}
