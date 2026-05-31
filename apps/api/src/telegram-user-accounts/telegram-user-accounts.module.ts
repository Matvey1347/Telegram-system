import { Module } from '@nestjs/common';
import { TelegramMtprotoClient } from '../telegram/shared/telegram-mtproto.client';
import { TelegramUserAccountsController } from './telegram-user-accounts.controller';
import { TelegramUserAccountsService } from './telegram-user-accounts.service';

@Module({
  controllers: [TelegramUserAccountsController],
  providers: [TelegramUserAccountsService, TelegramMtprotoClient],
  exports: [TelegramUserAccountsService],
})
export class TelegramUserAccountsModule {}
