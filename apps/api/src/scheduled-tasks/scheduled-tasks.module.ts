import { Module } from '@nestjs/common';
import { ApplicationLogsModule } from '../application-logs/application-logs.module';
import { CurrenciesModule } from '../currencies/currencies.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramAdSalesModule } from '../telegram-ad-sales/telegram-ad-sales.module';
import { TelegramSyncModule } from '../telegram-sync/telegram-sync.module';
import { ScheduledTaskLockService } from './scheduled-task-lock.service';
import { ScheduledTaskNotificationsService } from './scheduled-task-notifications.service';
import { ScheduledTaskExecutorService } from './scheduled-task-executor.service';
import { ScheduledTaskRegistryService } from './scheduled-task-registry.service';
import { ScheduledTasksController } from './scheduled-tasks.controller';
import { ScheduledTasksService } from './scheduled-tasks.service';

@Module({
  imports: [
    PrismaModule,
    TelegramSyncModule,
    CurrenciesModule,
    TelegramAdSalesModule,
    ApplicationLogsModule,
  ],
  controllers: [ScheduledTasksController],
  providers: [
    ScheduledTasksService,
    ScheduledTaskExecutorService,
    ScheduledTaskRegistryService,
    ScheduledTaskLockService,
    ScheduledTaskNotificationsService,
  ],
})
export class ScheduledTasksModule {}
