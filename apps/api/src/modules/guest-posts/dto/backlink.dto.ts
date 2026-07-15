import { IsString, IsUrl, IsOptional, IsBoolean, MaxLength, Matches } from 'class-validator';

// Backlink phụ trong guest post — chung expiration với post
export class BacklinkDto {
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
  @IsBoolean()
  hideBacklink?: boolean;
}
