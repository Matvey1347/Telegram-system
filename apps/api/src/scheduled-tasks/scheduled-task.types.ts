import type {
  ScheduledTaskFrequency,
  ScheduledTaskSchedule,
  ScheduledTaskScope,
} from '@telegram-system/shared';

export type ScheduledTaskExecutionContext = {
  taskKey: string;
  workspaceId: string | null;
  trigger: 'SCHEDULE' | 'MANUAL';
};

export type ScheduledTaskExecutionResult = {
  summary?: string | null;
  skipped?: boolean;
};

export type ScheduledTaskDefinition = {
  key: string;
  name: string;
  description: string;
  scope: ScheduledTaskScope;
  defaultSchedule: ScheduledTaskSchedule;
  scheduleEditable: boolean;
  supportedFrequencies: ScheduledTaskFrequency[];
  notificationSupported: boolean;
  execute: (
    context: ScheduledTaskExecutionContext,
  ) => Promise<ScheduledTaskExecutionResult | void>;
};

export type ScheduledTaskConfigShape = {
  enabled: boolean;
  schedule: ScheduledTaskSchedule;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  notificationChannel: 'SYSTEM_TELEGRAM_BOT';
};
