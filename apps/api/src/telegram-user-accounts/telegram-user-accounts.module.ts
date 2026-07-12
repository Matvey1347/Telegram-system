import { Module } from '@nestjs/common';
import { TelegramChannelsModule } from '../telegram-channels/telegram-channels.module';
import { TelegramMtprotoClient } from '../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../telegram/shared/telegram-source-access.service';
import { TelegramUserAccountsController } from './telegram-user-accounts.controller';
import { TelegramUserAccountsService } from './telegram-user-accounts.service';

@Module({
  imports: [TelegramChannelsModule],
  controllers: [TelegramUserAccountsController],
  providers: [
    TelegramUserAccountsService,
    TelegramMtprotoClient,
    TelegramSourceAccessService,
  ],
  exports: [TelegramUserAccountsService],
})
export class TelegramUserAccountsModule {}
