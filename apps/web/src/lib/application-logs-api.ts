import type { AxiosInstance, AxiosRequestConfig } from "axios";
import type {
  ApplicationLog,
  ApplicationLogsDeleteResult,
  ApplicationLogsFilterOptions,
  ApplicationLogsListResult,
  ApplicationLogsQuery,
  ClientApplicationLogPayload,
} from "@telegram-system/shared";

export function createApplicationLogsApi(
  api: AxiosInstance,
  silentFeedbackConfig: AxiosRequestConfig,
) {
  return {
    list: async (query: ApplicationLogsQuery = {}) =>
      (
        await api.get<ApplicationLogsListResult>("/application-logs", {
          params: query,
          paramsSerializer: {
            serialize: (params) => {
              const search = new URLSearchParams();
              for (const [key, rawValue] of Object.entries(params)) {
                if (rawValue == null || rawValue === "") continue;
                if (Array.isArray(rawValue)) {
                  if (!rawValue.length) continue;
                  search.set(key, rawValue.join(","));
                  continue;
                }
                search.set(key, String(rawValue));
              }
              return search.toString();
            },
          },
        })
      ).data,
    detail: async (id: string) =>
      (await api.get<ApplicationLog>(`/application-logs/${id}`)).data,
    filterOptions: async () =>
      (
        await api.get<ApplicationLogsFilterOptions>(
          "/application-logs/filter-options",
        )
      ).data,
    clear: async () =>
      (await api.delete<ApplicationLogsDeleteResult>("/application-logs")).data,
    createClientLog: async (payload: ClientApplicationLogPayload) =>
      (await api.post("/application-logs/client", payload, silentFeedbackConfig))
        .data,
  };
}
