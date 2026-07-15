export interface IBacklink {
  anchorText: string;
  targetUrl: string;
  rel: string | null;
  hideBacklink: boolean;
}

export interface IGuestPost {
  _id: string;
  title: string;
  slug: string;
  content: string;
  metaDescription: string;
  category: string;
  anchorText: string;
  targetUrl: string;
  rel: string | null;
  /** Backlink phụ (ngoài backlink chính) — chung expiration với post */
  extraBacklinks: IBacklink[];
  status: 'pending' | 'active' | 'disabled' | 'expired';
  /** false = noindex + không vào sitemap (mặc định); true = cho index + vào sitemap */
  realPublic: boolean;
  /** true = backlink được chèn nhưng ẩn bằng display:none (ẩn tạm khi lên prod) */
  hideBacklink: boolean;
  source: 'admin' | 'sale';
  expiresAt: Date | null;
  wordCount: number;
  contentSource: 'manual' | 'ai';
  /** Tham số AI generation — worker dùng để generate bài riêng cho từng website khi deploy */
  aiTopic: string | null;
  aiWordCount: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGuestPostDeployment {
  _id: string;
  guestPostId: string;
  websiteId: string;
  filePath: string;
  pagePath: string;
  category: string;
  status: 'deployed' | 'failed' | 'removed';
  deployedAt: Date | null;
  /** Lần deploy đầu tiên — dùng làm datePublished (SEO) */
  firstDeployedAt: Date | null;
  removedAt: Date | null;
  lastVerifiedAt: Date | null;
  errorMessage: string | null;
  addedToSitemap: boolean;
  /** true = backlink đã gỡ khỏi bài (post expired) nhưng bài viết vẫn sống trên site */
  backlinkRemoved: boolean;
  internalLinksCount: number;
  /** Nội dung AI sinh riêng cho website này (null = dùng content chung của guest post) */
  title: string | null;
  content: string | null;
  metaDescription: string | null;
  wordCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWebsiteMetadata {
  _id: string;
  websiteId: string;
  siteName: string;
  siteDescription: string;
  language: string;
  navCategories: string[];
  /** Thẻ <link rel="stylesheet"> của homepage — nhúng vào article template */
  stylesheetLinks: string[];
  /** 'detail-page' = template từ trang bài viết thật của site; 'homepage' = fallback dựng từ header/footer */
  templateSource: 'detail-page' | 'homepage';
  templateSamplePath: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  hasSitemap: boolean;
  sitemapPath: string | null;
  lastScannedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
