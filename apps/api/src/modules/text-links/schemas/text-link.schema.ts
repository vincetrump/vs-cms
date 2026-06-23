import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TextLinkDocument = HydratedDocument<TextLink>;

@Schema({ timestamps: true })
export class TextLink {
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

  @Prop({ type: Types.ObjectId, default: null })
  apiKeyId: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  rel: string | null;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;
}

export const TextLinkSchema = SchemaFactory.createForClass(TextLink);
TextLinkSchema.index({ status: 1 });
TextLinkSchema.index({ expiresAt: 1 });
