import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
            const linkHtml = this.buildLinkHtml(textLinkId, link.anchorText, link.targetUrl, link.title);
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

    return results;
  }

  async undeployFromAll(textLinkId: string) {
    const deployments = await this.findDeployed(textLinkId);
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
        const linkHtml = this.buildLinkHtml(textLinkId, link.anchorText, link.targetUrl, link.title);
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
    const website = await this.websitesService.findById(websiteId);
    if (!website?.homepagePath) return [];

    try {
      const html = await this.sshService.readFile(website.homepagePath, website.serverIp);
      const regex = /<!-- vs-cms:([a-f0-9]+) -->/g;
      const ids: string[] = [];
      let match;
      while ((match = regex.exec(html)) !== null) {
        ids.push(match[1]);
      }
      return ids;
    } catch {
      return [];
    }
  }

  private buildLinkHtml(linkId: string, anchorText: string, targetUrl: string, title: string): string {
    const safeAnchor = anchorText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeTitle = title.replace(/"/g, '&quot;');
    const safeUrl = targetUrl.replace(/"/g, '&quot;');
    return `<!-- vs-cms:${linkId} --><a href="${safeUrl}" title="${safeTitle}">${safeAnchor}</a><!-- /vs-cms:${linkId} -->`;
  }

  private insertLink(html: string, linkHtml: string): string {
    const divRegex = /<div id="vs-cms-links"[^>]*>([\s\S]*?)<\/div>/;
    const match = html.match(divRegex);

    if (match) {
      const existing = match[1];
      const newContent = existing.trimEnd() + '\n' + linkHtml;
      return html.replace(divRegex, `<div id="vs-cms-links">${newContent}\n</div>`);
    }

    const section = `<div id="vs-cms-links">\n${linkHtml}\n</div>`;
    if (html.includes('</body>')) {
      return html.replace('</body>', `${section}\n</body>`);
    }
    return html + '\n' + section;
  }

  private removeLink(html: string, linkId: string): string {
    const linkRegex = new RegExp(
      `\\n?<!-- vs-cms:${linkId} -->.*?<!-- /vs-cms:${linkId} -->`,
      's',
    );
    let result = html.replace(linkRegex, '');

    const emptyDivRegex = /<div id="vs-cms-links"[^>]*>\s*<\/div>\n?/;
    result = result.replace(emptyDivRegex, '');

    return result;
  }
}
