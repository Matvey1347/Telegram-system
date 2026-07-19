import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CurrenciesService } from './currencies.service';
import { ApplicationLoggerService } from '../application-logs/application-logger.service';

@Injectable()
export class CurrenciesCronService {
  private readonly logger = new Logger(CurrenciesCronService.name);

  constructor(
    private readonly currenciesService: CurrenciesService,
    private readonly applicationLogger: ApplicationLoggerService = ({
      info: () => undefined,
      writeStructured: () => undefined,
    } as unknown) as ApplicationLoggerService,
  ) {}

  // Daily sync at 03:00 server time.
  @Cron('0 3 * * *')
  async syncRatesDaily() {
    const startedAt = Date.now();
    const result = await this.currenciesService.syncRatesForAllWorkspaces();
    this.logger.log(
      `Daily currency auto-sync finished: ${result.synced}/${result.total} workspaces synced`,
    );
    this.applicationLogger.info({
      kind: 'cron',
      source: CurrenciesCronService.name,
      event: 'currencies.sync.completed',
      message: `Daily currency auto-sync finished: ${result.synced}/${result.total} workspaces synced`,
      durationMs: Date.now() - startedAt,
      metadata: result as Record<string, unknown>,
    });
  }
}
