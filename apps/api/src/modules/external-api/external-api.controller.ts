import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { TextLinksService } from '../text-links/text-links.service';
import { DiscordService } from '../discord/discord.service';
import { IsString, IsUrl, IsOptional, IsDateString } from 'class-validator';

class CreateExternalTextLinkDto {
  @IsString()
  title: string;

  @IsString()
  anchorText: string;

  @IsUrl()
  targetUrl: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

@Controller('api/v1')
@UseGuards(ApiKeyGuard)
export class ExternalApiController {
  constructor(
    private textLinksService: TextLinksService,
    private discordService: DiscordService,
  ) {}

  @Post('text-links')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async createTextLink(@Body() dto: CreateExternalTextLinkDto, @Req() req: any) {
    const link = await this.textLinksService.create({
      title: dto.title,
      anchorText: dto.anchorText,
      targetUrl: dto.targetUrl,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      status: 'pending',
      source: 'api',
      apiKeyId: req.apiKey._id,
    });

    await this.discordService.sendNewLinkNotification(link);

    return {
      id: link._id,
      status: link.status,
      message: 'Text link created. Awaiting admin approval.',
    };
  }

  @Get('text-links/:id')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getTextLink(@Param('id') id: string) {
    const link = await this.textLinksService.findById(id);
    if (!link) throw new NotFoundException('Text link not found');

    return {
      id: link._id,
      title: link.title,
      anchorText: link.anchorText,
      targetUrl: link.targetUrl,
      status: link.status,
      expiresAt: link.expiresAt,
      createdAt: (link as any).createdAt,
    };
  }
}
