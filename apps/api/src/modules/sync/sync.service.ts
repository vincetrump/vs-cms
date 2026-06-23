import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudflareService } from '../cloudflare/cloudflare.service';
import { SshService } from '../ssh/ssh.service';
import { WebsitesService } from '../websites/websites.service';
import { LinkDeploymentsService } from '../link-deployments/link-deployments.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly defaultServer: string;

  constructor(
    private cloudflareService: CloudflareService,
    private sshService: SshService,
    private websitesService: WebsitesService,
    private linkDeploymentsService: LinkDeploymentsService,
    private configService: ConfigService,
  ) {
    this.defaultServer = this.configService.get<string>('ssh.defaultServer', '68.183.188.19');
  }

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

        const dns = await this.checkDns(zone.id, zone.name);

        await this.websitesService.upsertByDomain(zone.name, {
          cloudflareZoneId: zone.id,
          documentRoot: docRoot || null,
          homepagePath,
          status,
          dnsStatus: dns.status,
          dnsRecordIps: dns.ips,
          dnsProxied: dns.proxied,
        });

        synced++;
      } catch (err: any) {
        this.logger.error(`Failed to sync ${zone.name}: ${err.message}`);
        errors++;
      }
    }

    this.logger.log(`Sync completed: ${synced} synced, ${errors} errors`);

    const activeWebsites = await this.websitesService.findAllActive();
    let reconciled = 0;
    let reconcileAdded = 0;
    let reconcileRemoved = 0;
    let reconcileOrphaned = 0;

    let totalExternalLinks = 0;

    for (const website of activeWebsites) {
      try {
        const result = await this.linkDeploymentsService.reconcileWebsiteLinks(
          website._id.toString(),
        );
        reconcileAdded += result.added;
        reconcileRemoved += result.removed;
        reconcileOrphaned += result.orphaned;
        reconciled++;

        await this.websitesService.updateScanResults(website._id.toString(), {
          externalLinks: result.externalLinks,
          deployedLinkCount: result.deployedCount,
        });
        totalExternalLinks += result.externalLinks.length;
      } catch (err: any) {
        this.logger.error(
          `Reconcile failed for ${website.domain}: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `Reconciliation: ${reconciled} websites, +${reconcileAdded} added, -${reconcileRemoved} removed, ${reconcileOrphaned} orphaned, ${totalExternalLinks} external links found`,
    );

    return {
      total: zones.length,
      synced,
      errors,
      reconciled,
      reconcileAdded,
      reconcileRemoved,
      reconcileOrphaned,
      totalExternalLinks,
    };
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

  private async checkDns(
    zoneId: string,
    domain: string,
  ): Promise<{ status: string; ips: string[]; proxied: boolean | null }> {
    try {
      const records = await this.cloudflareService.getDnsRecords(zoneId);
      const rootRecords = records.filter(
        (r) => r.name === domain || r.name === `www.${domain}`,
      );

      if (!rootRecords.length) {
        return { status: 'no_records', ips: [], proxied: null };
      }

      const aRecords = rootRecords.filter((r) => r.type === 'A' || r.type === 'AAAA');
      const cnameRecords = rootRecords.filter((r) => r.type === 'CNAME');

      const ips = aRecords.map((r) => r.content);
      const proxied = rootRecords.some((r) => r.proxied) ? true : false;

      if (cnameRecords.length && !aRecords.length) {
        return { status: 'cname', ips: cnameRecords.map((r) => r.content), proxied };
      }

      const pointsToServer = ips.some((ip) => ip === this.defaultServer);

      if (pointsToServer) {
        return { status: 'ok', ips, proxied };
      }

      return { status: 'mismatch', ips, proxied };
    } catch (err: any) {
      this.logger.error(`DNS check failed for ${domain}: ${err.message}`);
      return { status: 'error', ips: [], proxied: null };
    }
  }

  private findDocRoot(domain: string, docRoots: Map<string, string>): string | null {
    if (docRoots.has(domain)) return docRoots.get(domain)!;

    for (const [key, value] of docRoots) {
      if (key.includes(domain) || domain.includes(key)) return value;
    }

    return null;
  }
}
