import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TextLink, TextLinkSchema } from './schemas/text-link.schema';
import { TextLinksService } from './text-links.service';
import { TextLinksController } from './text-links.controller';
import { LinkDeploymentsModule } from '../link-deployments/link-deployments.module';
import { DiscordModule } from '../discord/discord.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: TextLink.name, schema: TextLinkSchema }]),
    forwardRef(() => LinkDeploymentsModule),
    forwardRef(() => JobsModule),
    DiscordModule,
  ],
  providers: [TextLinksService],
  controllers: [TextLinksController],
  exports: [TextLinksService],
})
export class TextLinksModule {}
