import { IsString, IsUrl, IsOptional, IsDateString, IsArray, IsNumber, IsBoolean, MaxLength, Matches, Min, Max } from 'class-validator';

export class CreateFooterLinkDto {
  @IsString()
  @MaxLength(500)
  title: string;

  @IsString()
  @MaxLength(500)
  anchorText: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'targetUrl must be a valid http/https URL' })
  @MaxLength(2048)
  targetUrl: string;

  @IsOptional()
  @IsString()
  @Matches(/^(nofollow|noopener|noreferrer|sponsored|ugc|external)(\s+(nofollow|noopener|noreferrer|sponsored|ugc|external))*$/, {
    message: 'rel must contain only valid tokens: nofollow, noopener, noreferrer, sponsored, ugc, external',
  })
  rel?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsNumber()
  @Min(1)
  @Max(50)
  pageCount: number;

  @IsOptional()
  @IsBoolean()
  includeHomepage?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  websiteIds?: string[];
}
