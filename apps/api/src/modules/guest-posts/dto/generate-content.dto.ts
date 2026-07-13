import { IsString, IsUrl, IsOptional, IsNumber, IsIn, IsMongoId, MaxLength, Min, Max, Matches } from 'class-validator';

export class GenerateContentDto {
  // Optional: bỏ trống để AI tự chọn chủ đề theo website (cần websiteId)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  topic?: string;

  // Optional: AI đọc metadata của website này (siteName, description, categories) để chọn chủ đề + category phù hợp
  @IsOptional()
  @IsMongoId()
  websiteId?: string;

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
  @IsString()
  @IsIn(['vi', 'en'])
  language?: string;

  @IsOptional()
  @IsNumber()
  @Min(300)
  @Max(2000)
  wordCount?: number;
}
