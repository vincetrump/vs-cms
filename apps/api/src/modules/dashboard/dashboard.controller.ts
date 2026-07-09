import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { WebsitesService } from '../websites/websites.service';
import { TextLinksService } from '../text-links/text-links.service';
import { FooterLinksService } from '../footer-links/footer-links.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class DashboardController {
  constructor(
    private websitesService: WebsitesService,
    private textLinksService: TextLinksService,
    private footerLinksService: FooterLinksService,
  ) {}

  @Get('stats')
  async getStats() {
    const [
      totalWebsites,
      activeWebsites,
      totalLinks,
      activeLinks,
      pendingLinks,
      disabledLinks,
      expiringIn7Days,
      activeFooterLinks,
      pendingFooterLinks,
    ] = await Promise.all([
      this.websitesService.count(),
      this.websitesService.countByStatus('active'),
      this.textLinksService.count(),
      this.textLinksService.countByStatus('active'),
      this.textLinksService.countByStatus('pending'),
      this.textLinksService.countByStatus('disabled'),
      this.textLinksService.countExpiringWithinDays(7),
      this.footerLinksService.countByStatus('active'),
      this.footerLinksService.countByStatus('pending'),
    ]);

    return {
      totalWebsites,
      activeWebsites,
      totalLinks,
      activeLinks,
      pendingLinks,
      disabledLinks,
      expiringIn7Days,
      activeFooterLinks,
      pendingFooterLinks,
    };
  }
}
