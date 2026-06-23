import { IsString, IsUrl, IsOptional, IsDateString, IsArray } from 'class-validator';

export class CreateTextLinkDto {
  @IsString()
  title: string;

  @IsString()
  anchorText: string;

  @IsUrl({}, { message: 'targetUrl must be a valid URL' })
  targetUrl: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  websiteIds?: string[];
}
