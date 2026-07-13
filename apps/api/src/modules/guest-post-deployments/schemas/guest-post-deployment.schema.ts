import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GuestPostDeploymentDocument = HydratedDocument<GuestPostDeployment>;

@Schema({ timestamps: true })
export class GuestPostDeployment {
  @Prop({ type: Types.ObjectId, ref: 'GuestPost', required: true })
  guestPostId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Website', required: true })
  websiteId: Types.ObjectId;

  @Prop({ default: '' })
  filePath: string;

  @Prop({ default: '' })
  pagePath: string;

  @Prop({ default: '' })
  category: string;

  @Prop({ default: 'deployed' })
  status: string;

  @Prop({ type: Date, default: null })
  deployedAt: Date | null;

  // Lần deploy đầu tiên — dùng làm datePublished (SEO), không đổi khi redeploy
  @Prop({ type: Date, default: null })
  firstDeployedAt: Date | null;

  @Prop({ type: Date, default: null })
  removedAt: Date | null;

  // Nội dung AI sinh riêng cho website này (null = dùng content chung của guest post)
  @Prop({ type: String, default: null })
  title: string | null;

  @Prop({ type: String, default: null })
  content: string | null;

  @Prop({ type: String, default: null })
  metaDescription: string | null;

  @Prop({ default: 0 })
  wordCount: number;

  @Prop({ type: Date, default: null })
  lastVerifiedAt: Date | null;

  @Prop({ type: String, default: null })
  errorMessage: string | null;

  @Prop({ default: false })
  addedToSitemap: boolean;

  // true = backlink đã bị gỡ khỏi bài (post expired) nhưng bài viết vẫn sống trên site
  @Prop({ default: false })
  backlinkRemoved: boolean;

  @Prop({ default: 0 })
  internalLinksCount: number;

  // File paths trên website này nơi đã chèn internal link trỏ đến bài viết này
  @Prop({ type: [String], default: [] })
  internalLinkSourceFiles: string[];
}

export const GuestPostDeploymentSchema = SchemaFactory.createForClass(GuestPostDeployment);
GuestPostDeploymentSchema.index({ guestPostId: 1, websiteId: 1 }, { unique: true });
GuestPostDeploymentSchema.index({ guestPostId: 1 });
GuestPostDeploymentSchema.index({ websiteId: 1, status: 1 });
