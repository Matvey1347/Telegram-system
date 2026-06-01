import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CurrenciesService } from './currencies.service';

@Injectable()
export class CurrenciesCronService {
  private readonly logger = new Logger(CurrenciesCronService.name);

  constructor(private readonly currenciesService: CurrenciesService) {}

  // Daily sync at 03:00 server time.
  @Cron('0 3 * * *')
  async syncRatesDaily() {
    const result = await this.currenciesService.syncRatesForAllWorkspaces();
    this.logger.log(
      `Daily currency auto-sync finished: ${result.synced}/${result.total} workspaces synced`,
    );
  }
}
