import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TextLinkHistory, TextLinkHistorySchema } from './schemas/text-link-history.schema';
import { TextLinkHistoryService } from './text-link-history.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: TextLinkHistory.name, schema: TextLinkHistorySchema }]),
  ],
  providers: [TextLinkHistoryService],
  exports: [TextLinkHistoryService],
})
export class TextLinkHistoryModule {}
