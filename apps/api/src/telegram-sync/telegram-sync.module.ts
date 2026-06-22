import { Module } from '@nestjs/common';
import { AdCampaignsModule } from '../ad-campaigns/ad-campaigns.module';
import { TelegramChannelsModule } from '../telegram-channels/telegram-channels.module';
import { DailyAnalyticsSyncService } from './daily-analytics-sync.service';
import { TelegramCronService } from './telegram-cron.service';
import { TelegramSyncController } from './telegram-sync.controller';

@Module({
  imports: [TelegramChannelsModule, AdCampaignsModule],
  controllers: [TelegramSyncController],
  providers: [TelegramCronService, DailyAnalyticsSyncService],
})
export class TelegramSyncModule {}
