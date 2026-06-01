import { Module } from '@nestjs/common';
import { FinanceCategoriesController } from './finance-categories.controller';
import { FinanceCategoriesService } from './finance-categories.service';

@Module({
  controllers: [FinanceCategoriesController],
  providers: [FinanceCategoriesService],
  exports: [FinanceCategoriesService],
})
export class FinanceCategoriesModule {}
