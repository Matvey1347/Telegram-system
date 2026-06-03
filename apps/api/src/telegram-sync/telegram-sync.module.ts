import { Module } from '@nestjs/common';
import { TelegramChannelsModule } from '../telegram-channels/telegram-channels.module';
import { TelegramCronService } from './telegram-cron.service';

@Module({
  imports: [TelegramChannelsModule],
  providers: [TelegramCronService],
})
export class TelegramSyncModule {}
