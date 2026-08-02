import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

@Injectable()
export class TelegramAdSalesCronService {
  private readonly logger = new Logger(TelegramAdSalesCronService.name);
  private runningDeletionBatch = false;

  constructor(private readonly service: TelegramAdSalesService) {}

  @Cron('*/15 * * * *')
  async processDueDeletions() {
    if (this.runningDeletionBatch) return;
    this.runningDeletionBatch = true;
    try {
      const result = await this.service.processDueDeletionBatch(20);
      if (result.processed > 0 || result.failed > 0) {
        this.logger.log(
          `Processed telegram ad sales deletion batch: processed=${result.processed} failed=${result.failed}`,
        );
      }
    } finally {
      this.runningDeletionBatch = false;
    }
  }
}
