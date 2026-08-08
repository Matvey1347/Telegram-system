import { Injectable } from '@nestjs/common';
import { ScheduledTaskExecutorService } from './scheduled-task-executor.service';
import type { ScheduledTaskDefinition } from './scheduled-task.types';

@Injectable()
export class ScheduledTaskRegistryService {
  constructor(private readonly executor: ScheduledTaskExecutorService) {}

  definitions(): ScheduledTaskDefinition[] {
    return [
      {
        key: 'telegram.post_metrics.sync',
        name: 'Telegram post metrics sync',
        description:
          'Refreshes post views, reactions and audience snapshots for workspace channels.',
        scope: 'WORKSPACE_OPERATION',
        defaultSchedule: {
          frequency: 'INTERVAL',
          intervalMinutes: 30,
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: true,
        supportedFrequencies: ['INTERVAL'],
        notificationSupported: true,
        execute: this.executor.executors['telegram.post_metrics.sync'],
      },
      {
        key: 'telegram.broadcast_stats.sync',
        name: 'Telegram broadcast stats sync',
        description:
          'Downloads channel broadcast analytics from connected MTProto admin accounts.',
        scope: 'WORKSPACE_OPERATION',
        defaultSchedule: {
          frequency: 'DAILY',
          time: '04:00',
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: true,
        supportedFrequencies: ['DAILY'],
        notificationSupported: true,
        execute: this.executor.executors['telegram.broadcast_stats.sync'],
      },
      {
        key: 'telegram.daily_analytics.sync',
        name: 'Daily analytics sync',
        description:
          'Creates audience snapshots and recalculates campaign analytics for the workspace.',
        scope: 'WORKSPACE_OPERATION',
        defaultSchedule: {
          frequency: 'DAILY',
          time: '05:00',
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: true,
        supportedFrequencies: ['DAILY'],
        notificationSupported: true,
        execute: this.executor.executors['telegram.daily_analytics.sync'],
      },
      {
        key: 'currencies.rates.sync',
        name: 'Currency rates sync',
        description:
          'Fetches exchange rates for the workspace primary currency.',
        scope: 'WORKSPACE_OPERATION',
        defaultSchedule: {
          frequency: 'DAILY',
          time: '03:00',
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: true,
        supportedFrequencies: ['DAILY'],
        notificationSupported: true,
        execute: this.executor.executors['currencies.rates.sync'],
      },
      {
        key: 'telegram_ad_sales.due_deletions',
        name: 'Ad sales due deletions',
        description:
          'Processes due deletion of published Telegram ad placements.',
        scope: 'SYSTEM_MAINTENANCE',
        defaultSchedule: {
          frequency: 'INTERVAL',
          intervalMinutes: 15,
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: false,
        supportedFrequencies: ['INTERVAL'],
        notificationSupported: false,
        execute: this.executor.executors['telegram_ad_sales.due_deletions'],
      },
      {
        key: 'application_logs.cleanup',
        name: 'Application logs cleanup',
        description:
          'Deletes expired application logs according to retention settings.',
        scope: 'SYSTEM_MAINTENANCE',
        defaultSchedule: {
          frequency: 'DAILY',
          time: '00:00',
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: false,
        supportedFrequencies: ['DAILY'],
        notificationSupported: false,
        execute: this.executor.executors['application_logs.cleanup'],
      },
    ];
  }

  get(key: string) {
    return (
      this.definitions().find((definition) => definition.key === key) ?? null
    );
  }
}
