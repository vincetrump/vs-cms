import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GuestPost, GuestPostDocument } from './schemas/guest-post.schema';
import { ParsedQuery } from '../../common/pipes/parse-query.pipe';

@Injectable()
export class GuestPostsService {
  constructor(
    @InjectModel(GuestPost.name) private guestPostModel: Model<GuestPostDocument>,
  ) {}

  async findAll(query: ParsedQuery) {
    const [data, total] = await Promise.all([
      this.guestPostModel
        .find(query.filter)
        .populate('createdBy', 'username role')
        .sort(query.sort)
        .skip(query.skip)
        .limit(query.limit)
        .exec(),
      this.guestPostModel.countDocuments(query.filter).exec(),
    ]);
    return { data, total };
  }

  async findById(id: string) {
    return this.guestPostModel.findById(id).populate('createdBy', 'username role').exec();
  }

  async create(data: Partial<GuestPost>) {
    if (data.content) {
      data.content = this.sanitizeHtml(data.content);
      data.wordCount = this.countWords(data.content);
    }
    return this.guestPostModel.create(data);
  }

  async update(id: string, data: Partial<GuestPost>) {
    if (data.content) {
      data.content = this.sanitizeHtml(data.content);
      data.wordCount = this.countWords(data.content);
    }
    return this.guestPostModel.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async delete(id: string) {
    return this.guestPostModel.findByIdAndDelete(id).exec();
  }

  async findExpired() {
    return this.guestPostModel
      .find({ status: 'active', expiresAt: { $lte: new Date() } })
      .exec();
  }

  async countByStatus(status: string) {
    return this.guestPostModel.countDocuments({ status }).exec();
  }

  async countExpiringWithinDays(days: number) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    return this.guestPostModel
      .countDocuments({
        status: 'active',
        expiresAt: { $lte: futureDate, $gte: new Date() },
      })
      .exec();
  }

  slugify(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/[\s-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200) || 'bai-viet';
  }

  sanitizeHtml(html: string): string {
    let clean = html;
    // Strip <script>/<style>/<iframe>/<object>/<embed> blocks entirely
    clean = clean.replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '');
    clean = clean.replace(/<(script|style|iframe|object|embed)[^>]*\/?>/gi, '');
    // Strip on* event handler attributes
    clean = clean.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
    clean = clean.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
    clean = clean.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
    // Neutralize javascript:/data:/vbscript: URLs in href/src
    clean = clean.replace(
      /(href|src)\s*=\s*(["']?)\s*(javascript|vbscript|data)\s*:[^"'\s>]*\2/gi,
      '$1=$2#$2',
    );
    return clean;
  }

  countWords(html: string): number {
    const text = html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .trim();
    if (!text) return 0;
    return text.split(/\s+/).length;
  }

  // Tự sinh meta description khi user không nhập: cắt ~155 ký tự đầu của bài tại ranh giới từ
  deriveMetaDescription(html: string, fallback = ''): string {
    const text = html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return fallback.slice(0, 300);
    if (text.length <= 155) return text;
    const cut = text.slice(0, 155);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut) + '…';
  }
}
