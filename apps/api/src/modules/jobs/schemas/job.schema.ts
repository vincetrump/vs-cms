import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type JobDocument = HydratedDocument<Job>;

@Schema({ timestamps: true })
export class JobLogEntry {
  @Prop({ required: true })
  timestamp: Date;

  @Prop({ required: true })
  level: string;

  @Prop({ required: true })
  message: string;
}

const JobLogEntrySchema = SchemaFactory.createForClass(JobLogEntry);

@Schema({ timestamps: true })
export class Job {
  @Prop({ required: true })
  type: string;

  @Prop({ default: 'pending' })
  status: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  params: Record<string, any>;

  @Prop({ default: 0 })
  progressCurrent: number;

  @Prop({ default: 0 })
  progressTotal: number;

  @Prop({ type: [JobLogEntrySchema], default: [] })
  logs: JobLogEntry[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  result: Record<string, any> | null;

  @Prop({ type: String, default: null })
  error: string | null;

  @Prop({ type: Date, default: null })
  startedAt: Date | null;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;
}

export const JobSchema = SchemaFactory.createForClass(Job);
JobSchema.index({ status: 1, createdAt: 1 });
JobSchema.index({ type: 1 });
