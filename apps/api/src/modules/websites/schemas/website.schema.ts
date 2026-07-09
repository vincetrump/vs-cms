import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WebsiteDocument = HydratedDocument<Website>;

@Schema({ timestamps: true })
export class Website {
  @Prop({ required: true, unique: true })
  domain: string;

  @Prop({ type: String, default: null })
  cloudflareZoneId: string | null;

  @Prop({ type: String, default: null })
  cloudflareAccountId: string | null;

  @Prop({ default: '68.183.188.19' })
  serverIp: string;

  @Prop({ type: String, default: null })
  documentRoot: string | null;

  @Prop({ type: String, default: null })
  homepagePath: string | null;

  @Prop({ default: 'not_configured' })
  status: string;

  @Prop({ type: String, default: null })
  dnsStatus: string | null;

  @Prop({ type: [String], default: [] })
  dnsRecordIps: string[];

  @Prop({ type: Boolean, default: null })
  dnsProxied: boolean | null;

  @Prop({ type: Number, default: 0 })
  deployedLinkCount: number;

  @Prop({
    type: [{ url: { type: String }, anchorText: { type: String }, _id: false }],
    default: [],
  })
  externalLinks: Array<{ url: string; anchorText: string }>;

  @Prop({ type: Date, default: null })
  lastSyncedAt: Date | null;

  @Prop({ type: Number, default: 0 })
  deployedFooterLinkCount: number;

  @Prop({ type: Number, default: 0 })
  totalSubPages: number;

  @Prop({ type: Date, default: null })
  lastPageScanAt: Date | null;
}

export const WebsiteSchema = SchemaFactory.createForClass(Website);
