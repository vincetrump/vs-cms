export interface IWebsite {
  _id: string;
  domain: string;
  cloudflareZoneId: string;
  serverIp: string;
  documentRoot: string | null;
  homepagePath: string | null;
  status: 'active' | 'unreachable' | 'not_configured';
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
