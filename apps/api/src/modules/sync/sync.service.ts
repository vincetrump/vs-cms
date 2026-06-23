import { Injectable, Logger } from '@nestjs/common';
import { CloudflareService } from '../cloudflare/cloudflare.service';
import { SshService } from '../ssh/ssh.service';
import { WebsitesService } from '../websites/websites.service';
import { LinkDeploymentsService } from '../link-deployments/link-deployments.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private cloudflareService: CloudflareService,
    private sshService: SshService,
    private websitesService: WebsitesService,
    private linkDeploymentsService: LinkDeploymentsService,
  ) {}

  async syncWebsites() {
    this.logger.log('Starting website sync...');

    const zones = await this.cloudflareService.listZones();
    this.logger.log(`Found ${zones.length} zones in Cloudflare`);

    let docRoots = new Map<string, string>();
    try {
      docRoots = await this.sshService.findLiteSpeedDocRoots();
      this.logger.log(`Found ${docRoots.size} document roots on server`);
    } catch (err: any) {
      this.logger.error(`Failed to get doc roots: ${err.message}`);
    }

    let synced = 0;
    let errors = 0;

    for (const zone of zones) {
      try {
        const docRoot = this.findDocRoot(zone.name, docRoots);
        let homepagePath: string | null = null;
        let status = 'not_configured';

        if (docRoot) {
          homepagePath = await this.sshService.findHomepageFile(docRoot);
          status = homepagePath ? 'active' : 'not_configured';
        }

        await this.websitesService.upsertByDomain(zone.name, {
          cloudflareZoneId: zone.id,
          documentRoot: docRoot || null,
          homepagePath,
          status,
        });

        synced++;
      } catch (err: any) {
        this.logger.error(`Failed to sync ${zone.name}: ${err.message}`);
        errors++;
      }
    }

    this.logger.log(`Sync completed: ${synced} synced, ${errors} errors`);
    return { total: zones.length, synced, errors };
  }

  async verifyAllDeployments() {
    this.logger.log('Starting deployment verification...');
    const websites = await this.websitesService.findAllActive();
    let verified = 0;
    let failures = 0;

    for (const website of websites) {
      const deployments = await this.linkDeploymentsService.findByWebsite(website._id.toString());
      for (const deployment of deployments) {
        const valid = await this.linkDeploymentsService.verifyDeployment(
          deployment.textLinkId.toString(),
          website._id.toString(),
        );
        if (valid) verified++;
        else failures++;
      }
    }

    this.logger.log(`Verification done: ${verified} ok, ${failures} failed`);
    return { verified, failures };
  }

  private findDocRoot(domain: string, docRoots: Map<string, string>): string | null {
    if (docRoots.has(domain)) return docRoots.get(domain)!;

    for (const [key, value] of docRoots) {
      if (key.includes(domain) || domain.includes(key)) return value;
    }

    return null;
  }
}
