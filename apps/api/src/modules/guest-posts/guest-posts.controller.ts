import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { GuestPostsService } from './guest-posts.service';
import { GuestPostDeploymentsService } from '../guest-post-deployments/guest-post-deployments.service';
import { DiscordService } from '../discord/discord.service';
import { JobsService } from '../jobs/jobs.service';
import { GuestPostHistoryService } from '../guest-post-history/guest-post-history.service';
import { ContentGenerationService, SiteContext } from '../content-generation/content-generation.service';
import { WebsiteMetadataService } from '../website-metadata/website-metadata.service';
import { WebsitesService } from '../websites/websites.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseQueryPipe, ParsedQuery } from '../../common/pipes/parse-query.pipe';
import { CreateGuestPostDto } from './dto/create-guest-post.dto';
import { UpdateGuestPostDto } from './dto/update-guest-post.dto';
import { GenerateContentDto } from './dto/generate-content.dto';

@Controller('guest-posts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GuestPostsController {
  constructor(
    private guestPostsService: GuestPostsService,
    private guestPostDeploymentsService: GuestPostDeploymentsService,
    private discordService: DiscordService,
    private jobsService: JobsService,
    private historyService: GuestPostHistoryService,
    private contentGenerationService: ContentGenerationService,
    private websiteMetadataService: WebsiteMetadataService,
    private websitesService: WebsitesService,
  ) {}

  private getCreatorId(post: any): string | null {
    if (!post.createdBy) return null;
    return typeof post.createdBy === 'object' ? post.createdBy._id?.toString() : post.createdBy.toString();
  }

  @Get()
  async findAll(@Query(ParseQueryPipe) query: ParsedQuery) {
    const { data, total } = await this.guestPostsService.findAll(query);
    return { data, total };
  }

  @Get('ai-status')
  async aiStatus() {
    return { configured: this.contentGenerationService.isConfigured() };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const post = await this.guestPostsService.findById(id);
    if (!post) throw new NotFoundException('Guest post not found');
    const obj = post.toObject();
    const deployments = await this.guestPostDeploymentsService.findByGuestPost(id);
    return { ...obj, deployments };
  }

  @Get(':id/history')
  async getHistory(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.historyService.findByGuestPost(id, Number(page) || 1, Number(limit) || 20);
  }

  @Get(':id/deployments')
  @Roles('admin')
  async getDeployments(@Param('id') id: string) {
    return this.guestPostDeploymentsService.findByGuestPost(id);
  }

  // Phase 6: AI content generation — trả về draft để fill vào form, chưa lưu DB
  // Có websiteId → AI đọc metadata site (tên, mô tả, categories) để tự chọn chủ đề phù hợp
  @Post('generate-content')
  async generateContent(@Body() dto: GenerateContentDto) {
    if (!dto.topic?.trim() && !dto.websiteId) {
      throw new BadRequestException('Nhập chủ đề hoặc chọn website để AI tự chọn chủ đề theo site');
    }

    let siteContext: SiteContext | undefined;
    let siteLanguage: string | undefined;
    if (dto.websiteId) {
      try {
        const website = await this.websitesService.findById(dto.websiteId);
        if (!website) throw new NotFoundException('Website not found');
        const metadata = await this.websiteMetadataService.getOrScan(dto.websiteId);
        siteContext = {
          domain: website.domain,
          siteName: metadata.siteName,
          siteDescription: metadata.siteDescription,
          categories: metadata.navCategories || [],
        };
        siteLanguage = metadata.language;
      } catch (err: any) {
        // Không scan được metadata: có topic thì vẫn generate bình thường, không topic thì báo lỗi rõ
        if (!dto.topic?.trim()) {
          throw new BadRequestException(
            `Không đọc được metadata của website (${err.message}) — hãy scan metadata trước hoặc nhập chủ đề thủ công`,
          );
        }
      }
    }

    const article = await this.contentGenerationService.generateArticle({
      topic: dto.topic?.trim() || undefined,
      siteContext,
      anchorText: dto.anchorText,
      targetUrl: dto.targetUrl,
      rel: dto.rel,
      language: dto.language || siteLanguage,
      wordCount: dto.wordCount,
    });

    const content = this.guestPostsService.sanitizeHtml(article.content);
    return {
      title: article.title,
      slug: this.guestPostsService.slugify(article.title),
      metaDescription: article.metaDescription,
      category: article.category,
      content,
      wordCount: this.guestPostsService.countWords(content),
      contentSource: 'ai',
    };
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateGuestPostDto) {
    const isSale = req.user.role === 'sale';
    const contentSource = dto.contentSource || 'manual';

    // Bài manual phải có title + content; bài AI thì không — nội dung sinh riêng từng site lúc deploy
    if (contentSource !== 'ai' && (!dto.title?.trim() || !dto.content?.trim())) {
      throw new BadRequestException('Title và nội dung là bắt buộc với bài viết tự soạn');
    }
    if (contentSource === 'ai' && !this.contentGenerationService.isConfigured()) {
      throw new BadRequestException('ANTHROPIC_API_KEY chưa được cấu hình trên server — không thể tạo bài AI');
    }

    // Bài AI không có title → dùng chủ đề (hoặc anchor text) làm title tạm hiển thị trong danh sách;
    // title thật của từng site do AI sinh lúc deploy
    const title = dto.title?.trim() || dto.aiTopic?.trim() || `AI: ${dto.anchorText}`;
    const content = dto.content || '';

    const post = await this.guestPostsService.create({
      title,
      slug: dto.slug || this.guestPostsService.slugify(title),
      content,
      metaDescription:
        dto.metaDescription?.trim() ||
        (content ? this.guestPostsService.deriveMetaDescription(content, title) : ''),
      category: dto.category || 'tong-hop',
      anchorText: dto.anchorText,
      targetUrl: dto.targetUrl,
      rel: dto.rel || null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      contentSource: dto.contentSource || 'manual',
      aiTopic: dto.aiTopic?.trim() || null,
      aiWordCount: dto.aiWordCount || null,
      hideBacklink: dto.hideBacklink ?? true,
      extraBacklinks: (dto.extraBacklinks || []).map((b) => ({
        anchorText: b.anchorText,
        targetUrl: b.targetUrl,
        rel: b.rel || null,
        hideBacklink: b.hideBacklink ?? true,
      })),
      status: isSale ? 'pending' : 'active',
      source: isSale ? 'sale' : 'admin',
      createdBy: req.user.sub,
      ...(dto.websiteIds?.length ? { requestedWebsiteIds: dto.websiteIds } : {}),
    });

    if (!isSale && dto.websiteIds?.length) {
      await this.jobsService.create('deploy_guest_post', {
        guestPostId: post._id.toString(),
        websiteIds: dto.websiteIds,
      });
    }

    await this.historyService.log({
      guestPostId: post._id.toString(),
      action: 'created',
      performedBy: req.user.sub,
      metadata: { status: post.status, source: post.source, category: post.category, wordCount: post.wordCount },
    });

    await this.discordService.sendGuestPostCreatedNotification(post);

    return post;
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateGuestPostDto) {
    const existing = await this.guestPostsService.findById(id);
    if (!existing) throw new NotFoundException('Guest post not found');

    if (req.user.role === 'sale' && this.getCreatorId(existing) !== req.user.sub) {
      throw new ForbiddenException();
    }

    const changes: Record<string, { old: any; new: any }> = {};
    if (dto.title && dto.title !== existing.title)
      changes.title = { old: existing.title, new: dto.title };
    if (dto.slug && dto.slug !== existing.slug)
      changes.slug = { old: existing.slug, new: dto.slug };
    if (dto.content && dto.content !== existing.content)
      changes.content = { old: `${existing.wordCount} words`, new: `${this.guestPostsService.countWords(dto.content)} words` };
    if (dto.metaDescription && dto.metaDescription !== existing.metaDescription)
      changes.metaDescription = { old: existing.metaDescription, new: dto.metaDescription };
    if (dto.category && dto.category !== existing.category)
      changes.category = { old: existing.category, new: dto.category };
    if (dto.anchorText && dto.anchorText !== existing.anchorText)
      changes.anchorText = { old: existing.anchorText, new: dto.anchorText };
    if (dto.targetUrl && dto.targetUrl !== existing.targetUrl)
      changes.targetUrl = { old: existing.targetUrl, new: dto.targetUrl };
    if (dto.rel !== undefined && (dto.rel || null) !== (existing.rel || null))
      changes.rel = { old: existing.rel || 'not set', new: dto.rel || 'not set' };
    if (dto.expiresAt !== undefined) {
      const oldExp = existing.expiresAt ? new Date(existing.expiresAt).toISOString() : null;
      const newExp = dto.expiresAt || null;
      if (oldExp !== newExp)
        changes.expiresAt = { old: oldExp || 'Never', new: newExp || 'Never' };
    }
    if (dto.websiteIds) {
      const oldIds = ((existing as any).requestedWebsiteIds || []).map(String).sort().join(',');
      const newIds = [...dto.websiteIds].sort().join(',');
      if (oldIds !== newIds)
        changes.websites = { old: `${((existing as any).requestedWebsiteIds || []).length} websites`, new: `${dto.websiteIds.length} websites` };
    }

    const updateData: any = {};
    if (dto.title) updateData.title = dto.title;
    if (dto.slug) updateData.slug = dto.slug;
    if (dto.content) updateData.content = dto.content;
    if (dto.metaDescription) updateData.metaDescription = dto.metaDescription;
    if (dto.category) updateData.category = dto.category;
    if (dto.anchorText) updateData.anchorText = dto.anchorText;
    if (dto.targetUrl) updateData.targetUrl = dto.targetUrl;
    if (dto.rel !== undefined) updateData.rel = dto.rel || null;
    if (dto.expiresAt !== undefined) updateData.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.contentSource) updateData.contentSource = dto.contentSource;
    if (dto.aiTopic !== undefined) updateData.aiTopic = dto.aiTopic?.trim() || null;
    if (dto.aiWordCount !== undefined) updateData.aiWordCount = dto.aiWordCount || null;
    if (dto.websiteIds) updateData.requestedWebsiteIds = dto.websiteIds;

    const hideBacklinkChanged = dto.hideBacklink !== undefined && !!dto.hideBacklink !== !!existing.hideBacklink;
    if (hideBacklinkChanged) {
      updateData.hideBacklink = !!dto.hideBacklink;
      changes.hideBacklink = { old: existing.hideBacklink ? 'Ẩn' : 'Hiện', new: dto.hideBacklink ? 'Ẩn' : 'Hiện' };
    }

    let extraBacklinksChanged = false;
    if (dto.extraBacklinks !== undefined) {
      const normalized = dto.extraBacklinks.map((b) => ({
        anchorText: b.anchorText, targetUrl: b.targetUrl, rel: b.rel || null, hideBacklink: b.hideBacklink ?? true,
      }));
      const oldJson = JSON.stringify((existing.extraBacklinks || []).map((b: any) => ({
        anchorText: b.anchorText, targetUrl: b.targetUrl, rel: b.rel || null, hideBacklink: !!b.hideBacklink,
      })));
      if (JSON.stringify(normalized) !== oldJson) {
        updateData.extraBacklinks = normalized;
        extraBacklinksChanged = true;
        changes.extraBacklinks = { old: `${(existing.extraBacklinks || []).length} link`, new: `${normalized.length} link` };
      }
    }

    const isSale = req.user.role === 'sale';
    // Đổi trạng thái ẩn/hiện backlink hoặc danh sách backlink phụ cần re-render → tính là content change
    const hasContentChanges = !!(
      dto.title || dto.content || dto.metaDescription || dto.anchorText || dto.targetUrl || dto.rel !== undefined || hideBacklinkChanged || extraBacklinksChanged
    );

    if (isSale && existing.status === 'active' && hasContentChanges) {
      updateData.status = 'pending';
      changes.status = { old: 'active', new: 'pending (awaiting approval)' };
    }

    const updated = await this.guestPostsService.update(id, updateData);

    // Chỉ đụng đến websites khi post đang ACTIVE — edit post disabled/expired/pending
    // không được tự ý deploy/redeploy (expired sẽ khôi phục backlink sai, disabled sẽ tự bật lại)
    if (req.user.role === 'admin' && existing.status === 'active' && dto.websiteIds) {
      const currentDeployments = await this.guestPostDeploymentsService.findDeployed(id);
      const currentWebsiteIds = [...new Set(currentDeployments.map(d => d.websiteId.toString()))];
      const targetIds = new Set(dto.websiteIds);
      const currentSet = new Set(currentWebsiteIds);

      const toRemove = currentWebsiteIds.filter(wid => !targetIds.has(wid));
      const toAdd = dto.websiteIds.filter(wid => !currentSet.has(wid));

      if (toRemove.length) {
        await this.jobsService.create('undeploy_guest_post', { guestPostId: id, websiteIds: toRemove });
      }
      if (hasContentChanges) {
        await this.jobsService.create('redeploy_guest_post', { guestPostId: id });
      }
      if (toAdd.length) {
        await this.jobsService.create('deploy_guest_post', { guestPostId: id, websiteIds: toAdd });
      }
    } else if (req.user.role === 'admin' && existing.status === 'active' && hasContentChanges) {
      await this.jobsService.create('redeploy_guest_post', { guestPostId: id });
    }

    if (Object.keys(changes).length > 0) {
      await this.historyService.log({
        guestPostId: id,
        action: 'updated',
        performedBy: req.user.sub,
        changes,
      });

      if (isSale && existing.status === 'active' && hasContentChanges) {
        await this.discordService.sendGuestPostPendingReviewNotification(updated, changes);
      } else {
        await this.discordService.sendGuestPostUpdatedNotification(updated, changes);
      }
    }

    return updated;
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const post = await this.guestPostsService.findById(id);
    if (!post) throw new NotFoundException('Guest post not found');

    if (req.user.role === 'sale' && this.getCreatorId(post) !== req.user.sub) {
      throw new ForbiddenException();
    }

    // Hủy các job còn pending của post (deploy/redeploy... không còn ý nghĩa khi sắp xóa).
    // Chỉ chặn khi có job đang THỰC SỰ chạy (không thể ngắt giữa chừng) — đợi xong rồi xóa lại.
    await this.jobsService.cancelPendingJobsFor('guestPostId', id);
    const hasRunning = await this.jobsService.hasRunningJobFor('guestPostId', id);
    if (hasRunning) {
      throw new BadRequestException('Đang có job chạy cho guest post này — đợi job hoàn tất (xem trang Jobs) rồi xóa lại');
    }

    await this.historyService.log({
      guestPostId: id,
      action: 'deleted',
      performedBy: req.user.sub,
      metadata: { title: post.title, targetUrl: post.targetUrl },
    });

    await this.discordService.sendGuestPostDeleteNotification(post);

    // Luôn undeploy trước khi xóa — kể cả sale xóa bài của chính mình,
    // nếu không bài viết + backlink sẽ mồ côi vĩnh viễn trên websites
    await this.jobsService.create('undeploy_guest_post', { guestPostId: id });
    await this.guestPostsService.delete(id);
    return { success: true };
  }

  @Post(':id/deploy')
  @Roles('admin')
  async deploy(
    @Req() req: any,
    @Param('id') id: string,
    @Body('websiteIds') websiteIds: string[],
  ) {
    if (!websiteIds?.length) throw new BadRequestException('websiteIds required');
    const post = await this.guestPostsService.findById(id);
    if (!post) throw new NotFoundException('Guest post not found');
    if (post.status !== 'active')
      throw new BadRequestException('Guest post must be active to deploy');

    const job = await this.jobsService.create('deploy_guest_post', {
      guestPostId: id,
      websiteIds,
    });

    await this.historyService.log({
      guestPostId: id,
      action: 'deployed',
      performedBy: req.user.sub,
      metadata: { websiteIds, jobId: job._id.toString() },
    });

    return { jobId: job._id, message: 'Deploy job queued' };
  }

  @Post(':id/undeploy')
  @Roles('admin')
  async undeploy(
    @Req() req: any,
    @Param('id') id: string,
    @Body('websiteIds') websiteIds: string[],
  ) {
    if (!websiteIds?.length) throw new BadRequestException('websiteIds required');
    const job = await this.jobsService.create('undeploy_guest_post', {
      guestPostId: id,
      websiteIds,
    });

    await this.historyService.log({
      guestPostId: id,
      action: 'undeployed',
      performedBy: req.user.sub,
      metadata: { websiteIds, jobId: job._id.toString() },
    });

    return { jobId: job._id, message: 'Undeploy job queued' };
  }

  // Regenerate: viết lại bài AI MỚI cho 1 (hoặc nhiều) website, GIỮ NGUYÊN URL cũ.
  // Chỉ áp dụng cho post AI; post manual không có gì để regenerate.
  @Post(':id/regenerate')
  @Roles('admin')
  async regenerate(
    @Req() req: any,
    @Param('id') id: string,
    @Body('websiteIds') websiteIds: string[],
  ) {
    if (!websiteIds?.length) throw new BadRequestException('websiteIds required');
    const post = await this.guestPostsService.findById(id);
    if (!post) throw new NotFoundException('Guest post not found');
    if (post.contentSource !== 'ai') {
      throw new BadRequestException('Chỉ bài AI mới generate lại được — bài tự soạn hãy dùng Edit');
    }
    if (!this.contentGenerationService.isConfigured()) {
      throw new BadRequestException('ANTHROPIC_API_KEY chưa được cấu hình trên server');
    }

    const job = await this.jobsService.create('regenerate_guest_post', {
      guestPostId: id,
      websiteIds,
    });

    await this.historyService.log({
      guestPostId: id,
      action: 'regenerated',
      performedBy: req.user.sub,
      metadata: { websiteIds, jobId: job._id.toString() },
    });

    return { jobId: job._id, message: 'Regenerate job queued' };
  }

  // Toggle real-public: bật = cho bot index + đưa vào sitemap, tắt = noindex + gỡ khỏi sitemap.
  // Tạo redeploy job để re-render meta robots và đồng bộ sitemap trên các websites đã deploy.
  @Post(':id/toggle-public')
  @Roles('admin')
  async togglePublic(@Req() req: any, @Param('id') id: string) {
    const post = await this.guestPostsService.findById(id);
    if (!post) throw new NotFoundException('Guest post not found');
    if (post.status === 'expired') {
      throw new BadRequestException('Post đã hết hạn — kích hoạt lại (toggle) trước khi đổi chế độ SEO');
    }

    const newValue = !post.realPublic;
    const updated = await this.guestPostsService.update(id, { realPublic: newValue });

    const deployedCount = await this.guestPostDeploymentsService.countDeployed(id);
    if (deployedCount > 0) {
      await this.jobsService.create('redeploy_guest_post', { guestPostId: id });
    }

    await this.historyService.log({
      guestPostId: id,
      action: 'status_changed',
      performedBy: req.user.sub,
      changes: { realPublic: { old: post.realPublic ? 'real-public' : 'noindex', new: newValue ? 'real-public' : 'noindex' } },
      metadata: { deployedCount },
    });

    await this.discordService.sendGuestPostStatusChangeNotification(
      post,
      post.realPublic ? 'real-public' : 'noindex',
      newValue ? 'real-public' : 'noindex',
    );

    return updated;
  }

  @Post(':id/toggle')
  @Roles('admin')
  async toggle(@Req() req: any, @Param('id') id: string) {
    const post = await this.guestPostsService.findById(id);
    if (!post) throw new NotFoundException('Guest post not found');

    if (post.status === 'active') {
      // Disable: hủy các job deploy/redeploy/regenerate còn pending (vô nghĩa khi sắp gỡ)
      await this.jobsService.cancelPendingJobsFor('guestPostId', id, [
        'deploy_guest_post', 'redeploy_guest_post', 'regenerate_guest_post',
      ]);
      await this.jobsService.create('undeploy_guest_post', { guestPostId: id });
      const updated = await this.guestPostsService.update(id, { status: 'disabled' });
      await this.historyService.log({
        guestPostId: id,
        action: 'status_changed',
        performedBy: req.user.sub,
        changes: { status: { old: 'active', new: 'disabled' } },
      });
      await this.discordService.sendGuestPostStatusChangeNotification(post, 'active', 'disabled');
      return updated;
    } else if (post.status === 'disabled') {
      // Enable: hủy undeploy còn pending (vô nghĩa khi sắp deploy lại)
      await this.jobsService.cancelPendingJobsFor('guestPostId', id, ['undeploy_guest_post']);
      const updated = await this.guestPostsService.update(id, { status: 'active' });
      // Gom TẤT CẢ website từng deploy (mọi status) + requestedWebsiteIds — chắc chắn không sót site
      const allDeployments = await this.guestPostDeploymentsService.findByGuestPost(id);
      const websiteIds = [...new Set([
        ...allDeployments.map((d: any) => (d.websiteId?._id || d.websiteId).toString()),
        ...((post as any).requestedWebsiteIds || []).map(String),
      ])];
      if (websiteIds.length) {
        await this.jobsService.create('deploy_guest_post', {
          guestPostId: id,
          websiteIds,
        });
      }
      await this.historyService.log({
        guestPostId: id,
        action: 'status_changed',
        performedBy: req.user.sub,
        changes: { status: { old: 'disabled', new: 'active' } },
      });
      await this.discordService.sendGuestPostStatusChangeNotification(post, 'disabled', 'active');
      return updated;
    } else if (post.status === 'pending') {
      const updated = await this.guestPostsService.update(id, { status: 'active' });
      const existingDeployments = await this.guestPostDeploymentsService.findByGuestPost(id);
      const deployedWebsiteIds = [...new Set(
        existingDeployments
          .filter((d: any) => d.status === 'deployed')
          .map((d: any) => (d.websiteId?._id || d.websiteId).toString()),
      )];
      if (deployedWebsiteIds.length) {
        await this.jobsService.create('redeploy_guest_post', { guestPostId: id });
      }
      const allTrackedWebsiteIds = [...new Set(
        existingDeployments.map((d: any) => (d.websiteId?._id || d.websiteId).toString()),
      )];
      const requestedIds = ((post as any).requestedWebsiteIds || []).map(String);
      const newIds = requestedIds.filter((wid: string) => !allTrackedWebsiteIds.includes(wid));
      if (newIds.length) {
        await this.jobsService.create('deploy_guest_post', {
          guestPostId: id,
          websiteIds: newIds,
        });
      }
      await this.historyService.log({
        guestPostId: id,
        action: 'status_changed',
        performedBy: req.user.sub,
        changes: { status: { old: 'pending', new: 'active' } },
      });
      await this.discordService.sendGuestPostStatusChangeNotification(post, 'pending', 'active');
      return updated;
    } else if (post.status === 'expired') {
      // Expired chỉ gỡ backlink, bài vẫn sống trên site → re-activate = redeploy để chèn lại backlink.
      // Chỉ xóa expiresAt khi nó đã qua (tránh expire lại ngay đêm nay); hạn TƯƠNG LAI admin vừa đặt thì giữ.
      const expiryPassed = !post.expiresAt || new Date(post.expiresAt) <= new Date();
      const updated = await this.guestPostsService.update(
        id,
        expiryPassed ? { status: 'active', expiresAt: null } : { status: 'active' },
      );
      const deployedCount = await this.guestPostDeploymentsService.countDeployed(id);
      if (deployedCount > 0) {
        await this.jobsService.create('redeploy_guest_post', { guestPostId: id });
      }
      await this.historyService.log({
        guestPostId: id,
        action: 'status_changed',
        performedBy: req.user.sub,
        changes: { status: { old: 'expired', new: 'active' } },
      });
      await this.discordService.sendGuestPostStatusChangeNotification(post, 'expired', 'active');
      return updated;
    }

    throw new BadRequestException(`Cannot toggle guest post with status: ${post.status}`);
  }
}
