import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { ApplicationLogWriterService } from './application-log-writer.service';
import { ApplicationLoggerService } from './application-logger.service';
import { ApplicationLogsCleanupService } from './application-logs-cleanup.service';
import { ApplicationLogsController } from './application-logs.controller';
import { ApplicationLogsExceptionFilter } from './application-logs-exception.filter';
import { ApplicationLogsHttpInterceptor } from './application-logs-http.interceptor';
import { ApplicationLogsRepository } from './application-logs.repository';
import { ApplicationLogsService } from './application-logs.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ApplicationLogsController],
  providers: [
    ApplicationLogsRepository,
    ApplicationLogsService,
    ApplicationLogWriterService,
    ApplicationLoggerService,
    ApplicationLogsCleanupService,
    { provide: APP_INTERCEPTOR, useClass: ApplicationLogsHttpInterceptor },
    { provide: APP_FILTER, useClass: ApplicationLogsExceptionFilter },
  ],
  exports: [
    ApplicationLogsService,
    ApplicationLoggerService,
    ApplicationLogWriterService,
  ],
})
export class ApplicationLogsModule {}
