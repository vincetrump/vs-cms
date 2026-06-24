import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LinkDeployment, LinkDeploymentDocument } from './schemas/link-deployment.schema';
import { SshService } from '../ssh/ssh.service';
import { WebsitesService } from '../websites/websites.service';
import { TextLinksService } from '../text-links/text-links.service';

@Injectable()
export class LinkDeploymentsService {
  private readonly logger = new Logger(LinkDeploymentsService.name);

  constructor(
    @InjectModel(LinkDeployment.name) private deploymentModel: Model<LinkDeploymentDocument>,
    private sshService: SshService,
    private websitesService: WebsitesService,
    @Inject(forwardRef(() => TextLinksService))
    private textLinksService: TextLinksService,
  ) {}

  async findByTextLink(textLinkId: string) {
    return this.deploymentModel
      .find({ textLinkId })
      .populate('websiteId')
      .exec();
  }

  async findByWebsite(websiteId: string) {
    return this.deploymentModel
      .find({ websiteId, status: 'deployed' })
      .populate('textLinkId')
      .exec();
  }

  async findDeployed(textLinkId: string) {
    return this.deploymentModel
      .find({ textLinkId, status: 'deployed' })
      .exec();
  }

  async findPreviouslyDeployed(textLinkId: string) {
    return this.deploymentModel
      .find({ textLinkId, status: 'removed' })
      .exec();
  }

  async deployToWebsites(textLinkId: string, websiteIds: string[]) {
    const link = await this.textLinksService.findById(textLinkId);
    if (!link) throw new Error('Text link not found');

    const results: Array<{ websiteId: string; domain: string; success: boolean; error?: string }> = [];
    const concurrency = 5;

    for (let i = 0; i < websiteIds.length; i += concurrency) {
      const batch = websiteIds.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(async (websiteId) => {
          const website = await this.websitesService.findById(websiteId);
          if (!website?.homepagePath) {
            return { websiteId, domain: website?.domain || 'unknown', success: false, error: 'No homepage path' };
          }

          try {
            await this.sshService.backupFile(website.homepagePath, website.serverIp);
            const html = await this.sshService.readFile(website.homepagePath, website.serverIp);
            const linkHtml = this.buildLinkHtml(textLinkId, link.anchorText, link.targetUrl, link.title, link.rel);
            const newHtml = this.insertLink(html, linkHtml);
            await this.sshService.writeFile(website.homepagePath, newHtml, website.serverIp);

            await this.deploymentModel.findOneAndUpdate(
              { textLinkId, websiteId },
              { status: 'deployed', deployedAt: new Date(), removedAt: null, errorMessage: null },
              { upsert: true, new: true },
            );

            return { websiteId, domain: website.domain, success: true };
          } catch (err: any) {
            await this.deploymentModel.findOneAndUpdate(
              { textLinkId, websiteId },
              { status: 'failed', errorMessage: err.message },
              { upsert: true, new: true },
            );
            return { websiteId, domain: website.domain, success: false, error: err.message };
          }
        }),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') results.push(result.value);
        else results.push({ websiteId: 'unknown', domain: 'unknown', success: false, error: result.reason?.message });
      }
    }

    await this.refreshDeployedCounts(websiteIds);
    return results;
  }

  async undeployFromWebsites(textLinkId: string, websiteIds: string[]) {
    const results: Array<{ websiteId: string; domain: string; success: boolean; error?: string }> = [];

    for (const websiteId of websiteIds) {
      const website = await this.websitesService.findById(websiteId);
      if (!website?.homepagePath) continue;

      try {
        await this.sshService.backupFile(website.homepagePath, website.serverIp);
        const html = await this.sshService.readFile(website.homepagePath, website.serverIp);
        const newHtml = this.removeLink(html, textLinkId);
        await this.sshService.writeFile(website.homepagePath, newHtml, website.serverIp);

        await this.deploymentModel.findOneAndUpdate(
          { textLinkId, websiteId },
          { status: 'removed', removedAt: new Date() },
        );

        results.push({ websiteId, domain: website.domain, success: true });
      } catch (err: any) {
        results.push({ websiteId, domain: website.domain, success: false, error: err.message });
      }
    }

    await this.refreshDeployedCounts(websiteIds);
    return results;
  }

  async undeployFromAll(textLinkId: string) {
    const deployments = await this.deploymentModel.find({ textLinkId }).exec();
    if (!deployments.length) return [];

    const websiteIds = deployments.map((d) => d.websiteId.toString());
    return this.undeployFromWebsites(textLinkId, websiteIds);
  }

  async redeployLink(textLinkId: string) {
    const deployments = await this.findDeployed(textLinkId);
    if (!deployments.length) return;

    const link = await this.textLinksService.findById(textLinkId);
    if (!link) return;

    for (const deployment of deployments) {
      const website = await this.websitesService.findById(deployment.websiteId.toString());
      if (!website?.homepagePath) continue;

      try {
        await this.sshService.backupFile(website.homepagePath, website.serverIp);
        let html = await this.sshService.readFile(website.homepagePath, website.serverIp);
        html = this.removeLink(html, textLinkId);
        const linkHtml = this.buildLinkHtml(textLinkId, link.anchorText, link.targetUrl, link.title, link.rel);
        html = this.insertLink(html, linkHtml);
        await this.sshService.writeFile(website.homepagePath, html, website.serverIp);
      } catch (err: any) {
        this.logger.error(`Redeploy failed for ${website.domain}: ${err.message}`);
      }
    }
  }

  async syncWebsites(textLinkId: string, websiteIds: string[]) {
    const currentDeployments = await this.findDeployed(textLinkId);
    const currentIds = new Set(currentDeployments.map((d) => d.websiteId.toString()));
    const targetIds = new Set(websiteIds);

    const toAdd = websiteIds.filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !targetIds.has(id));

    if (toAdd.length) await this.deployToWebsites(textLinkId, toAdd);
    if (toRemove.length) await this.undeployFromWebsites(textLinkId, toRemove);
  }

  async verifyDeployment(textLinkId: string, websiteId: string): Promise<boolean> {
    const website = await this.websitesService.findById(websiteId);
    if (!website?.homepagePath) return false;

    try {
      const html = await this.sshService.readFile(website.homepagePath, website.serverIp);
      const marker = `<!-- vs-cms:${textLinkId} -->`;
      const found = html.includes(marker);

      await this.deploymentModel.findOneAndUpdate(
        { textLinkId, websiteId },
        { lastVerifiedAt: new Date(), ...(found ? {} : { status: 'failed', errorMessage: 'Link marker not found' }) },
      );

      return found;
    } catch (err: any) {
      this.logger.error(`Verify failed: ${err.message}`);
      return false;
    }
  }

  async countDeployed(textLinkId: string) {
    return this.deploymentModel.countDocuments({ textLinkId, status: 'deployed' }).exec();
  }

  async scanWebsiteForLinks(websiteId: string): Promise<string[]> {
    const result = await this.scanWebsiteFull(websiteId);
    return result.vsCmsIds;
  }

  async scanWebsiteFull(websiteId: string): Promise<{
    vsCmsIds: string[];
    externalLinks: Array<{ url: string; anchorText: string }>;
  }> {
    const website = await this.websitesService.findById(websiteId);
    if (!website?.homepagePath) return { vsCmsIds: [], externalLinks: [] };

    try {
      const html = await this.sshService.readFile(website.homepagePath, website.serverIp);

      const vsCmsRegex = /<!-- vs-cms:([a-f0-9]+) -->/g;
      const vsCmsIds: string[] = [];
      let match;
      while ((match = vsCmsRegex.exec(html)) !== null) {
        vsCmsIds.push(match[1]);
      }

      const externalLinks = this.extractExternalLinks(html, website.domain);

      return { vsCmsIds, externalLinks };
    } catch {
      return { vsCmsIds: [], externalLinks: [] };
    }
  }

  async reconcileWebsiteLinks(websiteId: string): Promise<{
    added: number;
    removed: number;
    verified: number;
    orphaned: number;
    deployedCount: number;
    externalLinks: Array<{ url: string; anchorText: string }>;
  }> {
    const scan = await this.scanWebsiteFull(websiteId);
    const foundIds = scan.vsCmsIds;
    const foundSet = new Set(foundIds);

    const allDeployments = await this.deploymentModel.find({ websiteId }).exec();
    const deploymentMap = new Map<string, LinkDeploymentDocument>();
    for (const d of allDeployments) {
      deploymentMap.set(d.textLinkId.toString(), d);
    }

    let added = 0;
    let removed = 0;
    let verified = 0;
    let orphaned = 0;

    for (const linkId of foundIds) {
      const existing = deploymentMap.get(linkId);

      if (existing) {
        if (existing.status !== 'deployed') {
          await this.deploymentModel.findByIdAndUpdate(existing._id, {
            status: 'deployed',
            lastVerifiedAt: new Date(),
            errorMessage: null,
          });
          added++;
        } else {
          await this.deploymentModel.findByIdAndUpdate(existing._id, {
            lastVerifiedAt: new Date(),
          });
          verified++;
        }
      } else {
        const textLink = await this.textLinksService.findById(linkId);
        if (textLink) {
          await this.deploymentModel.findOneAndUpdate(
            { textLinkId: linkId, websiteId },
            {
              status: 'deployed',
              deployedAt: new Date(),
              lastVerifiedAt: new Date(),
              errorMessage: null,
            },
            { upsert: true },
          );
          added++;
        } else {
          orphaned++;
        }
      }
    }

    for (const [linkId, deployment] of deploymentMap) {
      if (deployment.status === 'deployed' && !foundSet.has(linkId)) {
        await this.deploymentModel.findByIdAndUpdate(deployment._id, {
          status: 'failed',
          errorMessage: 'Link not found on website during reconciliation',
        });
        removed++;
      }
    }

    const deployedCount = await this.deploymentModel
      .countDocuments({ websiteId, status: 'deployed' })
      .exec();

    return { added, removed, verified, orphaned, deployedCount, externalLinks: scan.externalLinks };
  }

  async refreshDeployedCounts(websiteIds: string[]) {
    for (const websiteId of websiteIds) {
      const count = await this.deploymentModel
        .countDocuments({ websiteId, status: 'deployed' })
        .exec();
      await this.websitesService.updateDeployedLinkCount(websiteId, count);
    }
  }

  private extractExternalLinks(
    html: string,
    domain: string,
  ): Array<{ url: string; anchorText: string }> {
    const cleanHtml = html.replace(
      /<!-- vs-cms:[a-f0-9]+ -->[\s\S]*?<!-- \/vs-cms:[a-f0-9]+ -->/g,
      '',
    );

    const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const links: Array<{ url: string; anchorText: string }> = [];
    const seen = new Set<string>();
    let match;

    while ((match = linkRegex.exec(cleanHtml)) !== null) {
      const url = match[1].trim();
      const anchorText = match[2].replace(/<[^>]*>/g, '').trim();

      if (
        !url.startsWith('http://') &&
        !url.startsWith('https://') &&
        !url.startsWith('//')
      ) {
        continue;
      }

      try {
        const parsed = new URL(url, `https://${domain}`);
        const host = parsed.hostname.toLowerCase();
        if (
          host === domain ||
          host === `www.${domain}` ||
          host.endsWith(`.${domain}`)
        ) {
          continue;
        }
      } catch {
        continue;
      }

      if (seen.has(url)) continue;
      seen.add(url);

      links.push({ url, anchorText: anchorText || url });
    }

    return links;
  }

  private static VALID_REL_TOKENS = new Set([
    'nofollow', 'noopener', 'noreferrer', 'sponsored', 'ugc', 'external',
  ]);

  private sanitizeRel(rel: string): string {
    return rel.split(/\s+/)
      .filter((t) => LinkDeploymentsService.VALID_REL_TOKENS.has(t.toLowerCase()))
      .join(' ');
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  private buildLinkHtml(linkId: string, anchorText: string, targetUrl: string, title: string, rel?: string | null): string {
    if (!/^https?:\/\//i.test(targetUrl)) {
      throw new Error('Only http/https URLs are allowed');
    }
    const safeAnchor = this.escapeHtml(anchorText);
    const safeTitle = this.escapeHtml(title);
    const safeUrl = this.escapeHtml(targetUrl);
    const relAttr = rel ? ` rel="${this.escapeHtml(this.sanitizeRel(rel))}"` : '';
    return `<!-- vs-cms:${linkId} --><a href="${safeUrl}" title="${safeTitle}" target="_blank"${relAttr}>${safeAnchor}</a><!-- /vs-cms:${linkId} -->`;
  }

  private insertLink(html: string, linkHtml: string): string {
    const divRegex = /<div id="vs-cms-links"[^>]*>([\s\S]*?)<\/div>/;
    const match = html.match(divRegex);

    if (match) {
      const existing = match[1];
      const newContent = existing.trimEnd() + '\n' + linkHtml;
      return html.replace(divRegex, `<div id="vs-cms-links" style="display:none">${newContent}\n</div>`);
    }

    const section = `<div id="vs-cms-links" style="display:none">\n${linkHtml}\n</div>`;
    if (html.includes('</body>')) {
      return html.replace('</body>', `${section}\n</body>`);
    }
    return html + '\n' + section;
  }

  private removeLink(html: string, linkId: string): string {
    if (!Types.ObjectId.isValid(linkId)) {
      throw new Error('Invalid link ID format');
    }
    const escapedId = linkId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkRegex = new RegExp(
      `\\n?<!-- vs-cms:${escapedId} -->.*?<!-- /vs-cms:${escapedId} -->`,
      's',
    );
    let result = html.replace(linkRegex, '');

    const emptyDivRegex = /<div id="vs-cms-links"[^>]*>\s*<\/div>\n?/;
    result = result.replace(emptyDivRegex, '');

    return result;
  }
}
