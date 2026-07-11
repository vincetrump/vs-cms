import { IsString, IsUrl, IsOptional, IsNumber, IsIn, MaxLength, Min, Max } from 'class-validator';

export class GenerateContentDto {
  @IsString()
  @MaxLength(300)
  topic: string;

  @IsString()
  @MaxLength(500)
  anchorText: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'targetUrl must be a valid http/https URL' })
  @MaxLength(2048)
  targetUrl: string;

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
