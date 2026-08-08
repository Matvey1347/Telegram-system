export type ScheduledTaskScope = "WORKSPACE_OPERATION" | "SYSTEM_MAINTENANCE";

export type ScheduledTaskFrequency = "DAILY" | "INTERVAL";

export type ScheduledTaskTrigger = "SCHEDULE" | "MANUAL";

export type ScheduledTaskRunStatus =
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED";

export type ScheduledTaskNotificationChannel = "SYSTEM_TELEGRAM_BOT";

export type ScheduledTaskSchedule =
  | {
      frequency: "DAILY";
      time: string;
      timezone: string;
    }
  | {
      frequency: "INTERVAL";
      intervalMinutes: number;
      timezone: string;
    };

export type ScheduledTaskNotificationSettings = {
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  channel: ScheduledTaskNotificationChannel;
};

export type ScheduledTaskDefinitionView = {
  key: string;
  name: string;
  description: string;
  scope: ScheduledTaskScope;
  scheduleEditable: boolean;
  supportedFrequencies: ScheduledTaskFrequency[];
  notificationSupported: boolean;
  defaultSchedule: ScheduledTaskSchedule;
};

export type ScheduledTaskRunSummary = {
  id: string;
  taskKey: string;
  workspaceId: string | null;
  trigger: ScheduledTaskTrigger;
  startedAt: string;
  finishedAt: string | null;
  status: ScheduledTaskRunStatus;
  durationMs: number | null;
  resultSummary: string | null;
  error: string | null;
  createdAt: string;
};

export type ScheduledTaskView = ScheduledTaskDefinitionView & {
  workspaceId: string | null;
  enabled: boolean;
  schedule: ScheduledTaskSchedule;
  notifications: ScheduledTaskNotificationSettings;
  notificationState: "ENABLED" | "DISABLED" | "NOT_SUPPORTED";
  lastRun: ScheduledTaskRunSummary | null;
  nextRunAt: string | null;
  canRunNow: boolean;
  canEdit: boolean;
};

export type ScheduledTaskListResponse = {
  items: ScheduledTaskView[];
};

export type UpdateScheduledTaskPayload = {
  enabled?: boolean;
  schedule?: ScheduledTaskSchedule;
  notifications?: ScheduledTaskNotificationSettings;
};
