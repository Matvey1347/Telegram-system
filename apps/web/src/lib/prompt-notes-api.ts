import type { AxiosInstance } from "axios";
import type { PaginatedResponse } from "@telegram-system/shared";
import type { PaginationParams, PromptNote } from "./api-types";

type PaginatedGetter = <T>(path: string, params?: Record<string, unknown>) => Promise<PaginatedResponse<T>>;
type AllPaginatedGetter = <T>(path: string, params?: Record<string, unknown>) => Promise<T[]>;

export function createPromptNotesApi({ api, getPaginated, getAllPaginatedItems, hasExplicitPagination }: {
  api: AxiosInstance;
  getPaginated: PaginatedGetter;
  getAllPaginatedItems: AllPaginatedGetter;
  hasExplicitPagination: (params?: Record<string, unknown>) => boolean;
}) {
const promptNotesApi = {
  listPage: async (
    params?: PaginationParams & {
      search?: string;
      telegramChannelId?: string;
      postGroupId?: string;
    },
  ) => getPaginated<PromptNote>("/prompt-notes", params),
  list: async (
    params?: PaginationParams & {
      search?: string;
      telegramChannelId?: string;
      postGroupId?: string;
    },
  ) =>
    hasExplicitPagination(params)
      ? (await getPaginated<PromptNote>("/prompt-notes", params)).items
      : getAllPaginatedItems<PromptNote>("/prompt-notes", params),
  create: async (payload: {
    title: string;
    content: string;
    emoji?: string | null;
    iconId?: string | null;
    assignedMemberId?: string | null;
    telegramChannelId?: string | null;
    telegramChannelIds?: string[];
    postGroupId?: string | null;
  }) => (await api.post<PromptNote>("/prompt-notes", payload)).data,
  update: async (
    id: string,
    payload: {
      title?: string;
      content?: string;
      emoji?: string | null;
      iconId?: string | null;
      assignedMemberId?: string | null;
      telegramChannelId?: string | null;
      telegramChannelIds?: string[];
      postGroupId?: string | null;
    },
  ) => (await api.patch<PromptNote>(`/prompt-notes/${id}`, payload)).data,
  remove: async (id: string) => (await api.delete(`/prompt-notes/${id}`)).data,
};

  return promptNotesApi;
}
