import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WebsitePageDocument = HydratedDocument<WebsitePage>;

@Schema({ timestamps: true })
export class WebsitePage {
  @Prop({ type: Types.ObjectId, ref: 'Website', required: true })
  websiteId: Types.ObjectId;

  @Prop({ required: true })
  pagePath: string;

  @Prop({ required: true })
  filePath: string;

  @Prop({ default: false })
  hasFooter: boolean;

  @Prop({ default: 0 })
  footerLinkCount: number;

  @Prop({ type: Date, default: null })
  lastScannedAt: Date | null;
}

export const WebsitePageSchema = SchemaFactory.createForClass(WebsitePage);
WebsitePageSchema.index({ websiteId: 1, filePath: 1 }, { unique: true });
WebsitePageSchema.index({ websiteId: 1, hasFooter: 1, footerLinkCount: 1 });
