import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GuestPostDeployment, GuestPostDeploymentDocument } from './schemas/guest-post-deployment.schema';
import { SshService } from '../ssh/ssh.service';
import { WebsitesService } from '../websites/websites.service';
import { GuestPostsService } from '../guest-posts/guest-posts.service';
import { WebsiteMetadataService } from '../website-metadata/website-metadata.service';

const VALID_REL_TOKENS = new Set([
  'nofollow', 'noopener', 'noreferrer', 'sponsored', 'ugc', 'external',
]);

@Injectable()
export class GuestPostDeploymentsService {
  private readonly logger = new Logger(GuestPostDeploymentsService.name);

  constructor(
    @InjectModel(GuestPostDeployment.name) private deploymentModel: Model<GuestPostDeploymentDocument>,
    private sshService: SshService,
    private websitesService: WebsitesService,
    @Inject(forwardRef(() => GuestPostsService))
    private guestPostsService: GuestPostsService,
    private websiteMetadataService: WebsiteMetadataService,
  ) {}

  async findByGuestPost(guestPostId: string) {
    return this.deploymentModel
      .find({ guestPostId })
      .populate('websiteId')
      .exec();
  }

  async findByWebsite(websiteId: string) {
    return this.deploymentModel
      .find({ websiteId, status: 'deployed' })
      .populate('guestPostId')
      .exec();
  }

  async findDeployed(guestPostId: string) {
    return this.deploymentModel
      .find({ guestPostId, status: 'deployed' })
      .exec();
  }

  async findPreviouslyDeployed(guestPostId: string) {
    return this.deploymentModel
      .find({ guestPostId, status: 'removed' })
      .exec();
  }

  async countDeployed(guestPostId: string) {
    return this.deploymentModel.countDocuments({ guestPostId, status: 'deployed' }).exec();
  }

  async deployToWebsites(guestPostId: string, websiteIds: string[]) {
    const post = await this.guestPostsService.findById(guestPostId);
    if (!post) throw new Error('Guest post not found');

    const results: Array<{ websiteId: string; domain: string; success: boolean; pagePath?: string; error?: string }> = [];

    for (const websiteId of websiteIds) {
      const website = await this.websitesService.findById(websiteId);
      if (!website?.documentRoot) {
        results.push({ websiteId, domain: website?.domain || 'unknown', success: false, error: 'No document root' });
        continue;
      }

      try {
        const metadata = await this.websiteMetadataService.getOrScan(websiteId);
        const category = this.websiteMetadataService.resolveCategory(post.category, metadata.navCategories);

        this.validatePathSegment(category, 'category');

        // Reuse the existing path if this post was previously deployed to this website
        const existing = await this.deploymentModel.findOne({ guestPostId, websiteId }).exec();
        let slug: string;
        let pagePath: string;
        let filePath: string;

        if (existing?.filePath && existing?.pagePath) {
          filePath = existing.filePath;
          pagePath = existing.pagePath;
          slug = pagePath.split('/').filter(Boolean).pop() || post.slug;
        } else {
          slug = await this.generateUniqueSlug(website.documentRoot, category, post.slug, website.serverIp);
          pagePath = `/${category}/${slug}/`;
          filePath = `${website.documentRoot}/${category}/${slug}/index.html`;
        }

        this.validatePathSegment(slug, 'slug');

        const content = this.ensureBacklink(post.content, post.anchorText, post.targetUrl, post.rel);
        const html = this.websiteMetadataService.renderArticle(
          metadata.articleTemplate,
          { title: post.title, content, metaDescription: post.metaDescription },
          category,
          { noindex: !post.realPublic },
        );

        // Giữ lại các internal-link markers mà bài khác đã chèn vào file này (khi overwrite)
        let finalHtml = html;
        if (existing?.filePath) {
          try {
            const oldHtml = await this.sshService.readFile(filePath, website.serverIp);
            finalHtml = this.preserveInternalLinkBlocks(oldHtml, html);
          } catch {
            // File chưa tồn tại (đã bị undeploy) — không có gì để preserve
          }
        }

        const dirPath = filePath.replace(/\/index\.html$/, '');
        await this.sshService.createDirectory(dirPath, website.serverIp);
        await this.sshService.writeFile(filePath, finalHtml, website.serverIp);

        // Sitemap chỉ dành cho bài real-public; bài noindex không được đưa vào
        let addedToSitemap = false;
        if (post.realPublic && metadata.hasSitemap && metadata.sitemapPath) {
          try {
            await this.addToSitemap(metadata.sitemapPath, website.domain, pagePath, website.serverIp);
            addedToSitemap = true;
          } catch (err: any) {
            this.logger.warn(`Sitemap update failed for ${website.domain}: ${err.message}`);
          }
        }

        // Internal links: chèn link từ 1-2 bài cùng category trên site này trỏ đến bài mới
        let internalLinkSourceFiles: string[] = existing?.internalLinkSourceFiles || [];
        try {
          const inserted = await this.insertInternalLinks(
            guestPostId, websiteId, category, pagePath, post.title, filePath, website.serverIp,
          );
          if (inserted.length) {
            internalLinkSourceFiles = [...new Set([...internalLinkSourceFiles, ...inserted])];
          }
        } catch (err: any) {
          this.logger.warn(`Internal links failed for ${website.domain}: ${err.message}`);
        }

        await this.deploymentModel.findOneAndUpdate(
          { guestPostId, websiteId },
          {
            filePath,
            pagePath,
            category,
            status: 'deployed',
            deployedAt: new Date(),
            removedAt: null,
            errorMessage: null,
            addedToSitemap,
            internalLinksCount: internalLinkSourceFiles.length,
            internalLinkSourceFiles,
          },
          { upsert: true, new: true },
        );

        results.push({ websiteId, domain: website.domain, success: true, pagePath });
      } catch (err: any) {
        await this.deploymentModel.findOneAndUpdate(
          { guestPostId, websiteId },
          { status: 'failed', errorMessage: err.message },
          { upsert: true, new: true },
        );
        results.push({ websiteId, domain: website.domain, success: false, error: err.message });
      }
    }

    return results;
  }

  async undeployFromWebsites(guestPostId: string, websiteIds: string[]) {
    const results: Array<{ websiteId: string; domain: string; success: boolean; error?: string }> = [];

    for (const websiteId of websiteIds) {
      const website = await this.websitesService.findById(websiteId);
      const deployment = await this.deploymentModel
        .findOne({ guestPostId, websiteId, status: 'deployed' })
        .exec();

      if (!deployment || !website) {
        results.push({ websiteId, domain: website?.domain || 'unknown', success: true });
        continue;
      }

      try {
        await this.sshService.deleteFile(deployment.filePath, website.serverIp);
        // Only remove the slug directory if empty — never touch the category directory
        const slugDir = deployment.filePath.replace(/\/index\.html$/, '');
        await this.sshService.removeDirIfEmpty(slugDir, website.serverIp);

        if (deployment.addedToSitemap) {
          const metadata = await this.websiteMetadataService.findByWebsite(websiteId);
          if (metadata?.sitemapPath) {
            try {
              await this.removeFromSitemap(metadata.sitemapPath, website.domain, deployment.pagePath, website.serverIp);
            } catch (err: any) {
              this.logger.warn(`Sitemap cleanup failed for ${website.domain}: ${err.message}`);
            }
          }
        }

        // Gỡ internal links trỏ đến bài này khỏi các bài khác trên site
        if (deployment.internalLinkSourceFiles?.length) {
          for (const srcFile of deployment.internalLinkSourceFiles) {
            try {
              await this.sshService.backupFile(srcFile, website.serverIp);
              const srcHtml = await this.sshService.readFile(srcFile, website.serverIp);
              const cleaned = this.removeInternalLinkMarkers(srcHtml, guestPostId);
              if (cleaned !== srcHtml) {
                await this.sshService.writeFile(srcFile, cleaned, website.serverIp);
              }
            } catch (err: any) {
              this.logger.warn(`Internal link cleanup failed for ${srcFile}: ${err.message}`);
            }
          }
        }

        await this.deploymentModel.findByIdAndUpdate(deployment._id, {
          status: 'removed',
          removedAt: new Date(),
          addedToSitemap: false,
          internalLinksCount: 0,
          internalLinkSourceFiles: [],
        });

        results.push({ websiteId, domain: website.domain, success: true });
      } catch (err: any) {
        this.logger.error(`Undeploy failed for ${deployment.filePath}: ${err.message}`);
        results.push({ websiteId, domain: website.domain, success: false, error: err.message });
      }
    }

    return results;
  }

  async undeployFromAll(guestPostId: string) {
    const deployments = await this.deploymentModel.find({ guestPostId, status: 'deployed' }).exec();
    if (!deployments.length) return [];

    const websiteIds = [...new Set(deployments.map(d => d.websiteId.toString()))];
    return this.undeployFromWebsites(guestPostId, websiteIds);
  }

  async redeployPost(guestPostId: string) {
    const deployments = await this.findDeployed(guestPostId);
    if (!deployments.length) return;

    const post = await this.guestPostsService.findById(guestPostId);
    if (!post) return;

    for (const deployment of deployments) {
      const website = await this.websitesService.findById(deployment.websiteId.toString());
      if (!website) continue;

      try {
        const metadata = await this.websiteMetadataService.getOrScan(deployment.websiteId.toString());
        const content = this.ensureBacklink(post.content, post.anchorText, post.targetUrl, post.rel);
        const html = this.websiteMetadataService.renderArticle(
          metadata.articleTemplate,
          { title: post.title, content, metaDescription: post.metaDescription },
          deployment.category,
          { noindex: !post.realPublic },
        );

        // Giữ lại internal-link markers mà bài khác đã chèn vào file này
        let finalHtml = html;
        try {
          const oldHtml = await this.sshService.readFile(deployment.filePath, website.serverIp);
          finalHtml = this.preserveInternalLinkBlocks(oldHtml, html);
        } catch {
          // File không đọc được — ghi bản render mới
        }

        await this.sshService.writeFile(deployment.filePath, finalHtml, website.serverIp);

        // Đồng bộ trạng thái sitemap với flag realPublic hiện tại
        let addedToSitemap = deployment.addedToSitemap;
        if (metadata.hasSitemap && metadata.sitemapPath) {
          if (post.realPublic && !deployment.addedToSitemap) {
            try {
              await this.addToSitemap(metadata.sitemapPath, website.domain, deployment.pagePath, website.serverIp);
              addedToSitemap = true;
            } catch (err: any) {
              this.logger.warn(`Sitemap add failed for ${website.domain}: ${err.message}`);
            }
          } else if (!post.realPublic && deployment.addedToSitemap) {
            try {
              await this.removeFromSitemap(metadata.sitemapPath, website.domain, deployment.pagePath, website.serverIp);
              addedToSitemap = false;
            } catch (err: any) {
              this.logger.warn(`Sitemap remove failed for ${website.domain}: ${err.message}`);
            }
          }
        }

        await this.deploymentModel.findByIdAndUpdate(deployment._id, {
          deployedAt: new Date(),
          addedToSitemap,
        });
      } catch (err: any) {
        this.logger.error(`Redeploy failed for ${deployment.filePath}: ${err.message}`);
      }
    }
  }

  private validatePathSegment(segment: string, name: string): void {
    if (!/^[a-z0-9-]+$/.test(segment) || segment.includes('..')) {
      throw new Error(`Invalid ${name}: ${segment}`);
    }
  }

  private async generateUniqueSlug(
    documentRoot: string,
    category: string,
    baseSlug: string,
    serverIp: string,
  ): Promise<string> {
    let slug = baseSlug;
    for (let i = 2; i <= 20; i++) {
      const exists = await this.sshService.directoryExists(
        `${documentRoot}/${category}/${slug}`,
        serverIp,
      );
      if (!exists) return slug;
      slug = `${baseSlug}-${i}`;
    }
    throw new Error(`Could not generate unique slug for ${baseSlug} in /${category}/`);
  }

  private sanitizeRel(rel: string): string {
    return rel.split(/\s+/)
      .filter((t) => VALID_REL_TOKENS.has(t.toLowerCase()))
      .join(' ');
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // If the author did not embed the backlink in the content, append it as a closing paragraph
  ensureBacklink(content: string, anchorText: string, targetUrl: string, rel?: string | null): string {
    if (!/^https?:\/\//i.test(targetUrl)) {
      throw new Error('Only http/https URLs are allowed');
    }
    if (content.includes(targetUrl)) return content;

    const relAttr = rel ? ` rel="${this.escapeHtml(this.sanitizeRel(rel))}"` : '';
    const linkHtml = `<p>Tham khảo thêm: <a href="${this.escapeHtml(targetUrl)}"${relAttr}>${this.escapeHtml(anchorText)}</a></p>`;
    return `${content}\n${linkHtml}`;
  }

  private async addToSitemap(sitemapPath: string, domain: string, pagePath: string, serverIp: string) {
    await this.sshService.backupFile(sitemapPath, serverIp);
    let xml = await this.sshService.readFile(sitemapPath, serverIp);
    const loc = `https://${domain}${pagePath}`;

    // Remove any existing entry for this URL to avoid duplicates
    xml = this.removeSitemapEntry(xml, loc);

    const entry = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
    const closeIdx = xml.lastIndexOf('</urlset>');
    if (closeIdx === -1) {
      throw new Error('Invalid sitemap.xml: missing </urlset>');
    }
    xml = xml.slice(0, closeIdx) + entry + xml.slice(closeIdx);
    await this.sshService.writeFile(sitemapPath, xml, serverIp);
  }

  private async removeFromSitemap(sitemapPath: string, domain: string, pagePath: string, serverIp: string) {
    await this.sshService.backupFile(sitemapPath, serverIp);
    const xml = await this.sshService.readFile(sitemapPath, serverIp);
    const loc = `https://${domain}${pagePath}`;
    const cleaned = this.removeSitemapEntry(xml, loc);
    if (cleaned !== xml) {
      await this.sshService.writeFile(sitemapPath, cleaned, serverIp);
    }
  }

  // Chèn link "Xem thêm" từ tối đa 2 bài cùng category (đã deployed) trỏ đến bài mới.
  // Trả về danh sách file đã chèn thành công.
  private async insertInternalLinks(
    guestPostId: string,
    websiteId: string,
    category: string,
    pagePath: string,
    title: string,
    excludeFilePath: string,
    serverIp: string,
  ): Promise<string[]> {
    const siblings = await this.deploymentModel
      .find({
        websiteId,
        category,
        status: 'deployed',
        guestPostId: { $ne: guestPostId },
        filePath: { $ne: excludeFilePath },
      })
      .sort({ deployedAt: -1 })
      .limit(2)
      .exec();

    if (!siblings.length) return [];

    const linkBlock = this.buildInternalLinkHtml(guestPostId, pagePath, title);
    const inserted: string[] = [];

    for (const sibling of siblings) {
      try {
        await this.sshService.backupFile(sibling.filePath, serverIp);
        let html = await this.sshService.readFile(sibling.filePath, serverIp);
        html = this.removeInternalLinkMarkers(html, guestPostId);
        const idx = html.lastIndexOf('</article>');
        if (idx === -1) continue;
        html = html.slice(0, idx) + linkBlock + '\n' + html.slice(idx);
        await this.sshService.writeFile(sibling.filePath, html, serverIp);
        inserted.push(sibling.filePath);
      } catch (err: any) {
        this.logger.warn(`Internal link insert failed for ${sibling.filePath}: ${err.message}`);
      }
    }

    return inserted;
  }

  buildInternalLinkHtml(guestPostId: string, pagePath: string, title: string): string {
    return `<!-- vs-cms-ilink:${guestPostId} --><p>Xem thêm: <a href="${this.escapeHtml(pagePath)}">${this.escapeHtml(title)}</a></p><!-- /vs-cms-ilink:${guestPostId} -->`;
  }

  removeInternalLinkMarkers(html: string, guestPostId: string): string {
    const escaped = guestPostId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `\\n?<!-- vs-cms-ilink:${escaped} -->[\\s\\S]*?<!-- /vs-cms-ilink:${escaped} -->`,
      'g',
    );
    return html.replace(regex, '');
  }

  // Khi overwrite một article, giữ lại các ilink blocks mà bài khác đã chèn vào file cũ
  preserveInternalLinkBlocks(oldHtml: string, newHtml: string): string {
    const blocks = oldHtml.match(
      /<!-- vs-cms-ilink:([a-f0-9]{24}) -->[\s\S]*?<!-- \/vs-cms-ilink:\1 -->/g,
    );
    if (!blocks?.length) return newHtml;

    const idx = newHtml.lastIndexOf('</article>');
    if (idx === -1) return newHtml;
    return newHtml.slice(0, idx) + blocks.join('\n') + '\n' + newHtml.slice(idx);
  }

  private removeSitemapEntry(xml: string, loc: string): string {
    const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const entryRegex = new RegExp(`\\s*<url>(?:(?!</url>)[\\s\\S])*?<loc>\\s*${escaped}\\s*</loc>[\\s\\S]*?</url>`, 'g');
    return xml.replace(entryRegex, '');
  }
}
