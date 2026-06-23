import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { WebsitesService } from './websites.service';
import { JobsService } from '../jobs/jobs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ParseQueryPipe, ParsedQuery } from '../../common/pipes/parse-query.pipe';

@Controller('websites')
@UseGuards(JwtAuthGuard)
export class WebsitesController {
  constructor(
    private websitesService: WebsitesService,
    private jobsService: JobsService,
  ) {}

  @Get()
  async findAll(@Query(new ParseQueryPipe()) query: ParsedQuery) {
    return this.websitesService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.websitesService.findById(id);
  }

  @Post('sync')
  async sync() {
    const job = await this.jobsService.create('sync_websites');
    return { jobId: job._id, message: 'Sync job queued' };
  }
}
