import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
import { FinanceCategoriesModule } from './finance-categories/finance-categories.module';
import { WorkspaceMembersModule } from './workspace-members/workspace-members.module';
import { AccountModule } from './account/account.module';
import { TelegramSyncModule } from './telegram-sync/telegram-sync.module';
import { TelegramUserAccountsModule } from './telegram-user-accounts/telegram-user-accounts.module';
import { TelegramBotsModule } from './telegram-bots/telegram-bots.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { IconsModule } from './icons/icons.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    ScheduleModule.forRoot(),
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
    FinanceCategoriesModule,
    WorkspaceMembersModule,
    AccountModule,
    TelegramSyncModule,
    TelegramUserAccountsModule,
    TelegramBotsModule,
    WorkspacesModule,
    IconsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
