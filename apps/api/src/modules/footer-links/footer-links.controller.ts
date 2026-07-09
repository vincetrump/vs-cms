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
import { FooterLinksService } from './footer-links.service';
import { FooterLinkDeploymentsService } from '../footer-link-deployments/footer-link-deployments.service';
import { DiscordService } from '../discord/discord.service';
import { JobsService } from '../jobs/jobs.service';
import { FooterLinkHistoryService } from '../footer-link-history/footer-link-history.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseQueryPipe, ParsedQuery } from '../../common/pipes/parse-query.pipe';
import { CreateFooterLinkDto } from './dto/create-footer-link.dto';
import { UpdateFooterLinkDto } from './dto/update-footer-link.dto';

@Controller('footer-links')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FooterLinksController {
  constructor(
    private footerLinksService: FooterLinksService,
    private footerLinkDeploymentsService: FooterLinkDeploymentsService,
    private discordService: DiscordService,
    private jobsService: JobsService,
    private historyService: FooterLinkHistoryService,
  ) {}

  private getCreatorId(link: any): string | null {
    if (!link.createdBy) return null;
    return typeof link.createdBy === 'object' ? link.createdBy._id?.toString() : link.createdBy.toString();
  }

  @Get()
  async findAll(@Query(ParseQueryPipe) query: ParsedQuery) {
    const { data, total } = await this.footerLinksService.findAll(query);
    return { data, total };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const link = await this.footerLinksService.findById(id);
    if (!link) throw new NotFoundException('Footer link not found');
    const obj = link.toObject();
    const deployments = await this.footerLinkDeploymentsService.findByFooterLink(id);
    return { ...obj, deployments };
  }

  @Get(':id/history')
  async getHistory(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.historyService.findByFooterLink(id, Number(page) || 1, Number(limit) || 20);
  }

  @Get(':id/deployments')
  async getDeployments(@Param('id') id: string) {
    return this.footerLinkDeploymentsService.findByFooterLink(id);
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateFooterLinkDto) {
    const isSale = req.user.role === 'sale';

    const link = await this.footerLinksService.create({
      title: dto.title,
      anchorText: dto.anchorText,
      targetUrl: dto.targetUrl,
      rel: dto.rel || null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      pageCount: dto.pageCount,
      includeHomepage: dto.includeHomepage || false,
      status: isSale ? 'pending' : 'active',
      source: isSale ? 'sale' : 'admin',
      createdBy: req.user.sub,
      ...(dto.websiteIds?.length ? { requestedWebsiteIds: dto.websiteIds } : {}),
    });

    if (!isSale && dto.websiteIds?.length) {
      await this.jobsService.create('deploy_footer_links', {
        footerLinkId: link._id.toString(),
        websiteIds: dto.websiteIds,
      });
    }

    await this.historyService.log({
      footerLinkId: link._id.toString(),
      action: 'created',
      performedBy: req.user.sub,
      metadata: { status: link.status, source: link.source, pageCount: link.pageCount },
    });

    await this.discordService.sendFooterLinkCreatedNotification(link);

    return link;
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateFooterLinkDto) {
    const existing = await this.footerLinksService.findById(id);
    if (!existing) throw new NotFoundException('Footer link not found');

    if (req.user.role === 'sale' && this.getCreatorId(existing) !== req.user.sub) {
      throw new ForbiddenException();
    }

    const changes: Record<string, { old: any; new: any }> = {};
    if (dto.title && dto.title !== existing.title)
      changes.title = { old: existing.title, new: dto.title };
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
    if (dto.pageCount && dto.pageCount !== existing.pageCount)
      changes.pageCount = { old: existing.pageCount, new: dto.pageCount };
    if (dto.websiteIds) {
      const oldIds = ((existing as any).requestedWebsiteIds || []).map(String).sort().join(',');
      const newIds = [...dto.websiteIds].sort().join(',');
      if (oldIds !== newIds)
        changes.websites = { old: `${((existing as any).requestedWebsiteIds || []).length} websites`, new: `${dto.websiteIds.length} websites` };
    }

    const updateData: any = {};
    if (dto.title) updateData.title = dto.title;
    if (dto.anchorText) updateData.anchorText = dto.anchorText;
    if (dto.targetUrl) updateData.targetUrl = dto.targetUrl;
    if (dto.rel !== undefined) updateData.rel = dto.rel || null;
    if (dto.expiresAt !== undefined) updateData.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.pageCount) updateData.pageCount = dto.pageCount;
    if (dto.includeHomepage !== undefined) updateData.includeHomepage = dto.includeHomepage;
    if (dto.websiteIds) updateData.requestedWebsiteIds = dto.websiteIds;

    const isSale = req.user.role === 'sale';
    const hasContentChanges = !!(dto.anchorText || dto.targetUrl || dto.rel !== undefined);

    if (isSale && existing.status === 'active' && hasContentChanges) {
      updateData.status = 'pending';
      changes.status = { old: 'active', new: 'pending (awaiting approval)' };
    }

    const updated = await this.footerLinksService.update(id, updateData);

    if (req.user.role === 'admin' && hasContentChanges) {
      await this.jobsService.create('redeploy_footer_link', { footerLinkId: id });
    }

    if (req.user.role === 'admin' && dto.websiteIds) {
      const currentDeployments = await this.footerLinkDeploymentsService.findDeployed(id);
      const currentWebsiteIds = [...new Set(currentDeployments.map(d => d.websiteId.toString()))];
      const targetIds = new Set(dto.websiteIds);
      const currentSet = new Set(currentWebsiteIds);

      const toAdd = dto.websiteIds.filter(wid => !currentSet.has(wid));
      const toRemove = currentWebsiteIds.filter(wid => !targetIds.has(wid));

      if (toAdd.length) {
        await this.jobsService.create('deploy_footer_links', { footerLinkId: id, websiteIds: toAdd });
      }
      if (toRemove.length) {
        await this.jobsService.create('undeploy_footer_links', { footerLinkId: id, websiteIds: toRemove });
      }
    }

    if (Object.keys(changes).length > 0) {
      await this.historyService.log({
        footerLinkId: id,
        action: 'updated',
        performedBy: req.user.sub,
        changes,
      });

      if (isSale && existing.status === 'active' && hasContentChanges) {
        await this.discordService.sendFooterLinkPendingReviewNotification(updated, changes);
      } else {
        await this.discordService.sendFooterLinkUpdatedNotification(updated, changes);
      }
    }

    return updated;
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const link = await this.footerLinksService.findById(id);
    if (!link) throw new NotFoundException('Footer link not found');

    if (req.user.role === 'sale' && this.getCreatorId(link) !== req.user.sub) {
      throw new ForbiddenException();
    }

    await this.historyService.log({
      footerLinkId: id,
      action: 'deleted',
      performedBy: req.user.sub,
      metadata: { title: link.title, anchorText: link.anchorText },
    });

    await this.discordService.sendFooterLinkDeleteNotification(link);

    if (req.user.role === 'admin') {
      await this.jobsService.create('undeploy_footer_links', { footerLinkId: id });
    }
    await this.footerLinksService.delete(id);
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
    const link = await this.footerLinksService.findById(id);
    if (!link) throw new NotFoundException('Footer link not found');
    if (link.status !== 'active')
      throw new BadRequestException('Footer link must be active to deploy');

    const job = await this.jobsService.create('deploy_footer_links', {
      footerLinkId: id,
      websiteIds,
    });

    await this.historyService.log({
      footerLinkId: id,
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
    const job = await this.jobsService.create('undeploy_footer_links', {
      footerLinkId: id,
      websiteIds,
    });

    await this.historyService.log({
      footerLinkId: id,
      action: 'undeployed',
      performedBy: req.user.sub,
      metadata: { websiteIds, jobId: job._id.toString() },
    });

    return { jobId: job._id, message: 'Undeploy job queued' };
  }

  @Post(':id/toggle')
  @Roles('admin')
  async toggle(@Req() req: any, @Param('id') id: string) {
    const link = await this.footerLinksService.findById(id);
    if (!link) throw new NotFoundException('Footer link not found');

    if (link.status === 'active') {
      await this.jobsService.create('undeploy_footer_links', { footerLinkId: id });
      const updated = await this.footerLinksService.update(id, { status: 'disabled' });
      await this.historyService.log({
        footerLinkId: id,
        action: 'status_changed',
        performedBy: req.user.sub,
        changes: { status: { old: 'active', new: 'disabled' } },
      });
      await this.discordService.sendFooterLinkStatusChangeNotification(link, 'active', 'disabled');
      return updated;
    } else if (link.status === 'disabled') {
      const deployments = await this.footerLinkDeploymentsService.findPreviouslyDeployed(id);
      const updated = await this.footerLinksService.update(id, { status: 'active' });
      let websiteIds: string[] = [];
      if (deployments.length) {
        websiteIds = [...new Set(deployments.map(d => d.websiteId.toString()))];
      } else {
        websiteIds = ((link as any).requestedWebsiteIds || []).map(String);
      }
      if (websiteIds.length) {
        await this.jobsService.create('deploy_footer_links', {
          footerLinkId: id,
          websiteIds,
        });
      }
      await this.historyService.log({
        footerLinkId: id,
        action: 'status_changed',
        performedBy: req.user.sub,
        changes: { status: { old: 'disabled', new: 'active' } },
      });
      await this.discordService.sendFooterLinkStatusChangeNotification(link, 'disabled', 'active');
      return updated;
    } else if (link.status === 'pending') {
      const updated = await this.footerLinksService.update(id, { status: 'active' });
      const existingDeployments = await this.footerLinkDeploymentsService.findByFooterLink(id);
      const deployedWebsiteIds = [...new Set(
        existingDeployments
          .filter((d: any) => d.status === 'deployed')
          .map((d: any) => (d.websiteId?._id || d.websiteId).toString()),
      )];
      if (deployedWebsiteIds.length) {
        await this.jobsService.create('redeploy_footer_link', { footerLinkId: id });
      }
      const allTrackedWebsiteIds = [...new Set(
        existingDeployments.map((d: any) => (d.websiteId?._id || d.websiteId).toString()),
      )];
      const requestedIds = ((link as any).requestedWebsiteIds || []).map(String);
      const newIds = requestedIds.filter((wid: string) => !allTrackedWebsiteIds.includes(wid));
      if (newIds.length) {
        await this.jobsService.create('deploy_footer_links', {
          footerLinkId: id,
          websiteIds: newIds,
        });
      }
      await this.historyService.log({
        footerLinkId: id,
        action: 'status_changed',
        performedBy: req.user.sub,
        changes: { status: { old: 'pending', new: 'active' } },
      });
      await this.discordService.sendFooterLinkStatusChangeNotification(link, 'pending', 'active');
      return updated;
    }

    throw new BadRequestException(`Cannot toggle footer link with status: ${link.status}`);
  }
}
