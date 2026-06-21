import { Module } from '@nestjs/common';
import { TelegramChannelsModule } from '../telegram-channels/telegram-channels.module';
import { TelegramChannelNetworksController } from './telegram-channel-networks.controller';
import { TelegramChannelNetworksService } from './telegram-channel-networks.service';

@Module({
  imports: [TelegramChannelsModule],
  controllers: [TelegramChannelNetworksController],
  providers: [TelegramChannelNetworksService],
})
export class TelegramChannelNetworksModule {}
