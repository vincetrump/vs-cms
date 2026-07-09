import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FooterLinkHistoryDocument = HydratedDocument<FooterLinkHistory>;

@Schema({ timestamps: true })
export class FooterLinkHistory {
  @Prop({ type: Types.ObjectId, ref: 'FooterLink', required: true, index: true })
  footerLinkId: Types.ObjectId;

  @Prop({ required: true })
  action: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  performedBy: Types.ObjectId | null;

  @Prop({ type: Object, default: {} })
  changes: Record<string, { old: any; new: any }>;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const FooterLinkHistorySchema = SchemaFactory.createForClass(FooterLinkHistory);
FooterLinkHistorySchema.index({ footerLinkId: 1, createdAt: -1 });
