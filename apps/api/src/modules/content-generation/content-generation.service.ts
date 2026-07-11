import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface GenerateArticleParams {
  topic: string;
  anchorText: string;
  targetUrl: string;
  language?: string;
  wordCount?: number;
}

export interface GeneratedArticle {
  title: string;
  metaDescription: string;
  category: string;
  content: string;
}

const ARTICLE_SCHEMA = {
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
      description: 'Category slug phù hợp nhất, lowercase-hyphen, chọn 1 trong: tong-hop, suc-khoe, lam-dep, the-thao, cong-nghe, du-lich, giai-tri, kinh-doanh',
    },
    content: {
      type: 'string',
      description: 'Nội dung HTML body của bài viết (chỉ dùng thẻ p, h2, h3, ul, ol, li, strong, em, a). KHÔNG bao gồm thẻ h1/html/head/body.',
    },
  },
  required: ['title', 'metaDescription', 'category', 'content'],
  additionalProperties: false,
} as const;

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
    const client = this.getClient();
    const model = this.configService.get<string>('ai.model', 'claude-opus-4-8');
    const language = params.language || 'vi';
    const wordCount = params.wordCount || 800;

    const prompt = `Bạn là một content writer SEO chuyên nghiệp. Viết một bài viết ${language === 'vi' ? 'tiếng Việt' : 'in English'} khoảng ${wordCount} từ về chủ đề: "${params.topic}".

Yêu cầu:
- Bài viết tự nhiên, hữu ích cho người đọc, chuẩn SEO
- Trong nội dung PHẢI chèn đúng 1 backlink tự nhiên: anchor text "${params.anchorText}" trỏ đến URL "${params.targetUrl}" (dạng <a href="${params.targetUrl}">${params.anchorText}</a>). Đặt backlink ở vị trí tự nhiên trong ngữ cảnh, khoảng 1/3 đến 2/3 bài viết
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
            schema: ARTICLE_SCHEMA as any,
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
