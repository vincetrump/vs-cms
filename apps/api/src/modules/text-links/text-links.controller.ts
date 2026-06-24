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
import { TextLinksService } from './text-links.service';
import { LinkDeploymentsService } from '../link-deployments/link-deployments.service';
import { DiscordService } from '../discord/discord.service';
import { JobsService } from '../jobs/jobs.service';
import { WebsitesService } from '../websites/websites.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseQueryPipe, ParsedQuery } from '../../common/pipes/parse-query.pipe';
import { CreateTextLinkDto } from './dto/create-text-link.dto';
import { UpdateTextLinkDto } from './dto/update-text-link.dto';

@Controller('text-links')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TextLinksController {
  constructor(
    private textLinksService: TextLinksService,
    private linkDeploymentsService: LinkDeploymentsService,
    private discordService: DiscordService,
    private jobsService: JobsService,
    private websitesService: WebsitesService,
  ) {}

  private getCreatorId(link: any): string | undefined {
    return typeof link.createdBy === 'object' ? link.createdBy?._id?.toString() : link.createdBy?.toString();
  }

  @Get()
  async findAll(@Req() req: any, @Query(new ParseQueryPipe()) query: ParsedQuery) {
    if (req.user.role === 'sale') {
      query.filter.createdBy = req.user.sub;
    }
    return this.textLinksService.findAll(query);
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const link = await this.textLinksService.findById(id);
    if (!link) throw new NotFoundException('Text link not found');

    if (req.user.role === 'sale' && this.getCreatorId(link) !== req.user.sub) {
      throw new ForbiddenException();
    }

    if (req.user.role !== 'admin') {
      return link;
    }

    const deployments = await this.linkDeploymentsService.findByTextLink(id);
    const obj: any = link.toObject();

    if (obj.requestedWebsiteIds?.length) {
      const websites = await Promise.all(
        obj.requestedWebsiteIds.map((wid: string) => this.websitesService.findById(wid)),
      );
      obj.requestedWebsites = websites
        .filter(Boolean)
        .map((w: any) => ({ _id: w._id, domain: w.domain }));
    }

    return { ...obj, deployments };
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateTextLinkDto) {
    const isSale = req.user.role === 'sale';

    const link = await this.textLinksService.create({
      title: dto.title,
      anchorText: dto.anchorText,
      targetUrl: dto.targetUrl,
      rel: dto.rel || null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      status: isSale ? 'pending' : 'active',
      source: isSale ? 'sale' : 'admin',
      createdBy: req.user.sub,
      ...(dto.websiteIds?.length ? { requestedWebsiteIds: dto.websiteIds } : {}),
    });

    if (!isSale && dto.websiteIds?.length) {
      await this.jobsService.create('deploy_links', {
        textLinkId: link._id.toString(),
        websiteIds: dto.websiteIds,
      });
    }

    await this.discordService.sendNewLinkNotification(link);
    return link;
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateTextLinkDto) {
    const existing = await this.textLinksService.findById(id);
    if (!existing) throw new NotFoundException('Text link not found');

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
    if (dto.websiteIds) updateData.requestedWebsiteIds = dto.websiteIds;

    const isSale = req.user.role === 'sale';
    const hasContentChanges = !!(dto.anchorText || dto.targetUrl || dto.rel !== undefined);

    if (isSale && existing.status === 'active' && hasContentChanges) {
      updateData.status = 'pending';
      changes.status = { old: 'active', new: 'pending (awaiting approval)' };
    }

    const updated = await this.textLinksService.update(id, updateData);

    if (req.user.role === 'admin' && hasContentChanges) {
      await this.jobsService.create('redeploy_link', { textLinkId: id });
    }

    if (req.user.role === 'admin' && dto.websiteIds) {
      await this.jobsService.create('sync_link_websites', {
        textLinkId: id,
        websiteIds: dto.websiteIds,
      });
    }

    if (Object.keys(changes).length > 0) {
      if (isSale && updateData.status === 'pending') {
        await this.discordService.sendPendingReviewNotification(updated!, changes);
      } else {
        await this.discordService.sendUpdateNotification(updated!, changes);
      }
    }

    return updated;
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const link = await this.textLinksService.findById(id);
    if (!link) throw new NotFoundException('Text link not found');

    if (req.user.role === 'sale' && this.getCreatorId(link) !== req.user.sub) {
      throw new ForbiddenException();
    }

    if (req.user.role === 'admin') {
      await this.jobsService.create('undeploy_all', { textLinkId: id });
    }
    await this.textLinksService.delete(id);
    await this.discordService.sendDeleteNotification(link);
    return { success: true };
  }

  @Post(':id/deploy')
  @Roles('admin')
  async deploy(
    @Param('id') id: string,
    @Body('websiteIds') websiteIds: string[],
  ) {
    if (!websiteIds?.length) throw new BadRequestException('websiteIds required');
    const link = await this.textLinksService.findById(id);
    if (!link) throw new NotFoundException('Text link not found');
    if (link.status !== 'active')
      throw new BadRequestException('Text link must be active to deploy');

    const job = await this.jobsService.create('deploy_links', {
      textLinkId: id,
      websiteIds,
    });
    return { jobId: job._id, message: 'Deploy job queued' };
  }

  @Post(':id/undeploy')
  @Roles('admin')
  async undeploy(
    @Param('id') id: string,
    @Body('websiteIds') websiteIds: string[],
  ) {
    if (!websiteIds?.length) throw new BadRequestException('websiteIds required');
    const job = await this.jobsService.create('undeploy_links', {
      textLinkId: id,
      websiteIds,
    });
    return { jobId: job._id, message: 'Undeploy job queued' };
  }

  @Post(':id/toggle')
  @Roles('admin')
  async toggle(@Param('id') id: string) {
    const link = await this.textLinksService.findById(id);
    if (!link) throw new NotFoundException('Text link not found');

    if (link.status === 'active') {
      await this.jobsService.create('undeploy_all', { textLinkId: id });
      const updated = await this.textLinksService.update(id, { status: 'disabled' });
      await this.discordService.sendStatusChangeNotification(updated!, 'active', 'disabled');
      return updated;
    } else if (link.status === 'disabled') {
      const deployments = await this.linkDeploymentsService.findPreviouslyDeployed(id);
      const updated = await this.textLinksService.update(id, { status: 'active' });
      if (deployments.length) {
        await this.jobsService.create('deploy_links', {
          textLinkId: id,
          websiteIds: deployments.map((d) => d.websiteId.toString()),
        });
      }
      await this.discordService.sendStatusChangeNotification(updated!, 'disabled', 'active');
      return updated;
    } else if (link.status === 'pending') {
      const updated = await this.textLinksService.update(id, { status: 'active' });
      const existingDeployments = await this.linkDeploymentsService.findByTextLink(id);
      const deployedIds = existingDeployments
        .filter((d: any) => d.status === 'deployed')
        .map((d: any) => (d.websiteId?._id || d.websiteId).toString());
      if (deployedIds.length) {
        await this.jobsService.create('redeploy_link', { textLinkId: id });
      }
      const allTrackedIds = existingDeployments.map((d: any) => (d.websiteId?._id || d.websiteId).toString());
      const requestedIds = ((link as any).requestedWebsiteIds || []).map(String);
      const newIds = requestedIds.filter((wid: string) => !allTrackedIds.includes(wid));
      if (newIds.length) {
        console.log('[DEBUG toggle] allTrackedIds:', allTrackedIds, 'requestedIds:', requestedIds, 'newIds:', newIds);
        await this.jobsService.create('deploy_links', {
          textLinkId: id,
          websiteIds: newIds,
        });
      }
      await this.discordService.sendStatusChangeNotification(updated!, 'pending', 'active');
      return updated;
    }

    throw new BadRequestException(`Cannot toggle link with status: ${link.status}`);
  }
}
