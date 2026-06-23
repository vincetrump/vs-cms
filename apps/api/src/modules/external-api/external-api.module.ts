import { Module } from '@nestjs/common';
import { ExternalApiController } from './external-api.controller';
import { TextLinksModule } from '../text-links/text-links.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  imports: [TextLinksModule, ApiKeysModule],
  controllers: [ExternalApiController],
})
export class ExternalApiModule {}
