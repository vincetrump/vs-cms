export interface IWebsite {
  _id: string;
  domain: string;
  cloudflareZoneId: string;
  serverIp: string;
  documentRoot: string | null;
  homepagePath: string | null;
  status: 'active' | 'unreachable' | 'not_configured';
  deployedFooterLinkCount: number;
  totalSubPages: number;
  lastPageScanAt: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWebsitePage {
  _id: string;
  websiteId: string;
  pagePath: string;
  filePath: string;
  hasFooter: boolean;
  footerLinkCount: number;
  lastScannedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
