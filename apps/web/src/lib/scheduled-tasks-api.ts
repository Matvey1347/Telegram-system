import type { AxiosInstance } from "axios";
import type {
  ScheduledTaskListResponse,
  ScheduledTaskRunSummary,
  ScheduledTaskView,
  UpdateScheduledTaskPayload,
} from "@telegram-system/shared";

export function createScheduledTasksApi(api: AxiosInstance) {
  return {
    list: async () =>
      (await api.get<ScheduledTaskListResponse>("/scheduled-tasks")).data,
    update: async (taskKey: string, payload: UpdateScheduledTaskPayload) =>
      (
        await api.patch<ScheduledTaskView>(
          `/scheduled-tasks/${encodeURIComponent(taskKey)}`,
          payload,
        )
      ).data,
    runNow: async (taskKey: string) =>
      (
        await api.post<ScheduledTaskRunSummary>(
          `/scheduled-tasks/${encodeURIComponent(taskKey)}/run`,
        )
      ).data,
    runs: async (taskKey: string, limit = 20) =>
      (
        await api.get<ScheduledTaskRunSummary[]>(
          `/scheduled-tasks/${encodeURIComponent(taskKey)}/runs`,
          { params: { limit } },
        )
      ).data,
  };
}
