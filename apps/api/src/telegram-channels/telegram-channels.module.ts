import { Module } from '@nestjs/common';
import { TelegramChannelsController } from './telegram-channels.controller';
import { TelegramChannelsService } from './telegram-channels.service';
import { TelegramMtprotoClient } from '../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../telegram/shared/telegram-source-access.service';

@Module({
  controllers: [TelegramChannelsController],
  providers: [
    TelegramChannelsService,
    TelegramMtprotoClient,
    TelegramSourceAccessService,
  ],
  exports: [
    TelegramChannelsService,
    TelegramMtprotoClient,
    TelegramSourceAccessService,
  ],
})
export class TelegramChannelsModule {}
