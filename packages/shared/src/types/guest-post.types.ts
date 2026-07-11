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
  status: 'pending' | 'active' | 'disabled' | 'expired';
  /** false = noindex + không vào sitemap (mặc định); true = cho index + vào sitemap */
  realPublic: boolean;
  source: 'admin' | 'sale';
  expiresAt: Date | null;
  wordCount: number;
  contentSource: 'manual' | 'ai';
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
  removedAt: Date | null;
  lastVerifiedAt: Date | null;
  errorMessage: string | null;
  addedToSitemap: boolean;
  internalLinksCount: number;
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
  logoUrl: string | null;
  faviconUrl: string | null;
  hasSitemap: boolean;
  sitemapPath: string | null;
  lastScannedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
