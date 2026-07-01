import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TextLinkHistory, TextLinkHistoryDocument } from './schemas/text-link-history.schema';

@Injectable()
export class TextLinkHistoryService {
  constructor(
    @InjectModel(TextLinkHistory.name) private historyModel: Model<TextLinkHistoryDocument>,
  ) {}

  async log(data: {
    textLinkId: string;
    action: string;
    performedBy?: string;
    changes?: Record<string, { old: any; new: any }>;
    metadata?: Record<string, any>;
  }) {
    return this.historyModel.create({
      textLinkId: new Types.ObjectId(data.textLinkId),
      action: data.action,
      performedBy: data.performedBy ? new Types.ObjectId(data.performedBy) : null,
      changes: data.changes || {},
      metadata: data.metadata || {},
    });
  }

  async findByTextLink(textLinkId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.historyModel
        .find({ textLinkId: new Types.ObjectId(textLinkId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('performedBy', 'username')
        .lean(),
      this.historyModel.countDocuments({ textLinkId: new Types.ObjectId(textLinkId) }),
    ]);
    return { data, total, page, limit };
  }
}
