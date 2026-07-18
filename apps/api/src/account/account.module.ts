import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { TelegramChannelsModule } from '../telegram-channels/telegram-channels.module';

@Module({
  imports: [TelegramChannelsModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
