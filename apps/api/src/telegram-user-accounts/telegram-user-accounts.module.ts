import { Module } from '@nestjs/common';
import { TelegramMtprotoClient } from '../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../telegram/shared/telegram-source-access.service';
import { TelegramUserAccountsController } from './telegram-user-accounts.controller';
import { TelegramUserAccountsService } from './telegram-user-accounts.service';

@Module({
  controllers: [TelegramUserAccountsController],
  providers: [
    TelegramUserAccountsService,
    TelegramMtprotoClient,
    TelegramSourceAccessService,
  ],
  exports: [TelegramUserAccountsService],
})
export class TelegramUserAccountsModule {}
