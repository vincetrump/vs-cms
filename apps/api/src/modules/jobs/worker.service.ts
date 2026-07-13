import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { LinkDeploymentsService } from '../link-deployments/link-deployments.service';
import { FooterLinkDeploymentsService } from '../footer-link-deployments/footer-link-deployments.service';
import { SyncService } from '../sync/sync.service';
import { TextLinksService } from '../text-links/text-links.service';
import { FooterLinksService } from '../footer-links/footer-links.service';
import { DiscordService } from '../discord/discord.service';
import { TextLinkHistoryService } from '../text-link-history/text-link-history.service';
import { FooterLinkHistoryService } from '../footer-link-history/footer-link-history.service';
import { WebsitePagesService } from '../website-pages/website-pages.service';
import { WebsitesService } from '../websites/websites.service';
import { GuestPostsService } from '../guest-posts/guest-posts.service';
import { GuestPostDeploymentsService } from '../guest-post-deployments/guest-post-deployments.service';
import { GuestPostHistoryService } from '../guest-post-history/guest-post-history.service';
import { WebsiteMetadataService } from '../website-metadata/website-metadata.service';
import { JobDocument } from './schemas/job.schema';
import { JobConsoleLogger } from '../../common/logging/job-console.logger';

@Injectable()
export class WorkerService implements OnModuleInit {
  private readonly logger = new Logger(WorkerService.name);
  private processing = false;

  constructor(
    private jobsService: JobsService,
    private linkDeploymentsService: LinkDeploymentsService,
    private footerLinkDeploymentsService: FooterLinkDeploymentsService,
    private syncService: SyncService,
    private textLinksService: TextLinksService,
    private footerLinksService: FooterLinksService,
    private discordService: DiscordService,
    private historyService: TextLinkHistoryService,
    private footerHistoryService: FooterLinkHistoryService,
    private websitePagesService: WebsitePagesService,
    private websitesService: WebsitesService,
    private guestPostsService: GuestPostsService,
    private guestPostDeploymentsService: GuestPostDeploymentsService,
    private guestPostHistoryService: GuestPostHistoryService,
    private websiteMetadataService: WebsiteMetadataService,
    private jobConsoleLogger: JobConsoleLogger,
  ) {}

  async onModuleInit() {
    const reset = await this.jobsService.resetAllRunning();
    if (reset > 0) {
      this.logger.warn(`Reset ${reset} interrupted job(s) back to pending`);
    }
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

    // Bắt toàn bộ console log của mọi service trong lúc job chạy, gom vào job.logs
    // (batch flush mỗi 800ms để trang Show Job thấy tiến độ live, tránh ghi Mongo từng dòng)
    const MAX_CAPTURED = 3000;
    let capturedCount = 0;
    let buffer: Array<{ timestamp: Date; level: string; message: string }> = [];
    const flush = async () => {
      if (!buffer.length) return;
      const batch = buffer;
      buffer = [];
      try {
        await this.jobsService.addLogs(jobId, batch);
      } catch {
        /* không để lỗi flush làm hỏng job */
      }
    };
    const flushTimer = setInterval(() => void flush(), 800);
    this.jobConsoleLogger.startCapture((level, message, context) => {
      if (capturedCount >= MAX_CAPTURED) return;
      capturedCount++;
      const lvl = level === 'warn' || level === 'error' ? level : 'info';
      buffer.push({
        timestamp: new Date(),
        level: lvl,
        message: context ? `[${context}] ${message}` : message,
      });
    });

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
        case 'deploy_footer_links':
          result = await this.handleDeployFooterLinks(jobId, job.params);
          break;
        case 'undeploy_footer_links':
          result = await this.handleUndeployFooterLinks(jobId, job.params);
          break;
        case 'redeploy_footer_link':
          result = await this.handleRedeployFooterLink(jobId, job.params);
          break;
        case 'scan_website_pages':
          result = await this.handleScanWebsitePages(jobId, job.params);
          break;
        case 'check_expired_footer_links':
          result = await this.handleCheckExpiredFooterLinks(jobId);
          break;
        case 'deploy_guest_post':
          result = await this.handleDeployGuestPost(jobId, job.params);
          break;
        case 'undeploy_guest_post':
          result = await this.handleUndeployGuestPost(jobId, job.params);
          break;
        case 'redeploy_guest_post':
          result = await this.handleRedeployGuestPost(jobId, job.params);
          break;
        case 'regenerate_guest_post':
          result = await this.handleRegenerateGuestPost(jobId, job.params);
          break;
        case 'scan_website_metadata':
          result = await this.handleScanWebsiteMetadata(jobId, job.params);
          break;
        case 'check_expired_guest_posts':
          result = await this.handleCheckExpiredGuestPosts(jobId);
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
    } finally {
      this.jobConsoleLogger.stopCapture();
      clearInterval(flushTimer);
      await flush();
      if (capturedCount >= MAX_CAPTURED) {
        await this.jobsService.addLog(jobId, 'warn', `(Console bị cắt ở ${MAX_CAPTURED} dòng)`);
      }
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

  private async handleDeployFooterLinks(jobId: string, params: Record<string, any>) {
    const { footerLinkId, websiteIds } = params;
    const link = await this.footerLinksService.findById(footerLinkId);
    if (!link) throw new Error('Footer link not found');

    await this.jobsService.updateProgress(jobId, 0, websiteIds.length);
    await this.jobsService.addLog(jobId, 'info', `Deploying footer link "${link.anchorText}" (${link.pageCount} pages/site) to ${websiteIds.length} websites`);

    const results = await this.footerLinkDeploymentsService.deployToWebsites(footerLinkId, websiteIds);

    const success = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalPages = results.reduce((sum, r) => sum + r.pagesDeployed, 0);

    for (const r of results) {
      await this.jobsService.addLog(jobId, r.success ? 'info' : 'error',
        `${r.domain}: ${r.success ? `deployed to ${r.pagesDeployed} pages` : r.error}`);
    }

    await this.jobsService.updateProgress(jobId, websiteIds.length, websiteIds.length);

    await this.footerHistoryService.log({
      footerLinkId,
      action: failed > 0 ? 'deploy_failed' : 'deploy_completed',
      metadata: { jobId, success, failed, totalPages, total: results.length, websiteIds },
    });

    await this.discordService.sendFooterLinkDeployNotification(link, results);

    return { success, failed, totalPages, total: results.length };
  }

  private async handleUndeployFooterLinks(jobId: string, params: Record<string, any>) {
    const { footerLinkId, websiteIds } = params;
    const link = await this.footerLinksService.findById(footerLinkId);

    if (websiteIds?.length) {
      await this.jobsService.updateProgress(jobId, 0, websiteIds.length);
      await this.jobsService.addLog(jobId, 'info', `Undeploying footer link from ${websiteIds.length} websites`);
      const results = await this.footerLinkDeploymentsService.undeployFromWebsites(footerLinkId, websiteIds);

      for (const r of results) {
        await this.jobsService.addLog(jobId, 'info', `${r.domain}: removed from ${r.pagesRemoved} pages`);
      }
      await this.jobsService.updateProgress(jobId, websiteIds.length, websiteIds.length);

      await this.footerHistoryService.log({
        footerLinkId,
        action: 'undeploy_completed',
        metadata: { jobId, total: results.length },
      });

      if (link) {
        await this.discordService.sendFooterLinkUndeployNotification(link, results);
      }

      return { removed: results.reduce((sum, r) => sum + r.pagesRemoved, 0), total: results.length };
    } else {
      await this.jobsService.addLog(jobId, 'info', 'Undeploying footer link from all websites...');
      const results = await this.footerLinkDeploymentsService.undeployFromAll(footerLinkId);
      await this.jobsService.addLog(jobId, 'info', `Removed from ${results.length} websites`);

      await this.footerHistoryService.log({
        footerLinkId,
        action: 'undeploy_completed',
        metadata: { jobId, removed: results.length },
      });

      if (link) {
        await this.discordService.sendFooterLinkUndeployNotification(link, results);
      }

      return { removed: results.length };
    }
  }

  private async handleRedeployFooterLink(jobId: string, params: Record<string, any>) {
    const { footerLinkId } = params;
    await this.jobsService.addLog(jobId, 'info', 'Redeploying footer link to all current pages...');
    await this.footerLinkDeploymentsService.redeployLink(footerLinkId);
    await this.jobsService.addLog(jobId, 'info', 'Redeployment completed');

    await this.footerHistoryService.log({
      footerLinkId,
      action: 'redeployed',
      metadata: { jobId },
    });

    return { redeployed: true };
  }

  private async handleScanWebsitePages(jobId: string, params: Record<string, any>) {
    const websiteIds = params?.websiteIds;
    let websites;

    if (websiteIds?.length) {
      websites = await Promise.all(websiteIds.map((id: string) => this.websitesService.findById(id)));
      websites = websites.filter(Boolean);
    } else {
      websites = await this.websitesService.findAllActive();
    }

    await this.jobsService.updateProgress(jobId, 0, websites.length);
    await this.jobsService.addLog(jobId, 'info', `Scanning sub-pages for ${websites.length} websites`);

    let scanned = 0;
    let errors = 0;

    for (let i = 0; i < websites.length; i++) {
      const website = websites[i];
      if (!website.documentRoot) {
        await this.jobsService.addLog(jobId, 'warn', `${website.domain}: no document root, skipping`);
        continue;
      }

      try {
        const count = await this.websitePagesService.scanAndUpsert(
          website._id.toString(),
          website.documentRoot,
          website.serverIp,
        );
        await this.jobsService.addLog(jobId, 'info', `${website.domain}: ${count} sub-pages found`);
        scanned++;
      } catch (err: any) {
        await this.jobsService.addLog(jobId, 'error', `${website.domain}: ${err.message}`);
        errors++;
      }

      await this.jobsService.updateProgress(jobId, i + 1, websites.length);
    }

    return { scanned, errors, total: websites.length };
  }

  private async handleCheckExpiredFooterLinks(jobId: string) {
    await this.jobsService.addLog(jobId, 'info', 'Checking for expired footer links...');
    const expired = await this.footerLinksService.findExpired();

    if (!expired.length) {
      await this.jobsService.addLog(jobId, 'info', 'No expired footer links found');
      return { expired: 0 };
    }

    await this.jobsService.updateProgress(jobId, 0, expired.length);
    await this.jobsService.addLog(jobId, 'info', `Found ${expired.length} expired footer links`);

    for (let i = 0; i < expired.length; i++) {
      const link = expired[i];
      await this.jobsService.addLog(jobId, 'info', `Processing expired footer link: ${link.anchorText}`);
      await this.footerLinkDeploymentsService.undeployFromAll(link._id.toString());
      await this.footerLinksService.update(link._id.toString(), { status: 'expired' });

      await this.footerHistoryService.log({
        footerLinkId: link._id.toString(),
        action: 'expired',
        changes: { status: { old: link.status, new: 'expired' } },
        metadata: { jobId, expiresAt: link.expiresAt?.toISOString() },
      });

      await this.jobsService.updateProgress(jobId, i + 1, expired.length);
    }

    await this.discordService.sendFooterLinkExpirationNotification(expired);

    return { expired: expired.length };
  }

  private async handleDeployGuestPost(jobId: string, params: Record<string, any>) {
    const { guestPostId, websiteIds } = params;
    const post = await this.guestPostsService.findById(guestPostId);
    if (!post) throw new Error('Guest post not found');

    await this.jobsService.updateProgress(jobId, 0, websiteIds.length);
    await this.jobsService.addLog(jobId, 'info', `Deploying guest post "${post.title}" to ${websiteIds.length} websites`);
    if (post.contentSource === 'ai') {
      await this.jobsService.addLog(jobId, 'info',
        'AI mode: mỗi website sẽ được generate một bài viết riêng (~1-3 phút/site)');
    }

    const results = await this.guestPostDeploymentsService.deployToWebsites(guestPostId, websiteIds);

    const success = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    for (const r of results) {
      await this.jobsService.addLog(jobId, r.success ? 'info' : 'error',
        `${r.domain}: ${r.success ? `deployed at ${r.pagePath}${(r as any).title ? ` — "${(r as any).title}"` : ''}` : r.error}`);
    }

    await this.jobsService.updateProgress(jobId, websiteIds.length, websiteIds.length);

    await this.guestPostHistoryService.log({
      guestPostId,
      action: failed > 0 ? 'deploy_failed' : 'deploy_completed',
      metadata: { jobId, success, failed, total: results.length, websiteIds },
    });

    await this.discordService.sendGuestPostDeployNotification(post, results);

    return { success, failed, total: results.length };
  }

  private async handleUndeployGuestPost(jobId: string, params: Record<string, any>) {
    const { guestPostId, websiteIds } = params;
    const post = await this.guestPostsService.findById(guestPostId);

    let results;
    if (websiteIds?.length) {
      await this.jobsService.updateProgress(jobId, 0, websiteIds.length);
      await this.jobsService.addLog(jobId, 'info', `Undeploying guest post from ${websiteIds.length} websites`);
      results = await this.guestPostDeploymentsService.undeployFromWebsites(guestPostId, websiteIds);
      await this.jobsService.updateProgress(jobId, websiteIds.length, websiteIds.length);
    } else {
      await this.jobsService.addLog(jobId, 'info', 'Undeploying guest post from all websites...');
      results = await this.guestPostDeploymentsService.undeployFromAll(guestPostId);
    }

    for (const r of results) {
      await this.jobsService.addLog(jobId, r.success ? 'info' : 'error',
        `${r.domain}: ${r.success ? 'removed' : r.error}`);
    }

    await this.guestPostHistoryService.log({
      guestPostId,
      action: 'undeploy_completed',
      metadata: { jobId, removed: results.filter((r) => r.success).length, total: results.length },
    });

    if (post) {
      await this.discordService.sendGuestPostUndeployNotification(post, results);
    }

    return { removed: results.filter((r) => r.success).length, total: results.length };
  }

  private async handleRedeployGuestPost(jobId: string, params: Record<string, any>) {
    const { guestPostId } = params;
    await this.jobsService.addLog(jobId, 'info', 'Redeploying guest post to all deployed websites...');
    await this.guestPostDeploymentsService.redeployPost(guestPostId);
    await this.jobsService.addLog(jobId, 'info', 'Redeployment completed');

    await this.guestPostHistoryService.log({
      guestPostId,
      action: 'redeployed',
      metadata: { jobId },
    });

    return { redeployed: true };
  }

  // Regenerate: viết lại bài AI mới cho các website chỉ định, GIỮ NGUYÊN URL cũ.
  // deployToWebsites() với bài AI đã tự generate content mới + reuse path của deployment cũ.
  private async handleRegenerateGuestPost(jobId: string, params: Record<string, any>) {
    const { guestPostId, websiteIds } = params;
    const post = await this.guestPostsService.findById(guestPostId);
    if (!post) throw new Error('Guest post not found');

    await this.jobsService.updateProgress(jobId, 0, websiteIds.length);
    await this.jobsService.addLog(jobId, 'info',
      `Generate lại bài AI cho ${websiteIds.length} website (giữ nguyên URL, ~1-3 phút/site)`);

    const results = await this.guestPostDeploymentsService.deployToWebsites(guestPostId, websiteIds);

    const success = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    for (const r of results) {
      await this.jobsService.addLog(jobId, r.success ? 'info' : 'error',
        `${r.domain}: ${r.success ? `bài mới tại ${r.pagePath}${(r as any).title ? ` — "${(r as any).title}"` : ''}` : r.error}`);
    }
    await this.jobsService.updateProgress(jobId, websiteIds.length, websiteIds.length);

    await this.guestPostHistoryService.log({
      guestPostId,
      action: failed > 0 ? 'regenerate_failed' : 'regenerate_completed',
      metadata: { jobId, success, failed, total: results.length, websiteIds },
    });

    return { success, failed, total: results.length };
  }

  private async handleScanWebsiteMetadata(jobId: string, params: Record<string, any>) {
    const websiteIds = params?.websiteIds;
    let websites;

    if (websiteIds?.length) {
      websites = await Promise.all(websiteIds.map((id: string) => this.websitesService.findById(id)));
      websites = websites.filter(Boolean);
    } else {
      websites = await this.websitesService.findAllActive();
    }

    await this.jobsService.updateProgress(jobId, 0, websites.length);
    await this.jobsService.addLog(jobId, 'info', `Scanning metadata for ${websites.length} websites`);

    let scanned = 0;
    let errors = 0;

    for (let i = 0; i < websites.length; i++) {
      const website = websites[i];
      if (!website.documentRoot) {
        await this.jobsService.addLog(jobId, 'warn', `${website.domain}: no document root, skipping`);
        continue;
      }

      try {
        const metadata = await this.websiteMetadataService.scanAndUpsert(website._id.toString());
        await this.jobsService.addLog(jobId, 'info',
          `${website.domain}: ${metadata.navCategories.length} categories, sitemap=${metadata.hasSitemap ? 'yes' : 'no'}`);
        scanned++;
      } catch (err: any) {
        await this.jobsService.addLog(jobId, 'error', `${website.domain}: ${err.message}`);
        errors++;
      }

      await this.jobsService.updateProgress(jobId, i + 1, websites.length);
    }

    return { scanned, errors, total: websites.length };
  }

  private async handleCheckExpiredGuestPosts(jobId: string) {
    await this.jobsService.addLog(jobId, 'info', 'Checking for expired guest posts...');
    const expired = await this.guestPostsService.findExpired();

    if (!expired.length) {
      await this.jobsService.addLog(jobId, 'info', 'No expired guest posts found');
      return { expired: 0 };
    }

    await this.jobsService.updateProgress(jobId, 0, expired.length);
    await this.jobsService.addLog(jobId, 'info', `Found ${expired.length} expired guest posts`);

    const processed: typeof expired = [];
    for (let i = 0; i < expired.length; i++) {
      const post = expired[i];
      // Expire = gỡ riêng backlink (marker vs-cms-gplink), bài viết vẫn sống trên site.
      // Re-activate post → redeploy render lại từ content gốc → backlink được khôi phục.
      await this.jobsService.addLog(jobId, 'info', `Expired: "${post.title}" — gỡ backlink, giữ bài viết trên site`);
      const results = await this.guestPostDeploymentsService.removeBacklinkFromDeployedFiles(post._id.toString());
      for (const r of results) {
        await this.jobsService.addLog(jobId, r.success ? 'info' : 'error',
          `${r.domain}: ${r.success ? 'backlink đã gỡ' : r.error}`);
      }

      // Còn site gỡ thất bại → GIỮ post active để cron đêm sau retry (site đã gỡ rồi thì no-op)
      const failedRemovals = results.filter((r) => !r.success).length;
      if (failedRemovals > 0) {
        await this.jobsService.addLog(jobId, 'error',
          `"${post.title}": ${failedRemovals} site gỡ backlink thất bại — giữ post active, retry đêm sau`);
        await this.jobsService.updateProgress(jobId, i + 1, expired.length);
        continue;
      }

      await this.guestPostsService.update(post._id.toString(), { status: 'expired' });
      processed.push(post);

      await this.guestPostHistoryService.log({
        guestPostId: post._id.toString(),
        action: 'expired',
        changes: { status: { old: post.status, new: 'expired' } },
        metadata: {
          jobId,
          expiresAt: post.expiresAt?.toISOString(),
          backlinkRemovedFrom: results.filter((r) => r.success).length,
        },
      });

      await this.jobsService.updateProgress(jobId, i + 1, expired.length);
    }

    if (processed.length) {
      await this.discordService.sendGuestPostExpirationNotification(processed);
    }

    return { expired: processed.length, retryNextRun: expired.length - processed.length };
  }
}
