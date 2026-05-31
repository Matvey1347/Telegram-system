import { Module } from '@nestjs/common';
import { TelegramBotsController } from './telegram-bots.controller';
import { TelegramBotsService } from './telegram-bots.service';
import { TelegramBotApiClient } from '../telegram/shared/telegram-bot-api.client';

@Module({
  controllers: [TelegramBotsController],
  providers: [TelegramBotsService, TelegramBotApiClient],
  exports: [TelegramBotApiClient],
})
export class TelegramBotsModule {}
