import { Module } from '@nestjs/common';
import { CurrenciesController } from './currencies.controller';
import { CurrenciesService } from './currencies.service';
import { CurrenciesCronService } from './currencies-cron.service';

@Module({
  controllers: [CurrenciesController],
  providers: [CurrenciesService, CurrenciesCronService],
  exports: [CurrenciesService],
})
export class CurrenciesModule {}
