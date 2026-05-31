import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { TelegramBotsModule } from '../telegram-bots/telegram-bots.module';
import { TelegramChannelsModule } from '../telegram-channels/telegram-channels.module';
import { TelegramSyncController } from './telegram-sync.controller';
import { TelegramSyncService } from './telegram-sync.service';
import { TelegramUpdatesProcessor } from './telegram-updates.processor';
import { TelegramCronService } from './telegram-cron.service';

@Module({
  imports: [PrismaModule, CommonModule, TelegramBotsModule, TelegramChannelsModule],
  controllers: [TelegramSyncController],
  providers: [TelegramSyncService, TelegramUpdatesProcessor, TelegramCronService],
  exports: [TelegramSyncService, TelegramUpdatesProcessor],
})
export class TelegramSyncModule {}
