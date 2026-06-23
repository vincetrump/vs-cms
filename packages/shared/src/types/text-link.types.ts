export interface ITextLink {
  _id: string;
  title: string;
  anchorText: string;
  targetUrl: string;
  status: 'pending' | 'active' | 'disabled' | 'expired';
  source: 'admin' | 'api';
  apiKeyId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILinkDeployment {
  _id: string;
  textLinkId: string;
  websiteId: string;
  status: 'deployed' | 'failed' | 'pending_removal' | 'removed';
  deployedAt: Date | null;
  removedAt: Date | null;
  lastVerifiedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}
