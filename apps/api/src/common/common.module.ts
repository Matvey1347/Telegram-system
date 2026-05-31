import { Global, Module } from '@nestjs/common';
import { CurrencyConversionService } from './currency-conversion.service';
import { WorkspaceService } from './workspace.service';

@Global()
@Module({
  providers: [WorkspaceService, CurrencyConversionService],
  exports: [WorkspaceService, CurrencyConversionService],
})
export class CommonModule {}
