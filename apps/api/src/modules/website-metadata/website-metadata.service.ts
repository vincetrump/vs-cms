import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WebsiteMetadata, WebsiteMetadataDocument } from './schemas/website-metadata.schema';
import { SshService } from '../ssh/ssh.service';
import { WebsitesService } from '../websites/websites.service';

const SCAN_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_CATEGORY = 'tong-hop';

const ARTICLE_CSS = `
.article-content {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}
.article-content h1 {
  margin-bottom: 16px;
}
.article-body p {
  margin-bottom: 1em;
  line-height: 1.7;
}
.article-body img {
  max-width: 100%;
  height: auto;
}
.breadcrumb {
  font-size: 14px;
  margin-bottom: 20px;
  color: var(--text-secondary, #666);
}
.breadcrumb a {
  color: inherit;
  text-decoration: none;
}
.breadcrumb a:hover {
  text-decoration: underline;
}
`;

@Injectable()
export class WebsiteMetadataService {
  private readonly logger = new Logger(WebsiteMetadataService.name);

  constructor(
    @InjectModel(WebsiteMetadata.name) private metadataModel: Model<WebsiteMetadataDocument>,
    private sshService: SshService,
    private websitesService: WebsitesService,
  ) {}

  async findByWebsite(websiteId: string) {
    return this.metadataModel.findOne({ websiteId: new Types.ObjectId(websiteId) }).exec();
  }

  async isFresh(websiteId: string, maxAgeMs = SCAN_STALE_MS): Promise<boolean> {
    const metadata = await this.findByWebsite(websiteId);
    if (!metadata?.lastScannedAt) return false;
    return Date.now() - metadata.lastScannedAt.getTime() < maxAgeMs;
  }

  async getOrScan(websiteId: string): Promise<WebsiteMetadataDocument> {
    const fresh = await this.isFresh(websiteId);
    if (fresh) {
      const existing = await this.findByWebsite(websiteId);
      if (existing) return existing;
    }
    return this.scanAndUpsert(websiteId);
  }

  async scanAndUpsert(websiteId: string): Promise<WebsiteMetadataDocument> {
    const website = await this.websitesService.findById(websiteId);
    if (!website) throw new NotFoundException('Website not found');
    if (!website.documentRoot) throw new Error(`${website.domain}: no document root`);

    const homepagePath = website.homepagePath || `${website.documentRoot}/index.html`;
    const html = await this.sshService.readFile(homepagePath, website.serverIp);

    const headerHtml = this.extractTag(html, 'header');
    const footerHtml = this.extractTag(html, 'footer');
    const inlineStyles = this.extractStyles(html);
    const cssVariables = this.parseCssVariables(inlineStyles);
    const language = this.detectLanguage(html);
    const siteName = this.extractSiteName(html, website.domain);
    const siteDescription = this.extractMeta(html, 'description') || '';
    const faviconUrl = this.extractFavicon(html);
    const logoUrl = this.extractLogo(headerHtml);
    const gscVerificationKey = this.extractMeta(html, 'google-site-verification');

    const sitemapPath = `${website.documentRoot}/sitemap.xml`;
    const hasSitemap = await this.sshService.fileExists(sitemapPath, website.serverIp);

    const navCategories = await this.sshService.listCategoryDirs(
      website.documentRoot,
      website.serverIp,
    );

    const data: Partial<WebsiteMetadata> = {
      siteName,
      siteDescription,
      language,
      headerHtml,
      footerHtml,
      navCategories,
      inlineStyles,
      cssVariables,
      logoUrl,
      faviconUrl,
      gscVerificationKey,
      hasSitemap,
      sitemapPath: hasSitemap ? sitemapPath : null,
      lastScannedAt: new Date(),
    };
    data.articleTemplate = this.buildArticleTemplate(data);

    const metadata = await this.metadataModel.findOneAndUpdate(
      { websiteId: new Types.ObjectId(websiteId) },
      { $set: data },
      { upsert: true, new: true },
    );

    this.logger.log(`Scanned metadata for ${website.domain}: ${navCategories.length} categories, sitemap=${hasSitemap}`);
    return metadata;
  }

  resolveCategory(requestedCategory: string, availableCategories: string[]): string {
    if (availableCategories.includes(requestedCategory)) {
      return requestedCategory;
    }
    if (availableCategories.includes(DEFAULT_CATEGORY)) {
      return DEFAULT_CATEGORY;
    }
    return availableCategories[0] || DEFAULT_CATEGORY;
  }

  buildArticleTemplate(metadata: Partial<WebsiteMetadata>): string {
    const gscTag = metadata.gscVerificationKey
      ? `<meta name="google-site-verification" content="${this.escapeHtml(metadata.gscVerificationKey)}">\n  `
      : '';
    const favicon = metadata.faviconUrl || '/favicon.ico';
    const styles = metadata.inlineStyles || '';

    return `<!DOCTYPE html>
<html lang="${metadata.language || 'vi'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} - ${this.escapeHtml(metadata.siteName || '')}</title>
  <meta name="description" content="{metaDescription}">
  {robotsMeta}
  <link rel="icon" href="${this.escapeHtml(favicon)}">
  ${gscTag}<style>${styles}
${ARTICLE_CSS}</style>
</head>
<body>
  ${metadata.headerHtml || ''}

  <main class="article-content">
    <nav class="breadcrumb">
      <a href="/">Trang chủ</a> ›
      <a href="/{category}/">{categoryName}</a> ›
      <span>{title}</span>
    </nav>
    <article>
      <h1>{title}</h1>
      <div class="article-body">
        {content}
      </div>
    </article>
  </main>

  ${metadata.footerHtml || ''}
</body>
</html>
`;
  }

  renderArticle(
    template: string,
    post: { title: string; content: string; metaDescription: string },
    category: string,
    options: { noindex?: boolean } = {},
  ): string {
    const categoryName = category
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const robotsMeta = options.noindex
      ? '<meta name="robots" content="noindex, nofollow">'
      : '<meta name="robots" content="index, follow">';

    let tpl = template;
    if (!tpl.includes('{robotsMeta}')) {
      // Template scanned before the robotsMeta placeholder existed — inject into <head>
      tpl = tpl.replace(/<head>/i, `<head>\n  {robotsMeta}`);
    }

    return this.replaceAll(tpl, {
      '{title}': this.escapeHtml(post.title),
      '{metaDescription}': this.escapeHtml(post.metaDescription),
      '{category}': category,
      '{categoryName}': this.escapeHtml(categoryName),
      '{content}': post.content,
      '{robotsMeta}': robotsMeta,
    });
  }

  async renderPreview(websiteId: string): Promise<string> {
    const metadata = await this.findByWebsite(websiteId);
    if (!metadata) throw new NotFoundException('Metadata not found — run a scan first');

    return this.renderArticle(
      metadata.articleTemplate,
      {
        title: 'Bài viết mẫu — Preview Template',
        metaDescription: 'Đây là meta description mẫu để preview article template.',
        content:
          '<p>Đây là đoạn mở đầu của bài viết mẫu. Nội dung này chỉ dùng để preview template của website.</p>' +
          '<p>Đoạn thứ hai chứa một <a href="https://example.com">backlink mẫu</a> minh họa vị trí backlink trong bài.</p>' +
          '<p>Đoạn kết luận của bài viết mẫu.</p>',
      },
      metadata.navCategories.includes(DEFAULT_CATEGORY)
        ? DEFAULT_CATEGORY
        : metadata.navCategories[0] || DEFAULT_CATEGORY,
      { noindex: true },
    );
  }

  private replaceAll(template: string, replacements: Record<string, string>): string {
    let result = template;
    for (const [placeholder, value] of Object.entries(replacements)) {
      result = result.split(placeholder).join(value);
    }
    return result;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private extractTag(html: string, tag: string): string {
    const match = html.match(new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, 'i'))
      || html.match(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'i'));
    return match ? match[0] : '';
  }

  private extractStyles(html: string): string {
    const matches = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
    return matches
      .map((block) => block.replace(/<style[^>]*>/i, '').replace(/<\/style>/i, ''))
      .join('\n');
  }

  private parseCssVariables(css: string): Record<string, string> {
    const vars: Record<string, string> = {};
    const regex = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
    let match;
    while ((match = regex.exec(css)) !== null) {
      vars[match[1]] = match[2].trim();
    }
    return vars;
  }

  private detectLanguage(html: string): string {
    const langMatch = html.match(/<html[^>]*\slang=["']([a-zA-Z-]+)["']/i);
    if (langMatch) return langMatch[1].toLowerCase().split('-')[0];
    // Heuristic: Vietnamese diacritics in content
    return /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữự]/i.test(html) ? 'vi' : 'en';
  }

  private extractSiteName(html: string, domain: string): string {
    const ogMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
    if (ogMatch) return ogMatch[1].trim();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      // Take the part before common separators: "Page - Site" → "Site" heuristic is risky, keep full title's last segment
      const title = titleMatch[1].trim();
      const parts = title.split(/\s*[|\-–]\s*/);
      return parts.length > 1 ? parts[parts.length - 1] : title;
    }
    return domain;
  }

  private extractMeta(html: string, name: string): string | null {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = html.match(new RegExp(`<meta[^>]*name=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'))
      || html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${escaped}["']`, 'i'));
    return match ? match[1].trim() : null;
  }

  private extractFavicon(html: string): string | null {
    const match = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
      || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
    return match ? match[1].trim() : null;
  }

  private extractLogo(headerHtml: string): string | null {
    if (!headerHtml) return null;
    const imgMatches = headerHtml.match(/<img[^>]+>/gi) || [];
    for (const img of imgMatches) {
      if (/(?:class|alt|id)=["'][^"']*logo[^"']*["']/i.test(img)) {
        const srcMatch = img.match(/src=["']([^"']+)["']/i);
        if (srcMatch) return srcMatch[1];
      }
    }
    const firstImg = imgMatches[0]?.match(/src=["']([^"']+)["']/i);
    return firstImg ? firstImg[1] : null;
  }
}
