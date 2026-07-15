import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GuestPostDocument = HydratedDocument<GuestPost>;

// Backlink phụ (ngoài backlink chính anchorText/targetUrl/rel/hideBacklink của post).
// Chung expiration với post (không có expiresAt riêng).
@Schema({ _id: false })
export class Backlink {
  @Prop({ required: true })
  anchorText: string;

  @Prop({ required: true })
  targetUrl: string;

  @Prop({ type: String, default: null })
  rel: string | null;

  @Prop({ default: true })
  hideBacklink: boolean;
}
const BacklinkSchema = SchemaFactory.createForClass(Backlink);

@Schema({ timestamps: true })
export class GuestPost {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  slug: string;

  // Có thể rỗng với bài AI — nội dung thật sinh riêng cho từng website lúc deploy
  @Prop({ default: '' })
  content: string;

  @Prop({ default: '' })
  metaDescription: string;

  @Prop({ required: true })
  category: string;

  @Prop({ required: true })
  anchorText: string;

  @Prop({ required: true })
  targetUrl: string;

  @Prop({ type: String, default: null })
  rel: string | null;

  @Prop({ default: 'pending' })
  status: string;

  // false = deploy với meta robots noindex + không đưa vào sitemap; true = cho index + vào sitemap
  @Prop({ default: false })
  realPublic: boolean;

  // true = backlink vẫn được chèn nhưng bọc style="display:none" (ẩn tạm, ví dụ khi lên prod)
  // Mặc định ẩn — bật hiện khi bài đã ổn định trên prod
  @Prop({ default: true })
  hideBacklink: boolean;

  // Backlink phụ (tùy chọn) — chèn thêm ngoài backlink chính; chung expiration với post
  @Prop({ type: [BacklinkSchema], default: [] })
  extraBacklinks: Backlink[];

  @Prop({ default: 'admin' })
  source: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;

  @Prop({ type: [String], default: [] })
  requestedWebsiteIds: string[];

  @Prop({ default: 0 })
  wordCount: number;

  @Prop({ default: 'manual' })
  contentSource: string;

  // Tham số AI generation — lưu lại để worker generate bài riêng cho từng website khi deploy
  // aiTopic trống = AI tự chọn chủ đề theo metadata của từng site
  @Prop({ type: String, default: null })
  aiTopic: string | null;

  @Prop({ type: Number, default: null })
  aiWordCount: number | null;
}

export const GuestPostSchema = SchemaFactory.createForClass(GuestPost);
GuestPostSchema.index({ status: 1 });
GuestPostSchema.index({ expiresAt: 1 });
GuestPostSchema.index({ createdBy: 1 });
GuestPostSchema.index({ slug: 1 });
