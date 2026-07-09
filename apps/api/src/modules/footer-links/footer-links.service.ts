import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FooterLink, FooterLinkDocument } from './schemas/footer-link.schema';
import { ParsedQuery } from '../../common/pipes/parse-query.pipe';

@Injectable()
export class FooterLinksService {
  constructor(
    @InjectModel(FooterLink.name) private footerLinkModel: Model<FooterLinkDocument>,
  ) {}

  async findAll(query: ParsedQuery) {
    const [data, total] = await Promise.all([
      this.footerLinkModel
        .find(query.filter)
        .populate('createdBy', 'username role')
        .sort(query.sort)
        .skip(query.skip)
        .limit(query.limit)
        .exec(),
      this.footerLinkModel.countDocuments(query.filter).exec(),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    return this.footerLinkModel.findById(id).populate('createdBy', 'username role').exec();
  }

  async create(data: Partial<FooterLink>) {
    return this.footerLinkModel.create(data);
  }

  async update(id: string, data: Partial<FooterLink>) {
    return this.footerLinkModel.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async delete(id: string) {
    return this.footerLinkModel.findByIdAndDelete(id).exec();
  }

  async findExpired() {
    return this.footerLinkModel
      .find({ status: 'active', expiresAt: { $lte: new Date() } })
      .exec();
  }

  async countByStatus(status: string) {
    return this.footerLinkModel.countDocuments({ status }).exec();
  }

  async countExpiringWithinDays(days: number) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    return this.footerLinkModel
      .countDocuments({
        status: 'active',
        expiresAt: { $lte: futureDate, $gte: new Date() },
      })
      .exec();
  }
}
