import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FooterLinkHistory, FooterLinkHistorySchema } from './schemas/footer-link-history.schema';
import { FooterLinkHistoryService } from './footer-link-history.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FooterLinkHistory.name, schema: FooterLinkHistorySchema }]),
  ],
  providers: [FooterLinkHistoryService],
  exports: [FooterLinkHistoryService],
})
export class FooterLinkHistoryModule {}
