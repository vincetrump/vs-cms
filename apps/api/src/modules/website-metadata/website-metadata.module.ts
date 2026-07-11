import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebsiteMetadata, WebsiteMetadataSchema } from './schemas/website-metadata.schema';
import { WebsiteMetadataService } from './website-metadata.service';
import { WebsiteMetadataController } from './website-metadata.controller';
import { SshModule } from '../ssh/ssh.module';
import { WebsitesModule } from '../websites/websites.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: WebsiteMetadata.name, schema: WebsiteMetadataSchema }]),
    SshModule,
    forwardRef(() => WebsitesModule),
    forwardRef(() => JobsModule),
  ],
  providers: [WebsiteMetadataService],
  controllers: [WebsiteMetadataController],
  exports: [WebsiteMetadataService],
})
export class WebsiteMetadataModule {}
