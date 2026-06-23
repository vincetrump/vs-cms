import { IsString, IsUrl, IsOptional, IsDateString, IsArray } from 'class-validator';

export class UpdateTextLinkDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  anchorText?: string;

  @IsOptional()
  @IsUrl({}, { message: 'targetUrl must be a valid URL' })
  targetUrl?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  websiteIds?: string[];
}
