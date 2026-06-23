export enum TextLinkStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  DISABLED = 'disabled',
  EXPIRED = 'expired',
}

export enum DeploymentStatus {
  DEPLOYED = 'deployed',
  FAILED = 'failed',
  PENDING_REMOVAL = 'pending_removal',
  REMOVED = 'removed',
}

export enum WebsiteStatus {
  ACTIVE = 'active',
  UNREACHABLE = 'unreachable',
  NOT_CONFIGURED = 'not_configured',
}

export enum TextLinkSource {
  ADMIN = 'admin',
  API = 'api',
}

export const VS_CMS_LINK_SECTION_ID = 'vs-cms-links';
export const VS_CMS_MARKER_PREFIX = 'vs-cms:';
