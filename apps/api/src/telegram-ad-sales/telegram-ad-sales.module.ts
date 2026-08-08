import { Module } from '@nestjs/common';
import { ApplicationLogsModule } from '../application-logs/application-logs.module';
import { FinanceCategoriesModule } from '../finance-categories/finance-categories.module';
import { TelegramChannelsModule } from '../telegram-channels/telegram-channels.module';
import { TelegramChannelNetworksModule } from '../telegram-channel-networks/telegram-channel-networks.module';
import { TelegramAdSalesCronService } from './telegram-ad-sales-cron.service';
import { TelegramAdSalesBulkService } from './telegram-ad-sales-bulk.service';
import { TelegramAdSalesController } from './telegram-ad-sales.controller';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

@Module({
  imports: [
    TelegramChannelsModule,
    TelegramChannelNetworksModule,
    ApplicationLogsModule,
    FinanceCategoriesModule,
  ],
  controllers: [TelegramAdSalesController],
  providers: [
    TelegramAdSalesService,
    TelegramAdSalesBulkService,
    TelegramAdSalesCronService,
  ],
  exports: [TelegramAdSalesService],
})
export class TelegramAdSalesModule {}
