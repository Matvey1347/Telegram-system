import { Module } from '@nestjs/common';
import { AdCampaignsController } from './ad-campaigns.controller';
import { AdCampaignsService } from './ad-campaigns.service';
import { TelegramBotsModule } from '../telegram-bots/telegram-bots.module';

@Module({
  imports: [TelegramBotsModule],
  controllers: [AdCampaignsController],
  providers: [AdCampaignsService],
})
export class AdCampaignsModule {}
