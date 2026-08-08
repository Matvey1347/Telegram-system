import { Module } from '@nestjs/common';
import { AdCampaignsModule } from '../ad-campaigns/ad-campaigns.module';
import { TelegramChannelsModule } from '../telegram-channels/telegram-channels.module';
import { DailyAnalyticsSyncService } from './daily-analytics-sync.service';
import { TelegramSyncController } from './telegram-sync.controller';
import { TelegramWorkspaceSyncTasksService } from './telegram-workspace-sync-tasks.service';

@Module({
  imports: [TelegramChannelsModule, AdCampaignsModule],
  controllers: [TelegramSyncController],
  providers: [DailyAnalyticsSyncService, TelegramWorkspaceSyncTasksService],
  exports: [DailyAnalyticsSyncService, TelegramWorkspaceSyncTasksService],
})
export class TelegramSyncModule {}
