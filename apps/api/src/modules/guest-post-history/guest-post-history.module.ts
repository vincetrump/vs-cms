import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GuestPostHistory, GuestPostHistorySchema } from './schemas/guest-post-history.schema';
import { GuestPostHistoryService } from './guest-post-history.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: GuestPostHistory.name, schema: GuestPostHistorySchema }]),
  ],
  providers: [GuestPostHistoryService],
  exports: [GuestPostHistoryService],
})
export class GuestPostHistoryModule {}
