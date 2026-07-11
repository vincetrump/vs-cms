import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GuestPost, GuestPostSchema } from './schemas/guest-post.schema';
import { GuestPostsService } from './guest-posts.service';
import { GuestPostsController } from './guest-posts.controller';
import { GuestPostDeploymentsModule } from '../guest-post-deployments/guest-post-deployments.module';
import { DiscordModule } from '../discord/discord.module';
import { JobsModule } from '../jobs/jobs.module';
import { GuestPostHistoryModule } from '../guest-post-history/guest-post-history.module';
import { ContentGenerationModule } from '../content-generation/content-generation.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: GuestPost.name, schema: GuestPostSchema }]),
    forwardRef(() => GuestPostDeploymentsModule),
    forwardRef(() => JobsModule),
    DiscordModule,
    GuestPostHistoryModule,
    ContentGenerationModule,
  ],
  providers: [GuestPostsService],
  controllers: [GuestPostsController],
  exports: [GuestPostsService],
})
export class GuestPostsModule {}
