import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseQueryPipe, ParsedQuery } from '../../common/pipes/parse-query.pipe';
import { IsString, IsOptional, IsNumber } from 'class-validator';

class CreateApiKeyDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  rateLimit?: number;
}

@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ApiKeysController {
  constructor(private apiKeysService: ApiKeysService) {}

  @Get()
  async findAll(@Query(new ParseQueryPipe()) query: ParsedQuery) {
    return this.apiKeysService.findAll(query);
  }

  @Post()
  async create(@Body() dto: CreateApiKeyDto) {
    return this.apiKeysService.create(dto.name, dto.rateLimit);
  }

  @Patch(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    return this.apiKeysService.deactivate(id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.apiKeysService.delete(id);
  }
}
