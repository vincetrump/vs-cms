export interface IApiKey {
  _id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  hmacSecret: string;
  isActive: boolean;
  rateLimit: number;
  createdAt: Date;
  updatedAt: Date;
}
