import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FooterLinkDeployment, FooterLinkDeploymentDocument } from './schemas/footer-link-deployment.schema';
import { SshService } from '../ssh/ssh.service';
import { WebsitesService } from '../websites/websites.service';
import { FooterLinksService } from '../footer-links/footer-links.service';
import { WebsitePagesService } from '../website-pages/website-pages.service';

@Injectable()
export class FooterLinkDeploymentsService {
  private readonly logger = new Logger(FooterLinkDeploymentsService.name);

  constructor(
    @InjectModel(FooterLinkDeployment.name) private deploymentModel: Model<FooterLinkDeploymentDocument>,
    private sshService: SshService,
    private websitesService: WebsitesService,
    @Inject(forwardRef(() => FooterLinksService))
    private footerLinksService: FooterLinksService,
    private websitePagesService: WebsitePagesService,
  ) {}

  async findByFooterLink(footerLinkId: string) {
    return this.deploymentModel
      .find({ footerLinkId })
      .populate('websiteId')
      .exec();
  }

  async findByWebsite(websiteId: string) {
    return this.deploymentModel
      .find({ websiteId, status: 'deployed' })
      .populate('footerLinkId')
      .exec();
  }

  async findDeployed(footerLinkId: string) {
    return this.deploymentModel
      .find({ footerLinkId, status: 'deployed' })
      .exec();
  }

  async findPreviouslyDeployed(footerLinkId: string) {
    return this.deploymentModel
      .find({ footerLinkId, status: 'removed' })
      .exec();
  }

  async deployToWebsites(footerLinkId: string, websiteIds: string[]) {
    const link = await this.footerLinksService.findById(footerLinkId);
    if (!link) throw new Error('Footer link not found');

    const results: Array<{ websiteId: string; domain: string; success: boolean; pagesDeployed: number; error?: string }> = [];

    for (const websiteId of websiteIds) {
      const website = await this.websitesService.findById(websiteId);
      if (!website?.documentRoot) {
        results.push({ websiteId, domain: website?.domain || 'unknown', success: false, pagesDeployed: 0, error: 'No document root' });
        continue;
      }

      try {
        const isFresh = await this.websitePagesService.isScanFresh(websiteId);
        if (!isFresh) {
          await this.websitePagesService.scanAndUpsert(websiteId, website.documentRoot, website.serverIp);
        }

        const pages = await this.websitePagesService.getPagesForDeploy(websiteId, link.pageCount);

        const deployPages = pages.map(p => ({ filePath: p.filePath, pagePath: p.pagePath }));

        if (link.includeHomepage && website.homepagePath) {
          const alreadyIncluded = deployPages.some(p => p.filePath === website.homepagePath);
          if (!alreadyIncluded) {
            deployPages.unshift({ filePath: website.homepagePath, pagePath: '/' });
          }
        }

        if (!deployPages.length) {
          results.push({ websiteId, domain: website.domain, success: false, pagesDeployed: 0, error: 'No pages with footer found' });
          continue;
        }

        const pageResults = await this.deployToPages(footerLinkId, websiteId, deployPages, website.serverIp);
        const successCount = pageResults.filter(r => r.success).length;

        results.push({ websiteId, domain: website.domain, success: successCount > 0, pagesDeployed: successCount });
      } catch (err: any) {
        results.push({ websiteId, domain: website.domain, success: false, pagesDeployed: 0, error: err.message });
      }
    }

    await this.refreshDeployedCounts(websiteIds);
    return results;
  }

  async deployToPages(
    footerLinkId: string,
    websiteId: string,
    pages: Array<{ filePath: string; pagePath: string }>,
    serverIp: string,
  ) {
    const link = await this.footerLinksService.findById(footerLinkId);
    if (!link) throw new Error('Footer link not found');

    const results: Array<{ filePath: string; success: boolean; error?: string }> = [];
    const concurrency = 5;

    for (let i = 0; i < pages.length; i += concurrency) {
      const batch = pages.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(async (page) => {
          try {
            await this.sshService.backupFile(page.filePath, serverIp);
            const html = await this.sshService.readFile(page.filePath, serverIp);
            const linkHtml = this.buildFooterLinkHtml(footerLinkId, link.anchorText, link.targetUrl, link.title, link.rel);
            const newHtml = this.insertFooterLink(html, linkHtml);
            await this.sshService.writeFile(page.filePath, newHtml, serverIp);

            await this.deploymentModel.findOneAndUpdate(
              { footerLinkId, websiteId, filePath: page.filePath },
              {
                pagePath: page.pagePath,
                status: 'deployed',
                deployedAt: new Date(),
                removedAt: null,
                errorMessage: null,
              },
              { upsert: true, new: true },
            );

            await this.websitePagesService.incrementFooterLinkCount(websiteId, page.filePath);
            return { filePath: page.filePath, success: true };
          } catch (err: any) {
            await this.deploymentModel.findOneAndUpdate(
              { footerLinkId, websiteId, filePath: page.filePath },
              {
                pagePath: page.pagePath,
                status: 'failed',
                errorMessage: err.message,
              },
              { upsert: true, new: true },
            );
            return { filePath: page.filePath, success: false, error: err.message };
          }
        }),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') results.push(result.value);
        else results.push({ filePath: 'unknown', success: false, error: result.reason?.message });
      }
    }

    return results;
  }

  async undeployFromWebsites(footerLinkId: string, websiteIds: string[]) {
    const results: Array<{ websiteId: string; domain: string; success: boolean; pagesRemoved: number; error?: string }> = [];

    for (const websiteId of websiteIds) {
      const website = await this.websitesService.findById(websiteId);
      const deployments = await this.deploymentModel
        .find({ footerLinkId, websiteId, status: 'deployed' })
        .exec();

      if (!deployments.length) {
        results.push({ websiteId, domain: website?.domain || 'unknown', success: true, pagesRemoved: 0 });
        continue;
      }

      let removed = 0;
      for (const dep of deployments) {
        try {
          await this.sshService.backupFile(dep.filePath, website!.serverIp);
          const html = await this.sshService.readFile(dep.filePath, website!.serverIp);
          const newHtml = this.removeFooterLink(html, footerLinkId);
          await this.sshService.writeFile(dep.filePath, newHtml, website!.serverIp);

          await this.deploymentModel.findByIdAndUpdate(dep._id, {
            status: 'removed',
            removedAt: new Date(),
          });

          await this.websitePagesService.decrementFooterLinkCount(websiteId, dep.filePath);
          removed++;
        } catch (err: any) {
          this.logger.error(`Undeploy failed for ${dep.filePath}: ${err.message}`);
        }
      }

      results.push({ websiteId, domain: website?.domain || 'unknown', success: true, pagesRemoved: removed });
    }

    await this.refreshDeployedCounts(websiteIds);
    return results;
  }

  async undeployFromAll(footerLinkId: string) {
    const deployments = await this.deploymentModel.find({ footerLinkId, status: 'deployed' }).exec();
    if (!deployments.length) return [];

    const websiteIds = [...new Set(deployments.map(d => d.websiteId.toString()))];
    return this.undeployFromWebsites(footerLinkId, websiteIds);
  }

  async redeployLink(footerLinkId: string) {
    const deployments = await this.findDeployed(footerLinkId);
    if (!deployments.length) return;

    const link = await this.footerLinksService.findById(footerLinkId);
    if (!link) return;

    for (const deployment of deployments) {
      const website = await this.websitesService.findById(deployment.websiteId.toString());
      if (!website) continue;

      try {
        await this.sshService.backupFile(deployment.filePath, website.serverIp);
        let html = await this.sshService.readFile(deployment.filePath, website.serverIp);
        html = this.removeFooterLink(html, footerLinkId);
        const linkHtml = this.buildFooterLinkHtml(footerLinkId, link.anchorText, link.targetUrl, link.title, link.rel);
        html = this.insertFooterLink(html, linkHtml);
        await this.sshService.writeFile(deployment.filePath, html, website.serverIp);
      } catch (err: any) {
        this.logger.error(`Redeploy failed for ${deployment.filePath}: ${err.message}`);
      }
    }
  }

  async countDeployed(footerLinkId: string) {
    return this.deploymentModel.countDocuments({ footerLinkId, status: 'deployed' }).exec();
  }

  async refreshDeployedCounts(websiteIds: string[]) {
    for (const websiteId of websiteIds) {
      const count = await this.deploymentModel
        .countDocuments({ websiteId, status: 'deployed' })
        .exec();
      await this.websitesService.updateDeployedFooterLinkCount(websiteId, count);
    }
  }

  private static VALID_REL_TOKENS = new Set([
    'nofollow', 'noopener', 'noreferrer', 'sponsored', 'ugc', 'external',
  ]);

  private sanitizeRel(rel: string): string {
    return rel.split(/\s+/)
      .filter((t) => FooterLinkDeploymentsService.VALID_REL_TOKENS.has(t.toLowerCase()))
      .join(' ');
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  buildFooterLinkHtml(linkId: string, anchorText: string, targetUrl: string, title: string, rel?: string | null): string {
    if (!/^https?:\/\//i.test(targetUrl)) {
      throw new Error('Only http/https URLs are allowed');
    }
    const safeAnchor = this.escapeHtml(anchorText);
    const safeTitle = this.escapeHtml(title);
    const safeUrl = this.escapeHtml(targetUrl);
    const relAttr = rel ? ` rel="${this.escapeHtml(this.sanitizeRel(rel))}"` : '';
    return `<!-- vs-cms-footer:${linkId} --><a href="${safeUrl}" title="${safeTitle}" target="_blank"${relAttr}>${safeAnchor}</a><!-- /vs-cms-footer:${linkId} -->`;
  }

  insertFooterLink(html: string, linkHtml: string): string {
    const footerBottomIdx = html.indexOf('<div class="footer-bottom">');
    if (footerBottomIdx !== -1) {
      return html.slice(0, footerBottomIdx) + linkHtml + '\n' + html.slice(footerBottomIdx);
    }

    const footerCloseIdx = html.indexOf('</footer>');
    if (footerCloseIdx !== -1) {
      return html.slice(0, footerCloseIdx) + linkHtml + '\n' + html.slice(footerCloseIdx);
    }

    const bodyCloseIdx = html.indexOf('</body>');
    if (bodyCloseIdx !== -1) {
      return html.slice(0, bodyCloseIdx) + linkHtml + '\n' + html.slice(bodyCloseIdx);
    }

    return html + '\n' + linkHtml;
  }

  removeFooterLink(html: string, linkId: string): string {
    if (!Types.ObjectId.isValid(linkId)) {
      throw new Error('Invalid link ID format');
    }
    const escapedId = linkId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkRegex = new RegExp(
      `\\n?<!-- vs-cms-footer:${escapedId} -->.*?<!-- /vs-cms-footer:${escapedId} -->`,
      's',
    );
    return html.replace(linkRegex, '');
  }
}
