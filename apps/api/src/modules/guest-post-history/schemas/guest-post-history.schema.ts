import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GuestPostHistoryDocument = HydratedDocument<GuestPostHistory>;

@Schema({ timestamps: true })
export class GuestPostHistory {
  @Prop({ type: Types.ObjectId, ref: 'GuestPost', required: true, index: true })
  guestPostId: Types.ObjectId;

  @Prop({ required: true })
  action: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  performedBy: Types.ObjectId | null;

  @Prop({ type: Object, default: {} })
  changes: Record<string, { old: any; new: any }>;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const GuestPostHistorySchema = SchemaFactory.createForClass(GuestPostHistory);
GuestPostHistorySchema.index({ guestPostId: 1, createdAt: -1 });
