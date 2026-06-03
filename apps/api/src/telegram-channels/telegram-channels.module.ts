import { Module } from '@nestjs/common';
import { TelegramChannelsController } from './telegram-channels.controller';
import { TelegramChannelsService } from './telegram-channels.service';
import { TelegramMtprotoClient } from '../telegram/shared/telegram-mtproto.client';

@Module({
  controllers: [TelegramChannelsController],
  providers: [TelegramChannelsService, TelegramMtprotoClient],
  exports: [TelegramChannelsService, TelegramMtprotoClient],
})
export class TelegramChannelsModule {}
