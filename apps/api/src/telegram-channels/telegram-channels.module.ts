import { Module } from '@nestjs/common';
import { TelegramChannelsController } from './telegram-channels.controller';
import { TelegramChannelsService } from './telegram-channels.service';
import { TelegramBotsModule } from '../telegram-bots/telegram-bots.module';

@Module({
  imports: [TelegramBotsModule],
  controllers: [TelegramChannelsController],
  providers: [TelegramChannelsService],
})
export class TelegramChannelsModule {}
