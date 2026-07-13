import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface SiteContext {
  domain?: string;
  siteName?: string;
  siteDescription?: string;
  categories?: string[];
}

export interface GenerateArticleParams {
  topic?: string; // bỏ trống → AI tự chọn chủ đề theo siteContext
  siteContext?: SiteContext;
  anchorText: string;
  targetUrl: string;
  rel?: string | null;
  language?: string;
  wordCount?: number;
}

export interface GeneratedArticle {
  title: string;
  metaDescription: string;
  category: string;
  content: string;
}

const DEFAULT_CATEGORIES = ['tong-hop', 'suc-khoe', 'lam-dep', 'the-thao', 'cong-nghe', 'du-lich', 'giai-tri', 'kinh-doanh'];

// Schema build theo request: nếu có categories của website thì ép AI chọn đúng 1 trong số đó
function buildArticleSchema(siteCategories?: string[]) {
  const categories = siteCategories?.length ? siteCategories : DEFAULT_CATEGORIES;
  return {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Tiêu đề bài viết chuẩn SEO, hấp dẫn, dưới 70 ký tự',
      },
      metaDescription: {
        type: 'string',
        description: 'Meta description chuẩn SEO, 150-160 ký tự',
      },
      category: {
        type: 'string',
        enum: categories,
        description: 'Category slug phù hợp nhất với nội dung bài viết',
      },
      content: {
        type: 'string',
        description: 'Nội dung HTML body của bài viết (chỉ dùng thẻ p, h2, h3, ul, ol, li, strong, em, a). KHÔNG bao gồm thẻ h1/html/head/body.',
      },
    },
    required: ['title', 'metaDescription', 'category', 'content'],
    additionalProperties: false,
  };
}

@Injectable()
export class ContentGenerationService {
  private readonly logger = new Logger(ContentGenerationService.name);
  private client: Anthropic | null = null;

  constructor(private configService: ConfigService) {}

  isConfigured(): boolean {
    return !!this.configService.get<string>('ai.anthropicApiKey', '');
  }

  private getClient(): Anthropic {
    const apiKey = this.configService.get<string>('ai.anthropicApiKey', '');
    if (!apiKey) {
      throw new BadRequestException(
        'AI content generation is not configured — set ANTHROPIC_API_KEY on the server',
      );
    }
    if (!this.client) {
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async generateArticle(params: GenerateArticleParams): Promise<GeneratedArticle> {
    if (!params.topic && !params.siteContext) {
      throw new BadRequestException('Cần nhập chủ đề hoặc chọn website để AI tự chọn chủ đề');
    }

    const client = this.getClient();
    const model = this.configService.get<string>('ai.model', 'claude-opus-4-8');
    const language = params.language || 'vi';
    const wordCount = params.wordCount || 800;
    const site = params.siteContext;
    const siteCategories = (site?.categories || []).filter((c) => /^[a-z0-9-]+$/.test(c));

    // Khối thông tin website để AI hiểu ngữ cảnh site sẽ đăng bài
    const siteBlock = site
      ? `\nBài viết sẽ được đăng trên website:
- Tên site: ${site.siteName || site.domain || 'không rõ'}${site.domain ? `\n- Domain: ${site.domain}` : ''}${site.siteDescription ? `\n- Mô tả site: ${site.siteDescription}` : ''}${siteCategories.length ? `\n- Các chuyên mục của site: ${siteCategories.join(', ')}` : ''}
Bài viết phải phù hợp với chủ đề chung của website này để trông tự nhiên như bài "chính chủ" của site.\n`
      : '';

    const topicInstruction = params.topic
      ? `về chủ đề: "${params.topic}".`
      : `— hãy TỰ CHỌN một chủ đề cụ thể, hấp dẫn, phù hợp với chủ đề chung của website bên dưới, đồng thời liên quan đủ gần để chèn backlink (anchor "${params.anchorText}" → ${params.targetUrl}) một cách tự nhiên trong ngữ cảnh. Tránh chủ đề quá chung chung.`;

    const relAttr = params.rel ? ` rel="${params.rel}"` : '';
    const prompt = `Bạn là một content writer SEO chuyên nghiệp. Viết một bài viết ${language === 'vi' ? 'tiếng Việt' : 'in English'} khoảng ${wordCount} từ ${topicInstruction}
${siteBlock}
Yêu cầu:
- Bài viết tự nhiên, hữu ích cho người đọc, chuẩn SEO
- Trong nội dung PHẢI chèn đúng 1 backlink tự nhiên: anchor text "${params.anchorText}" trỏ đến URL "${params.targetUrl}" (dạng <a href="${params.targetUrl}"${relAttr}>${params.anchorText}</a>). Đặt backlink ở vị trí tự nhiên trong ngữ cảnh, khoảng 1/3 đến 2/3 bài viết
- Content là HTML body: dùng <p>, <h2>, <h3>, <ul>/<ol>/<li>, <strong>, <em>. KHÔNG dùng <h1>, <script>, <style>, không markdown
- Không nhồi nhét từ khóa, viết như người thật
- Mở bài hấp dẫn, thân bài có 2-4 mục h2, kết bài ngắn gọn`;

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        output_config: {
          format: {
            type: 'json_schema',
            schema: buildArticleSchema(siteCategories) as any,
          },
        },
        messages: [{ role: 'user', content: prompt }],
      });

      if (response.stop_reason === 'refusal') {
        throw new BadRequestException('AI declined to generate content for this topic');
      }
      if (response.stop_reason === 'max_tokens') {
        throw new ServiceUnavailableException('AI output was truncated — try a shorter word count');
      }

      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new ServiceUnavailableException('AI returned no content');
      }

      const article = JSON.parse(textBlock.text) as GeneratedArticle;
      this.logger.log(`Generated article "${article.title}" (${model})`);
      return article;
    } catch (err: any) {
      if (err instanceof BadRequestException || err instanceof ServiceUnavailableException) {
        throw err;
      }
      if (err instanceof Anthropic.APIError) {
        this.logger.error(`Anthropic API error ${err.status}: ${err.message}`);
        throw new ServiceUnavailableException(`AI generation failed: ${err.message}`);
      }
      this.logger.error(`AI generation failed: ${err.message}`);
      throw new ServiceUnavailableException('AI generation failed');
    }
  }
}
