import { Controller, Get, Param, Query, Res, UseGuards, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { JobsService } from './jobs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class JobsController {
  constructor(private jobsService: JobsService) {}

  @Get()
  async findAll(
    @Res({ passthrough: true }) res: Response,
    @Query('_start') start?: string,
    @Query('_end') end?: string,
    @Query('_sort') sort?: string,
    @Query('_order') order?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    const skip = start ? parseInt(start, 10) : 0;
    const limit = end ? parseInt(end, 10) - skip : 20;

    const { data, total } = await this.jobsService.findAll({
      status,
      type,
      skip,
      limit,
    });

    res.setHeader('X-Total-Count', total);
    res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count');
    return data;
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const job = await this.jobsService.findById(id);
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }
}
