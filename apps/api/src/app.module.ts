import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { WebsitesModule } from './modules/websites/websites.module';
import { TextLinksModule } from './modules/text-links/text-links.module';
import { LinkDeploymentsModule } from './modules/link-deployments/link-deployments.module';
import { SshModule } from './modules/ssh/ssh.module';
import { CloudflareModule } from './modules/cloudflare/cloudflare.module';
import { SyncModule } from './modules/sync/sync.module';
import { CronModule } from './modules/cron/cron.module';
import { DiscordModule } from './modules/discord/discord.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { ExternalApiModule } from './modules/external-api/external-api.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { DashboardController } from './modules/dashboard/dashboard.controller';
import { TotpSetupGuard } from './common/guards/totp-setup.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    DatabaseModule,
    SshModule,
    CloudflareModule,
    DiscordModule,
    UsersModule,
    AuthModule,
    WebsitesModule,
    TextLinksModule,
    LinkDeploymentsModule,
    SyncModule,
    CronModule,
    ApiKeysModule,
    ExternalApiModule,
    JobsModule,
  ],
  controllers: [DashboardController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TotpSetupGuard,
    },
  ],
})
export class AppModule {}
