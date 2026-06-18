import { Module } from '@nestjs/common';
import { CurrenciesModule } from '../currencies/currencies.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  imports: [CurrenciesModule],
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
