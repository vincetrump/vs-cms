import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TextLink, TextLinkDocument } from './schemas/text-link.schema';
import { ParsedQuery } from '../../common/pipes/parse-query.pipe';

@Injectable()
export class TextLinksService {
  constructor(
    @InjectModel(TextLink.name) private textLinkModel: Model<TextLinkDocument>,
  ) {}

  async findAll(query: ParsedQuery) {
    const [data, total] = await Promise.all([
      this.textLinkModel
        .find(query.filter)
        .sort(query.sort)
        .skip(query.skip)
        .limit(query.limit)
        .exec(),
      this.textLinkModel.countDocuments(query.filter).exec(),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    return this.textLinkModel.findById(id).exec();
  }

  async create(data: Partial<TextLink>) {
    return this.textLinkModel.create(data);
  }

  async update(id: string, data: Partial<TextLink>) {
    return this.textLinkModel.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async delete(id: string) {
    return this.textLinkModel.findByIdAndDelete(id).exec();
  }

  async findExpired() {
    return this.textLinkModel
      .find({ status: 'active', expiresAt: { $lte: new Date() } })
      .exec();
  }

  async count() {
    return this.textLinkModel.countDocuments().exec();
  }

  async countByStatus(status: string) {
    return this.textLinkModel.countDocuments({ status }).exec();
  }

  async countExpiringWithinDays(days: number) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    return this.textLinkModel
      .countDocuments({
        status: 'active',
        expiresAt: { $lte: futureDate, $gte: new Date() },
      })
      .exec();
  }
}
