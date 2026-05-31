import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountsModule } from './accounts/accounts.module';
import { AdCampaignsModule } from './ad-campaigns/ad-campaigns.module';
import { AdvertisingSourcesModule } from './advertising-sources/advertising-sources.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { PrismaModule } from './prisma/prisma.module';
import { PromosModule } from './promos/promos.module';
import { TelegramChannelsModule } from './telegram-channels/telegram-channels.module';
import { TransactionsModule } from './transactions/transactions.module';
import { TransfersModule } from './transfers/transfers.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { InvestorsModule } from './investors/investors.module';
import { InvestmentsModule } from './investments/investments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    PrismaModule,
    CommonModule,
    AuthModule,
    AccountsModule,
    ExchangeRatesModule,
    CurrenciesModule,
    TransactionsModule,
    TransfersModule,
    TelegramChannelsModule,
    PromosModule,
    AdvertisingSourcesModule,
    AdCampaignsModule,
    DashboardModule,
    BootstrapModule,
    InvestorsModule,
    InvestmentsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
