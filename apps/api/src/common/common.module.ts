import { Global, Module } from '@nestjs/common';
import { CurrencyConversionService } from './currency-conversion.service';
import { SchemaBootstrapService } from './schema-bootstrap.service';
import { TokenEncryptionService } from './security/token-encryption.service';
import { WorkspaceService } from './workspace.service';

@Global()
@Module({
  providers: [
    WorkspaceService,
    CurrencyConversionService,
    TokenEncryptionService,
    SchemaBootstrapService,
  ],
  exports: [
    WorkspaceService,
    CurrencyConversionService,
    TokenEncryptionService,
  ],
})
export class CommonModule {}
