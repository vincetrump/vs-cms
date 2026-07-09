import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FooterLinkDocument = HydratedDocument<FooterLink>;

@Schema({ timestamps: true })
export class FooterLink {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  anchorText: string;

  @Prop({ required: true })
  targetUrl: string;

  @Prop({ default: 'pending' })
  status: string;

  @Prop({ default: 'admin' })
  source: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  rel: string | null;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;

  @Prop({ type: Number, required: true, min: 1, max: 50 })
  pageCount: number;

  @Prop({ type: Boolean, default: false })
  includeHomepage: boolean;

  @Prop({ type: [String], default: [] })
  requestedWebsiteIds: string[];
}

export const FooterLinkSchema = SchemaFactory.createForClass(FooterLink);
FooterLinkSchema.index({ status: 1 });
FooterLinkSchema.index({ expiresAt: 1 });
