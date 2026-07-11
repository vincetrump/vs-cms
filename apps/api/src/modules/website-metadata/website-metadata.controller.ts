import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { WebsiteMetadataService } from './website-metadata.service';
import { JobsService } from '../jobs/jobs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('website-metadata')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class WebsiteMetadataController {
  constructor(
    private metadataService: WebsiteMetadataService,
    private jobsService: JobsService,
  ) {}

  @Post('scan')
  async scan(@Body('websiteIds') websiteIds?: string[]) {
    const job = await this.jobsService.create('scan_website_metadata', {
      ...(websiteIds?.length ? { websiteIds } : {}),
    });
    return { jobId: job._id, message: 'Metadata scan job queued' };
  }

  @Get(':websiteId')
  async findOne(@Param('websiteId') websiteId: string) {
    const metadata = await this.metadataService.findByWebsite(websiteId);
    if (!metadata) throw new NotFoundException('Metadata not found — run a scan first');
    return metadata;
  }

  @Get(':websiteId/preview')
  async preview(@Param('websiteId') websiteId: string) {
    const html = await this.metadataService.renderPreview(websiteId);
    return { html };
  }
}
