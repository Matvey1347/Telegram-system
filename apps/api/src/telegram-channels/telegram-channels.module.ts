import { Module } from '@nestjs/common';
import { TelegramChannelsController } from './telegram-channels.controller';
import { TelegramChannelsService } from './telegram-channels.service';

@Module({ controllers: [TelegramChannelsController], providers: [TelegramChannelsService] })
export class TelegramChannelsModule {}
