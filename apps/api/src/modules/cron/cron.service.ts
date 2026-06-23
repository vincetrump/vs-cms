import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JobsService } from '../jobs/jobs.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(private jobsService: JobsService) {}

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
}
