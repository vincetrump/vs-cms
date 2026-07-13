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

    // Header/footer được làm sạch: gỡ các link do VS-CMS quản lý (footer/text link trả phí
    // không được "đi ké" miễn phí vào guest post) + mọi link external khác
    const headerHtml = this.stripManagedAndExternalLinks(this.extractRegion(html, 'header'), website.domain);
    const footerHtml = this.stripManagedAndExternalLinks(this.extractRegion(html, 'footer'), website.domain);
    const inlineStyles = this.extractStyles(html);
    const stylesheetLinks = this.extractStylesheetLinks(html);
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
      stylesheetLinks,
      cssVariables,
      logoUrl,
      faviconUrl,
      gscVerificationKey,
      hasSitemap,
      sitemapPath: hasSitemap ? sitemapPath : null,
      lastScannedAt: new Date(),
    };

    // Ưu tiên build template từ TRANG DETAIL THẬT của site (giữ nguyên kiến trúc, không đoán);
    // site chưa có trang detail nào → fallback dựng từ header/footer homepage
    data.templateSource = 'homepage';
    data.templateSamplePath = null;
    try {
      const detailPaths = await this.sshService.findDetailPages(website.documentRoot, website.serverIp);
      for (const samplePath of detailPaths) {
        const detailHtml = await this.sshService.readFile(samplePath, website.serverIp);
        const tpl = this.buildTemplateFromDetailPage(detailHtml, website.domain, siteName);
        if (tpl) {
          data.articleTemplate = tpl;
          data.templateSource = 'detail-page';
          data.templateSamplePath = samplePath;
          break;
        }
      }
    } catch (err: any) {
      this.logger.warn(`${website.domain}: detail-page template failed (${err.message}) — fallback homepage builder`);
    }
    if (!data.articleTemplate) {
      data.articleTemplate = this.buildArticleTemplate(data);
    }

    const metadata = await this.metadataModel.findOneAndUpdate(
      { websiteId: new Types.ObjectId(websiteId) },
      { $set: data },
      { upsert: true, new: true },
    );

    this.logger.log(
      `Scanned metadata for ${website.domain}: ${navCategories.length} categories, sitemap=${hasSitemap}, template=${data.templateSource}`,
    );
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

  // Build template từ TRANG DETAIL THẬT của site — giữ nguyên 100% kiến trúc (head, CSS,
  // header, footer, sidebar, scripts...), chỉ thay title/meta/content bằng placeholder.
  // Trả về null nếu trang mẫu không đủ cấu trúc → caller fallback về homepage builder.
  buildTemplateFromDetailPage(html: string, domain: string, siteName: string): string | null {
    if (!html || !/<html[\s>]/i.test(html) || !/<head[\s>]/i.test(html)) return null;
    if (!/<title>[\s\S]*?<\/title>/i.test(html)) return null;

    // Gỡ link do VS-CMS quản lý + link external khỏi toàn bộ khung (bài mẫu có thể chứa
    // backlink gplink/ilink của guest post khác hoặc footer link)
    let tpl = this.stripManagedAndExternalLinks(html, domain);

    // --- HEAD: thay title + meta description, gỡ SEO tags của bài mẫu, chèn placeholder ---
    tpl = tpl.replace(/<title>[\s\S]*?<\/title>/i, `<title>{title} - ${this.escapeHtml(siteName)}</title>`);
    if (/<meta[^>]*name=["']description["'][^>]*>/i.test(tpl)) {
      tpl = tpl.replace(/<meta[^>]*name=["']description["'][^>]*>/i, '<meta name="description" content="{metaDescription}">');
    } else {
      tpl = tpl.replace(/<\/title>/i, '</title>\n  <meta name="description" content="{metaDescription}">');
    }
    tpl = tpl
      .replace(/\s*<meta[^>]*name=["']robots["'][^>]*>/gi, '')
      .replace(/\s*<link[^>]*rel=["']canonical["'][^>]*>/gi, '')
      .replace(/\s*<meta[^>]*property=["']og:[^"']*["'][^>]*>/gi, '')
      .replace(/\s*<meta[^>]*property=["']article:[^"']*["'][^>]*>/gi, '')
      .replace(/\s*<meta[^>]*name=["']twitter:[^"']*["'][^>]*>/gi, '')
      .replace(/\s*<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
    tpl = tpl.replace(/<head([^>]*)>/i, '<head$1>\n  {robotsMeta}\n  {seoMeta}');

    // --- BODY: thay ruột của content container bằng khối bài viết chuẩn ---
    const articleInner = `\n      <h1>{title}</h1>\n      {publishedDate}\n      <div class="article-body">\n        {content}\n      </div>\n    `;
    let swapped = this.replaceBalancedInner(tpl, /<(article)\b[^>]*>/i, () => articleInner);
    if (!swapped) {
      swapped = this.replaceBalancedInner(
        tpl,
        /<(main)\b[^>]*>/i,
        () => `\n    <article>${articleInner}</article>\n  `,
      );
    }
    if (!swapped) return null;
    tpl = swapped;

    // --- BREADCRUMB: thay bằng breadcrumb chuẩn (giữ thẻ + class của site); không có → chèn trước h1 ---
    const breadcrumbSwapped = this.replaceBalancedInner(
      tpl,
      /<(nav|div|ol|ul)\b[^>]*class=["'][^"']*breadcrumb[^"']*["'][^>]*>/i,
      (tag) =>
        tag === 'ol' || tag === 'ul'
          ? '<li><a href="/">Trang chủ</a></li><li><a href="/{category}/">{categoryName}</a></li><li>{title}</li>'
          : '<a href="/">Trang chủ</a> › <a href="/{category}/">{categoryName}</a> › <span>{title}</span>',
    );
    if (breadcrumbSwapped) {
      tpl = breadcrumbSwapped;
    } else {
      tpl = tpl.replace(
        '<h1>{title}</h1>',
        '<nav class="breadcrumb" style="font-size:14px;margin-bottom:20px;color:#666"><a href="/" style="color:inherit">Trang chủ</a> › <a href="/{category}/" style="color:inherit">{categoryName}</a> › <span>{title}</span></nav>\n      <h1>{title}</h1>',
      );
    }

    // CSS tối thiểu cho phần nội dung mới (không đè style của site)
    tpl = tpl.replace(
      /<\/head>/i,
      '<style>.article-body p{margin-bottom:1em;line-height:1.7}.article-body img{max-width:100%;height:auto}</style>\n</head>',
    );

    // --- VALIDATE: đủ placeholder mới dùng, thiếu → fallback homepage builder ---
    const required = ['{title}', '{metaDescription}', '{content}', '{robotsMeta}', '{seoMeta}', '<h1>{title}</h1>'];
    if (!required.every((p) => tpl.includes(p))) return null;
    return tpl;
  }

  buildArticleTemplate(metadata: Partial<WebsiteMetadata>): string {
    const gscTag = metadata.gscVerificationKey
      ? `<meta name="google-site-verification" content="${this.escapeHtml(metadata.gscVerificationKey)}">\n  `
      : '';
    const favicon = metadata.faviconUrl || '/favicon.ico';
    const styles = metadata.inlineStyles || '';
    // CSS ngoài của site (nhiều site không có inline style — thiếu dòng này bài viết sẽ trắng CSS)
    const cssLinks = metadata.stylesheetLinks?.length ? metadata.stylesheetLinks.join('\n  ') + '\n  ' : '';

    return `<!DOCTYPE html>
<html lang="${metadata.language || 'vi'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} - ${this.escapeHtml(metadata.siteName || '')}</title>
  <meta name="description" content="{metaDescription}">
  {robotsMeta}
  {seoMeta}
  <link rel="icon" href="${this.escapeHtml(favicon)}">
  ${cssLinks}${gscTag}<style>${styles}
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
      {publishedDate}
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
    options: {
      noindex?: boolean;
      canonicalUrl?: string;
      publishedAt?: Date;
      modifiedAt?: Date;
      siteName?: string;
      language?: string;
    } = {},
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
    if (!tpl.includes('{seoMeta}')) {
      // Template cũ chưa có SEO block (canonical/OG/JSON-LD) — chèn ngay sau robots meta
      tpl = tpl.replace('{robotsMeta}', '{robotsMeta}\n  {seoMeta}');
    }
    if (!tpl.includes('{publishedDate}')) {
      // Template cũ chưa có chỗ hiển thị ngày đăng — chèn ngay dưới h1
      tpl = tpl.replace('<h1>{title}</h1>', '<h1>{title}</h1>\n      {publishedDate}');
    }

    return this.replaceAll(tpl, {
      '{title}': this.escapeHtml(post.title),
      '{metaDescription}': this.escapeHtml(post.metaDescription),
      '{category}': category,
      '{categoryName}': this.escapeHtml(categoryName),
      '{content}': post.content,
      '{robotsMeta}': robotsMeta,
      '{seoMeta}': this.buildSeoMeta(post, options),
      '{publishedDate}': this.buildPublishedDateHtml(options),
    });
  }

  // Khối SEO tags: canonical + Open Graph + Twitter card + JSON-LD Article
  private buildSeoMeta(
    post: { title: string; metaDescription: string },
    options: { canonicalUrl?: string; publishedAt?: Date; modifiedAt?: Date; siteName?: string; language?: string },
  ): string {
    const parts: string[] = [];
    const title = this.escapeHtml(post.title);
    const description = this.escapeHtml(post.metaDescription);

    if (options.canonicalUrl) {
      parts.push(`<link rel="canonical" href="${this.escapeHtml(options.canonicalUrl)}">`);
    }
    parts.push('<meta property="og:type" content="article">');
    parts.push(`<meta property="og:title" content="${title}">`);
    parts.push(`<meta property="og:description" content="${description}">`);
    if (options.canonicalUrl) {
      parts.push(`<meta property="og:url" content="${this.escapeHtml(options.canonicalUrl)}">`);
    }
    if (options.siteName) {
      parts.push(`<meta property="og:site_name" content="${this.escapeHtml(options.siteName)}">`);
    }
    const locale = options.language === 'vi' ? 'vi_VN' : options.language === 'en' ? 'en_US' : null;
    if (locale) {
      parts.push(`<meta property="og:locale" content="${locale}">`);
    }
    if (options.publishedAt) {
      parts.push(`<meta property="article:published_time" content="${options.publishedAt.toISOString()}">`);
    }
    if (options.modifiedAt) {
      parts.push(`<meta property="article:modified_time" content="${options.modifiedAt.toISOString()}">`);
    }
    parts.push('<meta name="twitter:card" content="summary">');

    const jsonLd: Record<string, any> = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.metaDescription,
    };
    if (options.canonicalUrl) {
      jsonLd.mainEntityOfPage = { '@type': 'WebPage', '@id': options.canonicalUrl };
    }
    if (options.publishedAt) jsonLd.datePublished = options.publishedAt.toISOString();
    if (options.modifiedAt) jsonLd.dateModified = options.modifiedAt.toISOString();
    if (options.siteName) {
      jsonLd.publisher = { '@type': 'Organization', name: options.siteName };
      jsonLd.author = { '@type': 'Organization', name: options.siteName };
    }
    // Escape "<" để tránh "</script>" trong dữ liệu phá vỡ thẻ script
    parts.push(`<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`);

    return parts.join('\n  ');
  }

  // Dòng ngày đăng hiển thị dưới h1 (inline style để không phụ thuộc CSS của template cũ)
  private buildPublishedDateHtml(options: { publishedAt?: Date; language?: string }): string {
    if (!options.publishedAt) return '';
    const isVi = (options.language || 'vi') === 'vi';
    const dateStr = options.publishedAt.toLocaleDateString(isVi ? 'vi-VN' : 'en-US', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const label = isVi ? 'Ngày đăng' : 'Published';
    return `<p class="article-date" style="color:#888;font-size:14px;margin:4px 0 16px">${label}: ${dateStr}</p>`;
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
      {
        noindex: true,
        publishedAt: new Date(),
        siteName: metadata.siteName,
        language: metadata.language,
      },
    );
  }

  // Thay thế MỘT LƯỢT duy nhất — giá trị đã thay không bị quét lại, nên content/meta chứa
  // chuỗi trùng placeholder (ví dụ "{content}") không thể phá vỡ head/body của trang
  private replaceAll(template: string, replacements: Record<string, string>): string {
    const pattern = Object.keys(replacements)
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    return template.replace(new RegExp(pattern, 'g'), (m) => replacements[m] ?? m);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Nhiều site không dùng thẻ semantic <header>/<footer> mà dùng <div class="...header...">.
  // Fallback: tìm phần tử có class/id chứa keyword — header lấy phần tử ĐẦU TIÊN (header luôn
  // ở đầu trang), footer lấy phần tử CUỐI CÙNG (tránh nhầm các "card-footer" giữa trang).
  private extractRegion(html: string, name: 'header' | 'footer'): string {
    const semantic = this.extractTag(html, name);
    if (semantic) return semantic;
    return this.extractBalancedByClass(html, name, name === 'header' ? 'first' : 'last');
  }

  private extractBalancedByClass(html: string, keyword: string, pick: 'first' | 'last'): string {
    const openRegex = new RegExp(`<(div|section|nav)\\b[^>]*(?:class|id)=["'][^"']*${keyword}[^"']*["'][^>]*>`, 'gi');
    const candidates: Array<{ index: number; tag: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = openRegex.exec(html))) {
      candidates.push({ index: m.index, tag: m[1].toLowerCase() });
    }
    if (!candidates.length) return '';
    const chosen = pick === 'first' ? candidates[0] : candidates[candidates.length - 1];
    const close = this.findBalancedClose(html, chosen.index, chosen.tag);
    return close ? html.slice(chosen.index, close.closeEnd) : '';
  }

  // Quét đếm thẻ mở/đóng cùng loại từ vị trí fromIndex để tìm thẻ đóng cân bằng
  // (regex non-greedy sẽ đứt ở thẻ con đầu tiên)
  private findBalancedClose(html: string, fromIndex: number, tag: string): { closeStart: number; closeEnd: number } | null {
    const tokenRegex = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, 'gi');
    tokenRegex.lastIndex = fromIndex;
    let depth = 0;
    let token: RegExpExecArray | null;
    while ((token = tokenRegex.exec(html))) {
      if (token[0].startsWith('</')) {
        depth--;
        if (depth === 0) {
          return { closeStart: token.index, closeEnd: token.index + token[0].length };
        }
      } else if (!token[0].endsWith('/>')) {
        depth++;
      }
    }
    return null;
  }

  // Thay toàn bộ phần con của phần tử đầu tiên khớp openRegex (giữ nguyên thẻ mở + class của site)
  private replaceBalancedInner(
    html: string,
    openRegex: RegExp,
    innerFor: (tag: string) => string,
  ): string | null {
    const m = openRegex.exec(html);
    if (!m) return null;
    const tag = m[1].toLowerCase();
    const close = this.findBalancedClose(html, m.index, tag);
    if (!close) return null;
    return html.slice(0, m.index + m[0].length) + innerFor(tag) + html.slice(close.closeStart);
  }

  private extractTag(html: string, tag: string): string {
    const match = html.match(new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, 'i'))
      || html.match(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'i'));
    return match ? match[0] : '';
  }

  // Làm sạch header/footer trước khi đưa vào article template:
  // 1. Gỡ các block link do VS-CMS quản lý (<!-- vs-cms*:{id} -->...) — footer/text link là link
  //    trả phí theo trang, không được nhân bản miễn phí vào mọi bài guest post (và khi link
  //    hết hạn, bản copy trong guest post sẽ không được gỡ vì không được track)
  // 2. Gỡ mọi thẻ <a> external (khác domain của site) — chỉ giữ link nội bộ (nav, logo...)
  private stripManagedAndExternalLinks(html: string, domain: string): string {
    if (!html) return html;
    let out = html.replace(
      /\n?<!-- (vs-cms[a-z-]*):([a-f0-9]{24}) -->[\s\S]*?<!-- \/\1:\2 -->/gi,
      '',
    );
    const domainEsc = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const externalAnchor = new RegExp(
      `<a\\b[^>]*href=["'](?:https?:)?//(?!(?:www\\.)?${domainEsc}[/"'])[^"']*["'][^>]*>[\\s\\S]*?</a>`,
      'gi',
    );
    out = out.replace(externalAnchor, '');
    return out;
  }

  // Lấy các thẻ <link rel="stylesheet"> (+ preconnect cho web fonts) từ homepage —
  // nhiều site không dùng inline <style> nên template cần các link này mới có CSS.
  // Href tương đối được chuyển về root-absolute vì bài viết nằm sâu 2 cấp (/{category}/{slug}/).
  private extractStylesheetLinks(html: string): string[] {
    const links: string[] = [];
    const linkTags = html.match(/<link\b[^>]*>/gi) || [];
    for (const tag of linkTags) {
      const relMatch = tag.match(/\brel=["']([^"']+)["']/i);
      const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
      if (!relMatch || !hrefMatch) continue;
      const rel = relMatch[1].toLowerCase().trim();
      let href = hrefMatch[1].trim();
      if (rel !== 'stylesheet' && rel !== 'preconnect') continue;
      if (/^(javascript|data|vbscript):/i.test(href)) continue;
      if (!/^(https?:)?\/\//i.test(href) && !href.startsWith('/')) {
        href = '/' + href;
      }
      const mediaMatch = tag.match(/\bmedia=["']([^"']+)["']/i);
      const mediaAttr = mediaMatch ? ` media="${this.escapeHtml(mediaMatch[1])}"` : '';
      const crossoriginAttr = rel === 'preconnect' && /\bcrossorigin\b/i.test(tag) ? ' crossorigin' : '';
      links.push(`<link rel="${rel}" href="${this.escapeHtml(href)}"${mediaAttr}${crossoriginAttr}>`);
    }
    return links;
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
