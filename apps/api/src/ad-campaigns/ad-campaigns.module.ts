import { Module } from '@nestjs/common';
import { FinanceCategoriesModule } from '../finance-categories/finance-categories.module';
import { AdCampaignAnalyticsService } from './ad-campaign-analytics.service';
import { AdCampaignsController } from './ad-campaigns.controller';
import { AdCampaignsService } from './ad-campaigns.service';

@Module({
  imports: [FinanceCategoriesModule],
  controllers: [AdCampaignsController],
  providers: [AdCampaignsService, AdCampaignAnalyticsService],
  exports: [AdCampaignsService, AdCampaignAnalyticsService],
})
export class AdCampaignsModule {}
