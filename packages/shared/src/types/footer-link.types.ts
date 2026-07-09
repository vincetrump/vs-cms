export interface IFooterLink {
  _id: string;
  title: string;
  anchorText: string;
  targetUrl: string;
  status: 'pending' | 'active' | 'disabled' | 'expired';
  source: 'admin' | 'sale';
  rel: string | null;
  pageCount: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFooterLinkDeployment {
  _id: string;
  footerLinkId: string;
  websiteId: string;
  filePath: string;
  pagePath: string;
  status: 'deployed' | 'failed' | 'removed';
  deployedAt: Date | null;
  removedAt: Date | null;
  lastVerifiedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}
