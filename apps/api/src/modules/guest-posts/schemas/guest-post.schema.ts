import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GuestPostDocument = HydratedDocument<GuestPost>;

@Schema({ timestamps: true })
export class GuestPost {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  slug: string;

  @Prop({ required: true })
  content: string;

  @Prop({ required: true })
  metaDescription: string;

  @Prop({ required: true })
  category: string;

  @Prop({ required: true })
  anchorText: string;

  @Prop({ required: true })
  targetUrl: string;

  @Prop({ type: String, default: null })
  rel: string | null;

  @Prop({ default: 'pending' })
  status: string;

  // false = deploy với meta robots noindex + không đưa vào sitemap; true = cho index + vào sitemap
  @Prop({ default: false })
  realPublic: boolean;

  @Prop({ default: 'admin' })
  source: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;

  @Prop({ type: [String], default: [] })
  requestedWebsiteIds: string[];

  @Prop({ default: 0 })
  wordCount: number;

  @Prop({ default: 'manual' })
  contentSource: string;
}

export const GuestPostSchema = SchemaFactory.createForClass(GuestPost);
GuestPostSchema.index({ status: 1 });
GuestPostSchema.index({ expiresAt: 1 });
GuestPostSchema.index({ createdBy: 1 });
GuestPostSchema.index({ slug: 1 });
