import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FooterLinkHistory, FooterLinkHistoryDocument } from './schemas/footer-link-history.schema';

@Injectable()
export class FooterLinkHistoryService {
  constructor(
    @InjectModel(FooterLinkHistory.name) private historyModel: Model<FooterLinkHistoryDocument>,
  ) {}

  async log(data: {
    footerLinkId: string;
    action: string;
    performedBy?: string;
    changes?: Record<string, { old: any; new: any }>;
    metadata?: Record<string, any>;
  }) {
    return this.historyModel.create({
      footerLinkId: new Types.ObjectId(data.footerLinkId),
      action: data.action,
      performedBy: data.performedBy ? new Types.ObjectId(data.performedBy) : null,
      changes: data.changes || {},
      metadata: data.metadata || {},
    });
  }

  async findByFooterLink(footerLinkId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.historyModel
        .find({ footerLinkId: new Types.ObjectId(footerLinkId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('performedBy', 'username')
        .lean(),
      this.historyModel.countDocuments({ footerLinkId: new Types.ObjectId(footerLinkId) }),
    ]);
    return { data, total, page, limit };
  }
}
