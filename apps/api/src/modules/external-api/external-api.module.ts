import { Module } from '@nestjs/common';
import { ExternalApiController } from './external-api.controller';
import { TextLinksModule } from '../text-links/text-links.module';
import { WebsitesModule } from '../websites/websites.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  imports: [TextLinksModule, WebsitesModule, ApiKeysModule],
  controllers: [ExternalApiController],
})
export class ExternalApiModule {}
