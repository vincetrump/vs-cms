import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name);
  private readonly webhookUrl: string;
  private readonly adminUrl: string;

  private readonly footerWebhookUrl: string;

  constructor(private configService: ConfigService) {
    this.webhookUrl = this.configService.get<string>('discord.webhookUrl', '');
    this.footerWebhookUrl = this.configService.get<string>('discord.footerWebhookUrl', '');
    this.adminUrl = this.configService.get<string>('app.adminUrl', 'http://localhost:5173');
  }

  async sendNewLinkNotification(link: any) {
    const embed = {
      title: '🔗 New Text Link Created',
      color: 0x3498db,
      fields: [
        { name: 'Title', value: link.title, inline: true },
        { name: 'Anchor Text', value: link.anchorText, inline: true },
        { name: 'Target URL', value: link.targetUrl },
        { name: 'Source', value: link.source, inline: true },
        { name: 'Status', value: link.status, inline: true },
        { name: 'Expires', value: link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : 'Never', inline: true },
      ],
      footer: { text: `ID: ${link._id}` },
      timestamp: new Date().toISOString(),
    };

    if (link.status === 'pending') {
      embed.fields.push({
        name: 'Actions',
        value: `[✅ Approve](${this.adminUrl}/text-links/show/${link._id}?action=approve) | [❌ Reject](${this.adminUrl}/text-links/show/${link._id}?action=reject)`,
      });
    }

    await this.sendWebhook({ embeds: [embed] });
  }

  async sendUpdateNotification(link: any, changes: Record<string, { old: any; new: any }>) {
    const changeLines = Object.entries(changes)
      .map(([key, val]) => `**${key}**: \`${val.old}\` → \`${val.new}\``)
      .join('\n');

    const embed = {
      title: '✏️ Text Link Updated',
      color: 0xf39c12,
      fields: [
        { name: 'Title', value: link.title, inline: true },
        { name: 'Link ID', value: String(link._id), inline: true },
        { name: 'Changes', value: changeLines || 'No field changes' },
      ],
      footer: { text: `ID: ${link._id}` },
      timestamp: new Date().toISOString(),
    };

    await this.sendWebhook({ embeds: [embed] });
  }

  async sendStatusChangeNotification(link: any, oldStatus: string, newStatus: string) {
    const colorMap: Record<string, number> = {
      active: 0x2ecc71,
      disabled: 0xe74c3c,
      expired: 0x95a5a6,
      pending: 0xf39c12,
    };

    const embed = {
      title: '🔄 Text Link Status Changed',
      color: colorMap[newStatus] || 0x3498db,
      fields: [
        { name: 'Title', value: link.title, inline: true },
        { name: 'Status Change', value: `\`${oldStatus}\` → \`${newStatus}\``, inline: true },
        { name: 'Target URL', value: link.targetUrl },
      ],
      footer: { text: `ID: ${link._id}` },
      timestamp: new Date().toISOString(),
    };

    await this.sendWebhook({ embeds: [embed] });
  }

  async sendPendingReviewNotification(link: any, changes: Record<string, { old: any; new: any }>) {
    const changeLines = Object.entries(changes)
      .filter(([key]) => key !== 'status')
      .map(([key, val]) => `**${key}**: \`${val.old}\` → \`${val.new}\``)
      .join('\n');

    const embed = {
      title: '⚠️ Text Link Edit — Pending Approval',
      color: 0xf39c12,
      fields: [
        { name: 'Title', value: link.title, inline: true },
        { name: 'Status', value: '`active` → `pending`', inline: true },
        { name: 'Changes', value: changeLines || 'No field changes' },
        {
          name: 'Actions',
          value: `[✅ Review & Approve](${this.adminUrl}/text-links/show/${link._id})`,
        },
      ],
      footer: { text: `ID: ${link._id} • Websites keep old content until approved` },
      timestamp: new Date().toISOString(),
    };

    await this.sendWebhook({ embeds: [embed] });
  }

  async sendPendingReminderNotification(links: any[]) {
    const lines = links.slice(0, 15).map(
      (l: any) => `• **${l.title}** — [Review](${this.adminUrl}/text-links/show/${l._id})`,
    );

    const embed = {
      title: '🔔 Pending Links Reminder',
      color: 0xf39c12,
      description: `${links.length} text link(s) awaiting admin approval:`,
      fields: [{ name: 'Links', value: lines.join('\n') }],
      timestamp: new Date().toISOString(),
    };
    if (links.length > 15) {
      embed.fields.push({ name: '', value: `...and ${links.length - 15} more` });
    }

    await this.sendWebhook({ embeds: [embed] });
  }

  async sendDeploymentNotification(link: any, results: any[]) {
    const success = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    const embed = {
      title: '🚀 Text Link Deployed',
      color: failed === 0 ? 0x2ecc71 : 0xf39c12,
      fields: [
        { name: 'Title', value: link.title, inline: true },
        { name: 'Target', value: link.targetUrl, inline: true },
        { name: 'Results', value: `✅ ${success} succeeded | ❌ ${failed} failed` },
        { name: 'Websites', value: results.map((r) => `${r.success ? '✅' : '❌'} ${r.domain}`).join('\n') || 'None' },
      ],
      footer: { text: `ID: ${link._id}` },
      timestamp: new Date().toISOString(),
    };

    await this.sendWebhook({ embeds: [embed] });
  }

  async sendDeleteNotification(link: any) {
    const embed = {
      title: '🗑️ Text Link Deleted',
      color: 0xe74c3c,
      fields: [
        { name: 'Title', value: link.title, inline: true },
        { name: 'Target URL', value: link.targetUrl, inline: true },
      ],
      footer: { text: `ID: ${link._id}` },
      timestamp: new Date().toISOString(),
    };

    await this.sendWebhook({ embeds: [embed] });
  }

  async sendExpirationNotification(links: any[]) {
    const embed = {
      title: '⏰ Text Links Expired',
      color: 0x95a5a6,
      description: `${links.length} text link(s) have expired and been removed.`,
      fields: links.slice(0, 10).map((l) => ({
        name: l.title,
        value: `${l.targetUrl} | Expired: ${new Date(l.expiresAt).toLocaleDateString()}`,
      })),
      timestamp: new Date().toISOString(),
    };

    await this.sendWebhook({ embeds: [embed] });
  }

  async sendFooterLinkCreatedNotification(link: any) {
    const embed = {
      title: '🦶 New Footer Link Created',
      color: link.status === 'pending' ? 0xf39c12 : 0x3498db,
      fields: [
        { name: 'Title', value: link.title, inline: true },
        { name: 'Anchor Text', value: link.anchorText, inline: true },
        { name: 'Target URL', value: link.targetUrl },
        { name: 'Pages/Website', value: `${link.pageCount}${link.includeHomepage ? ' + homepage' : ''}`, inline: true },
        { name: 'Rel', value: link.rel || 'dofollow', inline: true },
        { name: 'Status', value: link.status, inline: true },
        { name: 'Expires', value: link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : 'Never', inline: true },
      ],
      footer: { text: `ID: ${link._id}` },
      timestamp: new Date().toISOString(),
    };

    if (link.status === 'pending') {
      embed.fields.push({
        name: 'Actions',
        value: `[✅ Approve](${this.adminUrl}/footer-links/show/${link._id})`,
      });
    }

    await this.sendFooterWebhook({ embeds: [embed] });
  }

  async sendFooterLinkUpdatedNotification(link: any, changes: Record<string, { old: any; new: any }>) {
    const changeLines = Object.entries(changes)
      .map(([key, val]) => `**${key}**: \`${val.old}\` → \`${val.new}\``)
      .join('\n');

    const embed = {
      title: '✏️ Footer Link Updated',
      color: 0xf39c12,
      fields: [
        { name: 'Title', value: link.title, inline: true },
        { name: 'Link ID', value: String(link._id), inline: true },
        { name: 'Changes', value: changeLines || 'No field changes' },
      ],
      footer: { text: `ID: ${link._id}` },
      timestamp: new Date().toISOString(),
    };

    await this.sendFooterWebhook({ embeds: [embed] });
  }

  async sendFooterLinkPendingReviewNotification(link: any, changes: Record<string, { old: any; new: any }>) {
    const changeLines = Object.entries(changes)
      .filter(([key]) => key !== 'status')
      .map(([key, val]) => `**${key}**: \`${val.old}\` → \`${val.new}\``)
      .join('\n');

    const embed = {
      title: '⚠️ Footer Link Edit — Pending Approval',
      color: 0xf39c12,
      fields: [
        { name: 'Title', value: link.title, inline: true },
        { name: 'Status', value: '`active` → `pending`', inline: true },
        { name: 'Changes', value: changeLines || 'No field changes' },
        {
          name: 'Actions',
          value: `[✅ Review & Approve](${this.adminUrl}/footer-links/show/${link._id})`,
        },
      ],
      footer: { text: `ID: ${link._id}` },
      timestamp: new Date().toISOString(),
    };

    await this.sendFooterWebhook({ embeds: [embed] });
  }

  async sendFooterLinkStatusChangeNotification(link: any, oldStatus: string, newStatus: string) {
    const colorMap: Record<string, number> = {
      active: 0x2ecc71,
      disabled: 0xe74c3c,
      expired: 0x95a5a6,
      pending: 0xf39c12,
    };

    const embed = {
      title: '🔄 Footer Link Status Changed',
      color: colorMap[newStatus] || 0x3498db,
      fields: [
        { name: 'Title', value: link.title, inline: true },
        { name: 'Status Change', value: `\`${oldStatus}\` → \`${newStatus}\``, inline: true },
        { name: 'Target URL', value: link.targetUrl },
      ],
      footer: { text: `ID: ${link._id}` },
      timestamp: new Date().toISOString(),
    };

    await this.sendFooterWebhook({ embeds: [embed] });
  }

  async sendFooterLinkDeployNotification(link: any, results: any[]) {
    const success = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalPages = results.reduce((sum, r) => sum + (r.pagesDeployed || 0), 0);

    const embed = {
      title: '🚀 Footer Link Deployed',
      color: failed === 0 ? 0x2ecc71 : 0xf39c12,
      fields: [
        { name: 'Title', value: link.title, inline: true },
        { name: 'Target', value: link.targetUrl, inline: true },
        { name: 'Results', value: `✅ ${success} websites (${totalPages} pages) | ❌ ${failed} failed` },
        { name: 'Websites', value: results.map((r) => `${r.success ? '✅' : '❌'} ${r.domain}${r.success ? ` (${r.pagesDeployed} pages)` : ''}`).join('\n') || 'None' },
      ],
      footer: { text: `ID: ${link._id}` },
      timestamp: new Date().toISOString(),
    };

    await this.sendFooterWebhook({ embeds: [embed] });
  }

  async sendFooterLinkUndeployNotification(link: any, results: any[]) {
    const totalRemoved = results.reduce((sum, r) => sum + (r.pagesRemoved || 0), 0);

    const embed = {
      title: '🔻 Footer Link Undeployed',
      color: 0xe74c3c,
      fields: [
        { name: 'Title', value: link.title || 'Deleted link', inline: true },
        { name: 'Results', value: `Removed from ${totalRemoved} pages across ${results.length} website(s)` },
      ],
      footer: { text: `ID: ${link._id}` },
      timestamp: new Date().toISOString(),
    };

    await this.sendFooterWebhook({ embeds: [embed] });
  }

  async sendFooterLinkDeleteNotification(link: any) {
    const embed = {
      title: '🗑️ Footer Link Deleted',
      color: 0xe74c3c,
      fields: [
        { name: 'Title', value: link.title, inline: true },
        { name: 'Anchor Text', value: link.anchorText, inline: true },
        { name: 'Target URL', value: link.targetUrl },
      ],
      footer: { text: `ID: ${link._id}` },
      timestamp: new Date().toISOString(),
    };

    await this.sendFooterWebhook({ embeds: [embed] });
  }

  async sendFooterLinkExpirationNotification(links: any[]) {
    const embed = {
      title: '⏰ Footer Links Expired',
      color: 0x95a5a6,
      description: `${links.length} footer link(s) have expired and been removed from all pages.`,
      fields: links.slice(0, 10).map((l) => ({
        name: l.title,
        value: `${l.targetUrl} | Expired: ${new Date(l.expiresAt).toLocaleDateString()}`,
      })),
      timestamp: new Date().toISOString(),
    };

    await this.sendFooterWebhook({ embeds: [embed] });
  }

  private async sendWebhook(payload: any) {
    if (!this.webhookUrl) {
      this.logger.warn('Discord webhook URL not configured');
      return;
    }

    try {
      await axios.post(this.webhookUrl, payload);
    } catch (err: any) {
      this.logger.error(`Discord webhook failed: ${err.message}`);
    }
  }

  private async sendFooterWebhook(payload: any) {
    if (!this.footerWebhookUrl) {
      this.logger.warn('Discord footer webhook URL not configured');
      return;
    }

    try {
      await axios.post(this.footerWebhookUrl, payload);
    } catch (err: any) {
      this.logger.error(`Discord footer webhook failed: ${err.message}`);
    }
  }
}
