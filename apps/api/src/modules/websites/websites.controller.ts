import { Controller, Get, Param, Post, Req, Query, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WebsitesService } from './websites.service';
import { JobsService } from '../jobs/jobs.service';
import { LinkDeploymentsService } from '../link-deployments/link-deployments.service';
import { FooterLinkDeploymentsService } from '../footer-link-deployments/footer-link-deployments.service';
import { WebsitePagesService } from '../website-pages/website-pages.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseQueryPipe, ParsedQuery } from '../../common/pipes/parse-query.pipe';
import { Request } from 'express';

@Controller('websites')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WebsitesController {
  constructor(
    private websitesService: WebsitesService,
    private jobsService: JobsService,
    private linkDeploymentsService: LinkDeploymentsService,
    private footerLinkDeploymentsService: FooterLinkDeploymentsService,
    private websitePagesService: WebsitePagesService,
  ) {}

  @Get()
  async findAll(@Query(new ParseQueryPipe()) query: ParsedQuery, @Req() req: Request) {
    const role = (req as any).user?.role;
    if (role !== 'admin') {
      const websites = await this.websitesService.findAllActive();
      const safe = websites.map((w: any) => ({ _id: w._id, domain: w.domain }));
      return { data: safe, total: safe.length };
    }
    return this.websitesService.findAll(query);
  }

  @Get(':id')
  @Roles('admin')
  async findOne(@Param('id') id: string) {
    const website = await this.websitesService.findById(id);
    if (!website) return null;
    const deployments = await this.linkDeploymentsService.findByWebsite(id);
    const obj = website.toObject();
    return { ...obj, deployments };
  }

  @Get(':id/pages')
  @Roles('admin')
  async getPages(@Param('id') id: string) {
    const website = await this.websitesService.findById(id);
    if (!website) throw new NotFoundException('Website not found');
    return this.websitePagesService.findByWebsite(id);
  }

  @Get(':id/footer-deployments')
  @Roles('admin')
  async getFooterDeployments(@Param('id') id: string) {
    return this.footerLinkDeploymentsService.findByWebsite(id);
  }

  @Post(':id/scan-pages')
  @Roles('admin')
  async scanPages(@Param('id') id: string) {
    const website = await this.websitesService.findById(id);
    if (!website) throw new NotFoundException('Website not found');
    if (!website.documentRoot) throw new NotFoundException('Website has no document root');
    const job = await this.jobsService.create('scan_website_pages', { websiteIds: [id] });
    return { jobId: job._id, message: 'Scan job queued' };
  }

  @Post('sync')
  @Roles('admin')
  async sync() {
    const job = await this.jobsService.create('sync_websites');
    return { jobId: job._id, message: 'Sync job queued' };
  }
}
