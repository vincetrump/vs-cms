import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WebsitePage, WebsitePageDocument } from './schemas/website-page.schema';
import { SshService } from '../ssh/ssh.service';
import { WebsitesService } from '../websites/websites.service';

@Injectable()
export class WebsitePagesService {
  private readonly logger = new Logger(WebsitePagesService.name);

  constructor(
    @InjectModel(WebsitePage.name) private pageModel: Model<WebsitePageDocument>,
    private sshService: SshService,
    private websitesService: WebsitesService,
  ) {}

  async scanAndUpsert(websiteId: string, documentRoot: string, serverIp: string) {
    const pages = await this.sshService.scanSubPages(documentRoot, serverIp);
    const now = new Date();
    const existingFilePaths = new Set<string>();

    for (const page of pages) {
      existingFilePaths.add(page.filePath);
      await this.pageModel.findOneAndUpdate(
        { websiteId: new Types.ObjectId(websiteId), filePath: page.filePath },
        {
          $set: {
            pagePath: page.pagePath,
            hasFooter: page.hasFooter,
            lastScannedAt: now,
          },
          $setOnInsert: { footerLinkCount: 0 },
        },
        { upsert: true },
      );
    }

    await this.pageModel.deleteMany({
      websiteId: new Types.ObjectId(websiteId),
      filePath: { $nin: [...existingFilePaths] },
    });

    await this.websitesService.updatePageScanResults(websiteId, {
      totalSubPages: pages.length,
      lastPageScanAt: now,
    });

    this.logger.log(`Scanned ${pages.length} sub-pages for website ${websiteId}`);
    return pages.length;
  }

  async getPagesForDeploy(websiteId: string, count: number) {
    return this.pageModel
      .find({ websiteId: new Types.ObjectId(websiteId), hasFooter: true })
      .sort({ footerLinkCount: 1, pagePath: 1 })
      .limit(count)
      .exec();
  }

  async refreshFooterLinkCounts(websiteId: string, deploymentModel: Model<any>) {
    const pages = await this.pageModel.find({ websiteId: new Types.ObjectId(websiteId) }).exec();

    for (const page of pages) {
      const count = await deploymentModel.countDocuments({
        websiteId: new Types.ObjectId(websiteId),
        filePath: page.filePath,
        status: 'deployed',
      });
      if (count !== page.footerLinkCount) {
        await this.pageModel.findByIdAndUpdate(page._id, { footerLinkCount: count });
      }
    }
  }

  async incrementFooterLinkCount(websiteId: string, filePath: string) {
    await this.pageModel.findOneAndUpdate(
      { websiteId: new Types.ObjectId(websiteId), filePath },
      { $inc: { footerLinkCount: 1 } },
    );
  }

  async decrementFooterLinkCount(websiteId: string, filePath: string) {
    await this.pageModel.findOneAndUpdate(
      { websiteId: new Types.ObjectId(websiteId), filePath, footerLinkCount: { $gt: 0 } },
      { $inc: { footerLinkCount: -1 } },
    );
  }

  async findByWebsite(websiteId: string) {
    return this.pageModel
      .find({ websiteId: new Types.ObjectId(websiteId) })
      .sort({ pagePath: 1 })
      .exec();
  }

  async isScanFresh(websiteId: string, maxAgeMs = 24 * 60 * 60 * 1000): Promise<boolean> {
    const latest = await this.pageModel
      .findOne({ websiteId: new Types.ObjectId(websiteId) })
      .sort({ lastScannedAt: -1 })
      .exec();
    if (!latest?.lastScannedAt) return false;
    return Date.now() - latest.lastScannedAt.getTime() < maxAgeMs;
  }
}
