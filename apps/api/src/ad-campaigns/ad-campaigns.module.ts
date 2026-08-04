import { Module } from '@nestjs/common';
import { FinanceCategoriesModule } from '../finance-categories/finance-categories.module';
import { AdCampaignAnalyticsService } from './ad-campaign-analytics.service';
import { AdCampaignAdmissionAnalyticsService } from './ad-campaign-admission-analytics.service';
import { AdCampaignAdmissionBackfillService } from './ad-campaign-admission-backfill.service';
import { AdCampaignsController } from './ad-campaigns.controller';
import { AdCampaignsService } from './ad-campaigns.service';

@Module({
  imports: [FinanceCategoriesModule],
  controllers: [AdCampaignsController],
  providers: [
    AdCampaignsService,
    AdCampaignAnalyticsService,
    AdCampaignAdmissionAnalyticsService,
    AdCampaignAdmissionBackfillService,
  ],
  exports: [
    AdCampaignsService,
    AdCampaignAnalyticsService,
    AdCampaignAdmissionAnalyticsService,
    AdCampaignAdmissionBackfillService,
  ],
})
export class AdCampaignsModule {}
