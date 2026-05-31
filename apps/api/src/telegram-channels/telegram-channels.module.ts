import { Module } from '@nestjs/common';
import { TelegramChannelsController } from './telegram-channels.controller';
import { TelegramInviteLinksController } from './telegram-invite-links.controller';
import { TelegramChannelsService } from './telegram-channels.service';
import { TelegramBotsModule } from '../telegram-bots/telegram-bots.module';
import { TelegramMtprotoClient } from '../telegram/shared/telegram-mtproto.client';

@Module({
  imports: [TelegramBotsModule],
  controllers: [TelegramChannelsController, TelegramInviteLinksController],
  providers: [TelegramChannelsService, TelegramMtprotoClient],
  exports: [TelegramChannelsService],
})
export class TelegramChannelsModule {}
