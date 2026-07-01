import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TextLinkHistoryDocument = HydratedDocument<TextLinkHistory>;

@Schema({ timestamps: true })
export class TextLinkHistory {
  @Prop({ type: Types.ObjectId, ref: 'TextLink', required: true, index: true })
  textLinkId: Types.ObjectId;

  @Prop({ required: true })
  action: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  performedBy: Types.ObjectId | null;

  @Prop({ type: Object, default: {} })
  changes: Record<string, { old: any; new: any }>;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const TextLinkHistorySchema = SchemaFactory.createForClass(TextLinkHistory);
TextLinkHistorySchema.index({ textLinkId: 1, createdAt: -1 });
