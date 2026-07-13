import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WebsiteMetadataDocument = HydratedDocument<WebsiteMetadata>;

@Schema({ timestamps: true, collection: 'websitemetadata' })
export class WebsiteMetadata {
  @Prop({ type: Types.ObjectId, ref: 'Website', required: true, unique: true })
  websiteId: Types.ObjectId;

  @Prop({ default: '' })
  siteName: string;

  @Prop({ default: '' })
  siteDescription: string;

  @Prop({ default: 'vi' })
  language: string;

  @Prop({ default: '' })
  headerHtml: string;

  @Prop({ default: '' })
  footerHtml: string;

  @Prop({ type: [String], default: [] })
  navCategories: string[];

  @Prop({ default: '' })
  inlineStyles: string;

  // Thẻ <link rel="stylesheet"> của homepage (nhiều site không dùng inline style) — nhúng vào article template
  @Prop({ type: [String], default: [] })
  stylesheetLinks: string[];

  // Nguồn build template: 'detail-page' (khung từ trang bài viết thật của site — chuẩn nhất)
  // hoặc 'homepage' (dựng lại từ header/footer homepage — fallback)
  @Prop({ default: 'homepage' })
  templateSource: string;

  @Prop({ type: String, default: null })
  templateSamplePath: string | null;

  @Prop({ type: Object, default: {} })
  cssVariables: Record<string, string>;

  @Prop({ type: String, default: null })
  logoUrl: string | null;

  @Prop({ type: String, default: null })
  faviconUrl: string | null;

  @Prop({ type: String, default: null })
  gscVerificationKey: string | null;

  @Prop({ default: false })
  hasSitemap: boolean;

  @Prop({ type: String, default: null })
  sitemapPath: string | null;

  @Prop({ default: '' })
  articleTemplate: string;

  @Prop({ type: Date, default: null })
  lastScannedAt: Date | null;
}

export const WebsiteMetadataSchema = SchemaFactory.createForClass(WebsiteMetadata);
