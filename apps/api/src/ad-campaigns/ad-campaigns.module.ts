import { Module } from '@nestjs/common';
import { FinanceCategoriesModule } from '../finance-categories/finance-categories.module';
import { AdCampaignsController } from './ad-campaigns.controller';
import { AdCampaignsService } from './ad-campaigns.service';

@Module({
  imports: [FinanceCategoriesModule],
  controllers: [AdCampaignsController],
  providers: [AdCampaignsService],
})
export class AdCampaignsModule {}
