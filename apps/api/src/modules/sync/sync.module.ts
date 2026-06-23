import { Module, forwardRef } from '@nestjs/common';
import { SyncService } from './sync.service';
import { WebsitesModule } from '../websites/websites.module';
import { LinkDeploymentsModule } from '../link-deployments/link-deployments.module';

@Module({
  imports: [
    forwardRef(() => WebsitesModule),
    forwardRef(() => LinkDeploymentsModule),
  ],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
