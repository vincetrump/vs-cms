import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Website, WebsiteSchema } from './schemas/website.schema';
import { WebsitesService } from './websites.service';
import { WebsitesController } from './websites.controller';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Website.name, schema: WebsiteSchema }]),
    forwardRef(() => JobsModule),
  ],
  providers: [WebsitesService],
  controllers: [WebsitesController],
  exports: [WebsitesService],
})
export class WebsitesModule {}
