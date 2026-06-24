import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ApiKeyDocument = HydratedDocument<ApiKey>;

@Schema({ timestamps: true })
export class ApiKey {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  keyHash: string;

  @Prop({ required: true })
  keyPrefix: string;

  @Prop({ required: true })
  hmacSecret: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 60 })
  rateLimit: number;

  @Prop({ type: Date, default: null })
  lastUsedAt: Date | null;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);
ApiKeySchema.index({ keyPrefix: 1 });
ApiKeySchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    delete ret.keyHash;
    delete ret.hmacSecret;
    return ret;
  },
});
