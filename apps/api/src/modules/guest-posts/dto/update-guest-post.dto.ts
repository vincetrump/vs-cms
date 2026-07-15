import { IsString, IsUrl, IsOptional, IsDateString, IsArray, IsIn, IsNumber, IsBoolean, MaxLength, Matches, Min, Max, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { BacklinkDto } from './backlink.dto';

export class UpdateGuestPostDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must contain only lowercase alphanumeric characters and hyphens' })
  slug?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  metaDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, { message: 'category must contain only lowercase alphanumeric characters and hyphens' })
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  anchorText?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'targetUrl must be a valid http/https URL' })
  @MaxLength(2048)
  targetUrl?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(dofollow|nofollow|noopener|noreferrer|sponsored|ugc|external)(\s+(nofollow|noopener|noreferrer|sponsored|ugc|external))*$/, {
    message: 'rel must contain only valid tokens: nofollow, noopener, noreferrer, sponsored, ugc, external',
  })
  rel?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @IsIn(['manual', 'ai'])
  contentSource?: string;

  @IsOptional()
  @IsBoolean()
  hideBacklink?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @ValidateNested({ each: true })
  @Type(() => BacklinkDto)
  extraBacklinks?: BacklinkDto[];

  // Tham số AI — áp dụng cho các lần deploy tới website mới
  @IsOptional()
  @IsString()
  @MaxLength(300)
  aiTopic?: string;

  @IsOptional()
  @IsNumber()
  @Min(300)
  @Max(2000)
  aiWordCount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  websiteIds?: string[];
}
