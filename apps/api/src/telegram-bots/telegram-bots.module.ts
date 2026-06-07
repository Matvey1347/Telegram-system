import { Module } from '@nestjs/common';
import { TelegramSourceAccessService } from '../telegram/shared/telegram-source-access.service';
import { TelegramBotsController } from './telegram-bots.controller';
import { TelegramBotsService } from './telegram-bots.service';

@Module({
  controllers: [TelegramBotsController],
  providers: [TelegramBotsService, TelegramSourceAccessService],
})
export class TelegramBotsModule {}
