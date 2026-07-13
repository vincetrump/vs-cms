import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job, JobDocument } from './schemas/job.schema';

@Injectable()
export class JobsService {
  constructor(@InjectModel(Job.name) private jobModel: Model<JobDocument>) {}

  async create(type: string, params: Record<string, any> = {}): Promise<JobDocument> {
    const job = await this.jobModel.create({ type, params });
    return job;
  }

  async findAll(query: { status?: string; type?: string; skip?: number; limit?: number } = {}) {
    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;

    const [data, total] = await Promise.all([
      this.jobModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(query.skip || 0)
        .limit(query.limit || 20)
        .exec(),
      this.jobModel.countDocuments(filter),
    ]);
    return { data, total };
  }

  async findById(id: string): Promise<JobDocument | null> {
    return this.jobModel.findById(id).exec();
  }

  async markRunning(id: string): Promise<void> {
    await this.jobModel.updateOne(
      { _id: id },
      { status: 'running', startedAt: new Date() },
    );
  }

  async markCompleted(id: string, result: Record<string, any> = {}): Promise<void> {
    await this.jobModel.updateOne(
      { _id: id },
      { status: 'completed', result, completedAt: new Date() },
    );
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.jobModel.updateOne(
      { _id: id },
      { status: 'failed', error, completedAt: new Date() },
    );
  }

  async addLog(id: string, level: string, message: string): Promise<void> {
    await this.jobModel.updateOne(
      { _id: id },
      { $push: { logs: { timestamp: new Date(), level, message } } },
    );
  }

  // Ghi nhiều dòng log một lần (dùng cho batch flush của JobConsoleLogger)
  async addLogs(id: string, entries: Array<{ timestamp: Date; level: string; message: string }>): Promise<void> {
    if (!entries.length) return;
    await this.jobModel.updateOne(
      { _id: id },
      { $push: { logs: { $each: entries } } },
    );
  }

  async updateProgress(id: string, current: number, total: number): Promise<void> {
    await this.jobModel.updateOne(
      { _id: id },
      { progressCurrent: current, progressTotal: total },
    );
  }

  async findNextPending(): Promise<JobDocument | null> {
    return this.jobModel
      .findOne({ status: 'pending' })
      .sort({ createdAt: 1 })
      .exec();
  }

  async hasRunningJob(): Promise<boolean> {
    const count = await this.jobModel.countDocuments({ status: 'running' });
    return count > 0;
  }

  async hasActiveJobsFor(paramKey: string, entityId: string): Promise<boolean> {
    const count = await this.jobModel.countDocuments({
      status: { $in: ['pending', 'running'] },
      [`params.${paramKey}`]: entityId,
    });
    return count > 0;
  }

  // Job đang thực sự chạy (không tính pending) — dùng để chặn xóa khi không thể ngắt
  async hasRunningJobFor(paramKey: string, entityId: string): Promise<boolean> {
    const count = await this.jobModel.countDocuments({
      status: 'running',
      [`params.${paramKey}`]: entityId,
    });
    return count > 0;
  }

  // Hủy các job PENDING (chưa chạy) của một entity, tùy chọn lọc theo type.
  // Dùng khi toggle/delete để tránh xếp hàng job mâu thuẫn/dư thừa. Job đang running không đụng tới.
  async cancelPendingJobsFor(paramKey: string, entityId: string, types?: string[]): Promise<number> {
    const filter: any = { status: 'pending', [`params.${paramKey}`]: entityId };
    if (types?.length) filter.type = { $in: types };
    const result = await this.jobModel.updateMany(filter, {
      status: 'cancelled',
      error: 'Superseded (cancelled by a newer action)',
      completedAt: new Date(),
    });
    return result.modifiedCount;
  }

  async resetAllRunning(): Promise<number> {
    const result = await this.jobModel.updateMany(
      { status: 'running' },
      { status: 'pending', error: null, startedAt: null },
    );
    return result.modifiedCount;
  }
}
