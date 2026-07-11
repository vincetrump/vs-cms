import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JobsService } from '../jobs/jobs.service';
import { TextLinksService } from '../text-links/text-links.service';
import { DiscordService } from '../discord/discord.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private jobsService: JobsService,
    private textLinksService: TextLinksService,
    private discordService: DiscordService,
  ) {}

  @Cron('0 2 * * *')
  async checkExpiredLinks() {
    this.logger.log('Creating check_expired job...');
    await this.jobsService.create('check_expired');
  }

  @Cron('0 3 * * *')
  async verifyDeployments() {
    this.logger.log('Creating verify_deployments job...');
    await this.jobsService.create('verify_deployments');
  }

  @Cron('0 4 * * *')
  async syncWebsites() {
    this.logger.log('Creating sync_websites job...');
    await this.jobsService.create('sync_websites');
  }

  @Cron('0 2 * * *')
  async checkExpiredFooterLinks() {
    this.logger.log('Creating check_expired_footer_links job...');
    await this.jobsService.create('check_expired_footer_links');
  }

  @Cron('0 5 * * *')
  async scanWebsitePages() {
    this.logger.log('Creating scan_website_pages job...');
    await this.jobsService.create('scan_website_pages');
  }

  @Cron('0 2 * * *')
  async checkExpiredGuestPosts() {
    this.logger.log('Creating check_expired_guest_posts job...');
    await this.jobsService.create('check_expired_guest_posts');
  }

  @Cron('0 5 * * *')
  async scanWebsiteMetadata() {
    this.logger.log('Creating scan_website_metadata job...');
    await this.jobsService.create('scan_website_metadata');
  }

  @Cron('0 7,19 * * *')
  async remindPendingLinks() {
    this.logger.log('Checking for pending links...');
    const result = await this.textLinksService.findAll({
      filter: { status: 'pending' },
      sort: { createdAt: -1 },
      skip: 0,
      limit: 50,
    });
    if (result.data.length > 0) {
      this.logger.log(`Found ${result.data.length} pending link(s), sending reminder`);
      await this.discordService.sendPendingReminderNotification(result.data);
    }
  }
}
