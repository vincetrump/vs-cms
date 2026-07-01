import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { LinkDeploymentsService } from '../link-deployments/link-deployments.service';
import { SyncService } from '../sync/sync.service';
import { TextLinksService } from '../text-links/text-links.service';
import { DiscordService } from '../discord/discord.service';
import { TextLinkHistoryService } from '../text-link-history/text-link-history.service';
import { JobDocument } from './schemas/job.schema';

@Injectable()
export class WorkerService implements OnModuleInit {
  private readonly logger = new Logger(WorkerService.name);
  private processing = false;

  constructor(
    private jobsService: JobsService,
    private linkDeploymentsService: LinkDeploymentsService,
    private syncService: SyncService,
    private textLinksService: TextLinksService,
    private discordService: DiscordService,
    private historyService: TextLinkHistoryService,
  ) {}

  onModuleInit() {
    this.jobsService.resetStaleRunning();
    this.startPolling();
  }

  private startPolling() {
    setInterval(() => this.tick(), 3000);
  }

  private async tick() {
    if (this.processing) return;

    try {
      const job = await this.jobsService.findNextPending();
      if (!job) return;

      this.processing = true;
      await this.processJob(job);
    } catch (err: any) {
      this.logger.error(`Worker tick error: ${err.message}`);
    } finally {
      this.processing = false;
    }
  }

  private async processJob(job: JobDocument) {
    const jobId = job._id.toString();
    this.logger.log(`Processing job ${jobId} [${job.type}]`);

    await this.jobsService.markRunning(jobId);
    await this.jobsService.addLog(jobId, 'info', `Starting job: ${job.type}`);

    try {
      let result: any;

      switch (job.type) {
        case 'sync_websites':
          result = await this.handleSyncWebsites(jobId);
          break;
        case 'deploy_links':
          result = await this.handleDeployLinks(jobId, job.params);
          break;
        case 'undeploy_links':
          result = await this.handleUndeployLinks(jobId, job.params);
          break;
        case 'undeploy_all':
          result = await this.handleUndeployAll(jobId, job.params);
          break;
        case 'redeploy_link':
          result = await this.handleRedeployLink(jobId, job.params);
          break;
        case 'sync_link_websites':
          result = await this.handleSyncLinkWebsites(jobId, job.params);
          break;
        case 'verify_deployments':
          result = await this.handleVerifyDeployments(jobId);
          break;
        case 'check_expired':
          result = await this.handleCheckExpired(jobId);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      await this.jobsService.addLog(jobId, 'info', 'Job completed successfully');
      await this.jobsService.markCompleted(jobId, result || {});
      this.logger.log(`Job ${jobId} completed`);
    } catch (err: any) {
      await this.jobsService.addLog(jobId, 'error', `Job failed: ${err.message}`);
      await this.jobsService.markFailed(jobId, err.message);
      this.logger.error(`Job ${jobId} failed: ${err.message}`);
    }
  }

  private async handleSyncWebsites(jobId: string) {
    await this.jobsService.addLog(jobId, 'info', 'Fetching zones from Cloudflare...');
    const result = await this.syncService.syncWebsites();
    await this.jobsService.addLog(jobId, 'info', `Synced ${result.synced}/${result.total} websites, ${result.errors} errors`);
    if (result.reconciled > 0) {
      await this.jobsService.addLog(
        jobId,
        'info',
        `Reconciled ${result.reconciled} websites: +${result.reconcileAdded} added, -${result.reconcileRemoved} removed, ${result.reconcileOrphaned} orphaned`,
      );
      await this.jobsService.addLog(
        jobId,
        'info',
        `Found ${result.totalExternalLinks} external links across all websites`,
      );
    }
    return result;
  }

  private async handleDeployLinks(jobId: string, params: Record<string, any>) {
    const { textLinkId, websiteIds } = params;
    const link = await this.textLinksService.findById(textLinkId);
    if (!link) throw new Error('Text link not found');

    await this.jobsService.updateProgress(jobId, 0, websiteIds.length);
    await this.jobsService.addLog(jobId, 'info', `Deploying "${link.anchorText}" to ${websiteIds.length} websites`);

    const results = await this.linkDeploymentsService.deployToWebsites(textLinkId, websiteIds);

    const success = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    for (const r of results) {
      await this.jobsService.addLog(jobId, r.success ? 'info' : 'error',
        `${r.domain}: ${r.success ? 'deployed' : r.error}`);
    }

    await this.jobsService.updateProgress(jobId, websiteIds.length, websiteIds.length);
    await this.discordService.sendDeploymentNotification(link, results);

    await this.historyService.log({
      textLinkId,
      action: failed > 0 ? 'deploy_failed' : 'deploy_completed',
      metadata: { jobId, success, failed, total: results.length, websiteIds },
    });

    return { success, failed, total: results.length };
  }

  private async handleUndeployLinks(jobId: string, params: Record<string, any>) {
    const { textLinkId, websiteIds } = params;
    await this.jobsService.updateProgress(jobId, 0, websiteIds.length);
    await this.jobsService.addLog(jobId, 'info', `Undeploying from ${websiteIds.length} websites`);

    const results = await this.linkDeploymentsService.undeployFromWebsites(textLinkId, websiteIds);

    for (const r of results) {
      await this.jobsService.addLog(jobId, r.success ? 'info' : 'error',
        `${r.domain}: ${r.success ? 'removed' : r.error}`);
    }

    await this.jobsService.updateProgress(jobId, websiteIds.length, websiteIds.length);

    await this.historyService.log({
      textLinkId,
      action: 'undeploy_completed',
      metadata: { jobId, removed: results.filter((r) => r.success).length, total: results.length, websiteIds },
    });

    return { removed: results.filter((r) => r.success).length, total: results.length };
  }

  private async handleUndeployAll(jobId: string, params: Record<string, any>) {
    const { textLinkId } = params;
    await this.jobsService.addLog(jobId, 'info', 'Undeploying from all websites...');
    const results = await this.linkDeploymentsService.undeployFromAll(textLinkId);
    await this.jobsService.addLog(jobId, 'info', `Removed from ${results.length} websites`);

    await this.historyService.log({
      textLinkId,
      action: 'undeploy_completed',
      metadata: { jobId, removed: results.length },
    });

    return { removed: results.length };
  }

  private async handleRedeployLink(jobId: string, params: Record<string, any>) {
    const { textLinkId } = params;
    await this.jobsService.addLog(jobId, 'info', 'Redeploying link to all current websites...');
    await this.linkDeploymentsService.redeployLink(textLinkId);
    await this.jobsService.addLog(jobId, 'info', 'Redeployment completed');

    await this.historyService.log({
      textLinkId,
      action: 'redeployed',
      metadata: { jobId },
    });

    return { redeployed: true };
  }

  private async handleSyncLinkWebsites(jobId: string, params: Record<string, any>) {
    const { textLinkId, websiteIds } = params;
    await this.jobsService.addLog(jobId, 'info', 'Syncing link website deployments...');
    await this.linkDeploymentsService.syncWebsites(textLinkId, websiteIds);
    await this.jobsService.addLog(jobId, 'info', 'Sync completed');
    return { synced: true };
  }

  private async handleVerifyDeployments(jobId: string) {
    await this.jobsService.addLog(jobId, 'info', 'Verifying all deployments...');
    const result = await this.syncService.verifyAllDeployments();
    await this.jobsService.addLog(jobId, 'info', `Verified: ${result.verified} ok, ${result.failures} failed`);
    return result;
  }

  private async handleCheckExpired(jobId: string) {
    await this.jobsService.addLog(jobId, 'info', 'Checking for expired text links...');
    const expired = await this.textLinksService.findExpired();

    if (!expired.length) {
      await this.jobsService.addLog(jobId, 'info', 'No expired links found');
      return { expired: 0 };
    }

    await this.jobsService.updateProgress(jobId, 0, expired.length);
    await this.jobsService.addLog(jobId, 'info', `Found ${expired.length} expired links`);

    for (let i = 0; i < expired.length; i++) {
      const link = expired[i];
      await this.jobsService.addLog(jobId, 'info', `Processing expired link: ${link.anchorText}`);
      await this.linkDeploymentsService.undeployFromAll(link._id.toString());
      await this.textLinksService.update(link._id.toString(), { status: 'expired' });

      await this.historyService.log({
        textLinkId: link._id.toString(),
        action: 'expired',
        changes: { status: { old: link.status, new: 'expired' } },
        metadata: { jobId, expiresAt: link.expiresAt?.toISOString() },
      });

      await this.jobsService.updateProgress(jobId, i + 1, expired.length);
    }

    await this.discordService.sendExpirationNotification(expired);
    return { expired: expired.length };
  }
}
