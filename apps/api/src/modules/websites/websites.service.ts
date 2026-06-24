import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Website, WebsiteDocument } from './schemas/website.schema';
import { ParsedQuery } from '../../common/pipes/parse-query.pipe';

@Injectable()
export class WebsitesService {
  constructor(
    @InjectModel(Website.name) private websiteModel: Model<WebsiteDocument>,
  ) {}

  async findAll(query: ParsedQuery) {
    const [data, total] = await Promise.all([
      this.websiteModel
        .find(query.filter)
        .sort(query.sort)
        .skip(query.skip)
        .limit(query.limit)
        .exec(),
      this.websiteModel.countDocuments(query.filter).exec(),
    ]);
    return { data, total };
  }

  async findAllActive() {
    return this.websiteModel.find({ status: 'active' }).exec();
  }

  async findById(id: string) {
    return this.websiteModel.findById(id).exec();
  }

  async findByDomain(domain: string) {
    return this.websiteModel.findOne({ domain }).exec();
  }

  async upsertByDomain(domain: string, data: Partial<Website>) {
    return this.websiteModel.findOneAndUpdate(
      { domain },
      { $set: { ...data, lastSyncedAt: new Date() } },
      { upsert: true, new: true },
    );
  }

  async updateStatus(id: string, status: string) {
    return this.websiteModel.findByIdAndUpdate(id, { status }, { new: true });
  }

  async updateScanResults(
    id: string,
    data: {
      externalLinks: Array<{ url: string; anchorText: string }>;
      deployedLinkCount: number;
    },
  ) {
    return this.websiteModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true },
    );
  }

  async updateDeployedLinkCount(id: string, count: number) {
    return this.websiteModel.findByIdAndUpdate(
      id,
      { $set: { deployedLinkCount: count } },
      { new: true },
    );
  }

  async count() {
    return this.websiteModel.countDocuments().exec();
  }

  async countByStatus(status: string) {
    return this.websiteModel.countDocuments({ status }).exec();
  }
}
