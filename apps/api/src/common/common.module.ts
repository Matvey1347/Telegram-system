import { Global, Module } from '@nestjs/common';
import { CurrencyConversionService } from './currency-conversion.service';
import { SchemaBootstrapService } from './schema-bootstrap.service';
import { TokenEncryptionService } from './security/token-encryption.service';
import { WorkspaceService } from './workspace.service';
import { ResponseCacheService } from './response-cache.service';
import { RequestContextModule } from './request-context/request-context.module';
import { MemoryMonitorService } from './observability/memory-monitor.service';

@Global()
@Module({
  imports: [RequestContextModule],
  providers: [
    WorkspaceService,
    CurrencyConversionService,
    TokenEncryptionService,
    SchemaBootstrapService,
    ResponseCacheService,
    MemoryMonitorService,
  ],
  exports: [
    WorkspaceService,
    CurrencyConversionService,
    TokenEncryptionService,
    ResponseCacheService,
    MemoryMonitorService,
  ],
})
export class CommonModule {}
