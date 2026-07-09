import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FooterLinkDeploymentDocument = HydratedDocument<FooterLinkDeployment>;

@Schema({ timestamps: true })
export class FooterLinkDeployment {
  @Prop({ type: Types.ObjectId, ref: 'FooterLink', required: true })
  footerLinkId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Website', required: true })
  websiteId: Types.ObjectId;

  @Prop({ required: true })
  filePath: string;

  @Prop({ required: true })
  pagePath: string;

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

export const FooterLinkDeploymentSchema = SchemaFactory.createForClass(FooterLinkDeployment);
FooterLinkDeploymentSchema.index({ footerLinkId: 1 });
FooterLinkDeploymentSchema.index({ websiteId: 1 });
FooterLinkDeploymentSchema.index({ status: 1 });
FooterLinkDeploymentSchema.index({ footerLinkId: 1, websiteId: 1, filePath: 1 }, { unique: true });
