import { Global, Module } from '@nestjs/common';
import { CurrencyConversionService } from './currency-conversion.service';
import { SchemaBootstrapService } from './schema-bootstrap.service';
import { TokenEncryptionService } from './security/token-encryption.service';
import { WorkspaceService } from './workspace.service';
import { ResponseCacheService } from './response-cache.service';

@Global()
@Module({
  providers: [
    WorkspaceService,
    CurrencyConversionService,
    TokenEncryptionService,
    SchemaBootstrapService,
    ResponseCacheService,
  ],
  exports: [
    WorkspaceService,
    CurrencyConversionService,
    TokenEncryptionService,
    ResponseCacheService,
  ],
})
export class CommonModule {}
