import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LinkDeploymentDocument = HydratedDocument<LinkDeployment>;

@Schema({ timestamps: true })
export class LinkDeployment {
  @Prop({ type: Types.ObjectId, required: true, ref: 'TextLink' })
  textLinkId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Website' })
  websiteId: Types.ObjectId;

  @Prop({ default: 'deployed' })
  status: string;

  @Prop({ type: Date, default: null })
  deployedAt: Date | null;

  @Prop({ type: Date, default: null })
  removedAt: Date | null;

  @Prop({ type: Date, default: null })
  lastVerifiedAt: Date | null;

  @Prop({ type: String, default: null })
  errorMessage: string | null;
}

export const LinkDeploymentSchema = SchemaFactory.createForClass(LinkDeployment);
LinkDeploymentSchema.index({ textLinkId: 1, websiteId: 1 }, { unique: true });
LinkDeploymentSchema.index({ textLinkId: 1 });
LinkDeploymentSchema.index({ websiteId: 1 });
LinkDeploymentSchema.index({ status: 1 });
