import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface CloudflareZone {
  id: string;
  name: string;
  status: string;
}

@Injectable()
export class CloudflareService {
  private readonly logger = new Logger(CloudflareService.name);
  private readonly apiToken: string;
  private readonly baseUrl = 'https://api.cloudflare.com/client/v4';

  constructor(private configService: ConfigService) {
    this.apiToken = this.configService.get<string>('cloudflare.apiToken', '');
  }

  async listZones(): Promise<CloudflareZone[]> {
    const zones: CloudflareZone[] = [];
    let page = 1;
    const perPage = 50;

    while (true) {
      try {
        const response = await axios.get(`${this.baseUrl}/zones`, {
          headers: { Authorization: `Bearer ${this.apiToken}` },
          params: { per_page: perPage, page },
        });

        const data = response.data;
        if (!data.success) {
          this.logger.error('Cloudflare API error', data.errors);
          break;
        }

        zones.push(
          ...data.result.map((z: any) => ({
            id: z.id,
            name: z.name,
            status: z.status,
          })),
        );

        if (data.result.length < perPage) break;
        page++;
      } catch (err: any) {
        this.logger.error(`Cloudflare API request failed: ${err.message}`);
        break;
      }
    }

    return zones;
  }
}
