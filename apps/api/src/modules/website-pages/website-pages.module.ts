import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebsitePage, WebsitePageSchema } from './schemas/website-page.schema';
import { WebsitePagesService } from './website-pages.service';
import { SshModule } from '../ssh/ssh.module';
import { WebsitesModule } from '../websites/websites.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: WebsitePage.name, schema: WebsitePageSchema }]),
    SshModule,
    forwardRef(() => WebsitesModule),
  ],
  providers: [WebsitePagesService],
  exports: [WebsitePagesService],
})
export class WebsitePagesModule {}
