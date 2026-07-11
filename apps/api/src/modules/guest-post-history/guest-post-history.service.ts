import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GuestPostHistory, GuestPostHistoryDocument } from './schemas/guest-post-history.schema';

@Injectable()
export class GuestPostHistoryService {
  constructor(
    @InjectModel(GuestPostHistory.name) private historyModel: Model<GuestPostHistoryDocument>,
  ) {}

  async log(data: {
    guestPostId: string;
    action: string;
    performedBy?: string;
    changes?: Record<string, { old: any; new: any }>;
    metadata?: Record<string, any>;
  }) {
    return this.historyModel.create({
      guestPostId: new Types.ObjectId(data.guestPostId),
      action: data.action,
      performedBy: data.performedBy ? new Types.ObjectId(data.performedBy) : null,
      changes: data.changes || {},
      metadata: data.metadata || {},
    });
  }

  async findByGuestPost(guestPostId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.historyModel
        .find({ guestPostId: new Types.ObjectId(guestPostId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('performedBy', 'username')
        .lean(),
      this.historyModel.countDocuments({ guestPostId: new Types.ObjectId(guestPostId) }),
    ]);
    return { data, total, page, limit };
  }
}
