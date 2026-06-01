import { Module } from '@nestjs/common';
import { FinanceCategoriesModule } from '../finance-categories/finance-categories.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [FinanceCategoriesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
