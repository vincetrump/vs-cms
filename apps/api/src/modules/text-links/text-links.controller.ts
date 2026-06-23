import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TextLinksService } from './text-links.service';
import { LinkDeploymentsService } from '../link-deployments/link-deployments.service';
import { DiscordService } from '../discord/discord.service';
import { JobsService } from '../jobs/jobs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ParseQueryPipe, ParsedQuery } from '../../common/pipes/parse-query.pipe';
import { CreateTextLinkDto } from './dto/create-text-link.dto';
import { UpdateTextLinkDto } from './dto/update-text-link.dto';

@Controller('text-links')
@UseGuards(JwtAuthGuard)
export class TextLinksController {
  constructor(
    private textLinksService: TextLinksService,
    private linkDeploymentsService: LinkDeploymentsService,
    private discordService: DiscordService,
    private jobsService: JobsService,
  ) {}

  @Get()
  async findAll(@Query(new ParseQueryPipe()) query: ParsedQuery) {
    return this.textLinksService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const link = await this.textLinksService.findById(id);
    if (!link) throw new NotFoundException('Text link not found');

    const deployments = await this.linkDeploymentsService.findByTextLink(id);
    return { ...link.toObject(), deployments };
  }

  @Post()
  async create(@Body() dto: CreateTextLinkDto) {
    const link = await this.textLinksService.create({
      title: dto.title,
      anchorText: dto.anchorText,
      targetUrl: dto.targetUrl,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      status: 'active',
      source: 'admin',
    });

    if (dto.websiteIds?.length) {
      await this.jobsService.create('deploy_links', {
        textLinkId: link._id.toString(),
        websiteIds: dto.websiteIds,
      });
    }

    await this.discordService.sendNewLinkNotification(link);
    return link;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTextLinkDto) {
    const existing = await this.textLinksService.findById(id);
    if (!existing) throw new NotFoundException('Text link not found');

    const changes: Record<string, { old: any; new: any }> = {};
    if (dto.title && dto.title !== existing.title)
      changes.title = { old: existing.title, new: dto.title };
    if (dto.anchorText && dto.anchorText !== existing.anchorText)
      changes.anchorText = { old: existing.anchorText, new: dto.anchorText };
    if (dto.targetUrl && dto.targetUrl !== existing.targetUrl)
      changes.targetUrl = { old: existing.targetUrl, new: dto.targetUrl };

    const updateData: any = {};
    if (dto.title) updateData.title = dto.title;
    if (dto.anchorText) updateData.anchorText = dto.anchorText;
    if (dto.targetUrl) updateData.targetUrl = dto.targetUrl;
    if (dto.expiresAt !== undefined) updateData.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    const updated = await this.textLinksService.update(id, updateData);

    if (dto.anchorText || dto.targetUrl) {
      await this.jobsService.create('redeploy_link', { textLinkId: id });
    }

    if (dto.websiteIds) {
      await this.jobsService.create('sync_link_websites', {
        textLinkId: id,
        websiteIds: dto.websiteIds,
      });
    }

    if (Object.keys(changes).length > 0) {
      await this.discordService.sendUpdateNotification(updated!, changes);
    }

    return updated;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const link = await this.textLinksService.findById(id);
    if (!link) throw new NotFoundException('Text link not found');

    await this.jobsService.create('undeploy_all', { textLinkId: id });
    await this.textLinksService.delete(id);
    await this.discordService.sendDeleteNotification(link);
    return { success: true };
  }

  @Post(':id/deploy')
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
  async toggle(@Param('id') id: string) {
    const link = await this.textLinksService.findById(id);
    if (!link) throw new NotFoundException('Text link not found');

    if (link.status === 'active') {
      await this.jobsService.create('undeploy_all', { textLinkId: id });
      const updated = await this.textLinksService.update(id, { status: 'disabled' });
      await this.discordService.sendStatusChangeNotification(updated!, 'active', 'disabled');
      return updated;
    } else if (link.status === 'disabled') {
      const updated = await this.textLinksService.update(id, { status: 'active' });
      await this.discordService.sendStatusChangeNotification(updated!, 'disabled', 'active');
      return updated;
    } else if (link.status === 'pending') {
      const updated = await this.textLinksService.update(id, { status: 'active' });
      await this.discordService.sendStatusChangeNotification(updated!, 'pending', 'active');
      return updated;
    }

    throw new BadRequestException(`Cannot toggle link with status: ${link.status}`);
  }
}
