import type { AxiosInstance, AxiosRequestConfig } from "axios";
import type {
  AccountMe,
  AuthResponse,
  GlobalSearchResult,
  Icon,
  MeResponse,
  Transaction,
  WorkspaceInfo,
  WorkspaceMember,
  WorkspaceMemberSelectOption,
} from "./api-types";

type FeedbackConfigFactory = (
  config: AxiosRequestConfig & {
    feedback?: { mode?: "automatic" | "managed" | "silent" };
  },
) => AxiosRequestConfig;
type CrudFactory = <T>(path: string) => {
  list: () => Promise<T[]>;
  get: (id: string) => Promise<T>;
  create: (payload: Record<string, unknown>) => Promise<T>;
  update: (id: string, payload: Record<string, unknown>) => Promise<T>;
  remove: (id: string) => Promise<T>;
};

export function createWorkspaceApi({
  api,
  crud,
  silentFeedbackConfig,
  withFeedback,
}: {
  api: AxiosInstance;
  crud: CrudFactory;
  silentFeedbackConfig: AxiosRequestConfig;
  withFeedback: FeedbackConfigFactory;
}) {
  const authApi = {
    login: async (email: string, password: string) =>
      (await api.post<AuthResponse>("/auth/login", { email, password })).data,
    register: async (payload: {
      email: string;
      password: string;
      name: string;
      workspaceName?: string;
    }) => (await api.post<AuthResponse>("/auth/register", payload)).data,
    me: async () => (await api.get<MeResponse>("/auth/me")).data,
  };

  const accountApi = {
    me: async () => (await api.get<AccountMe>("/account/me")).data,
    updateMe: async (payload: {
      name?: string;
      email?: string;
      avatarIconId?: string | null;
      telegramUsername?: string | null;
      telegramUserAccountIds?: string[];
    }) => (await api.patch<AccountMe>("/account/me", payload)).data,
    updatePassword: async (payload: {
      currentPassword: string;
      newPassword: string;
    }) => (await api.patch<{ success: boolean }>("/account/password", payload)).data,
    updateWorkspace: async (payload: {
      name: string;
      timezone?: string;
      avatarIconId?: string | null;
    }) => (await api.patch<AccountMe>("/account/workspace", payload)).data,
  };

  const workspacesApi = {
    list: async () => (await api.get<WorkspaceInfo[]>("/workspaces")).data,
    selected: async () => (await api.get<WorkspaceInfo>("/workspaces/selected")).data,
    create: async (payload: { name: string; avatarIconId?: string | null }) =>
      (await api.post<WorkspaceInfo>("/workspaces", payload)).data,
    update: async (
      id: string,
      payload: {
        name?: string;
        timezone?: string;
        avatarIconId?: string | null;
      },
    ) => (await api.patch<WorkspaceInfo>(`/workspaces/${id}`, payload)).data,
    remove: async (id: string) =>
      (await api.delete<{ success: boolean }>(`/workspaces/${id}`)).data,
  };

  const globalSearchApi = {
    search: async (query: string) =>
      (await api.get<GlobalSearchResult[]>("/global-search", { params: { q: query } })).data,
  };

  const iconsApi = {
    list: async (search?: string) =>
      (await api.get<Icon[]>("/icons", { params: search ? { search } : undefined })).data,
    get: async (id: string) => (await api.get<Icon>(`/icons/${id}`)).data,
    upload: async (file: File): Promise<{ imageUrl: string }> => {
      const formData = new FormData();
      formData.append("file", file);
      return (
        await api.post<{ imageUrl: string }>(
          "/icons/upload",
          formData,
          withFeedback({
            headers: { "Content-Type": "multipart/form-data" },
            feedback: { mode: "managed" },
          }),
        )
      ).data;
    },
    createCustom: async (payload: { name: string; imageUrl: string }) =>
      (await api.post<Icon>("/icons/custom", payload, silentFeedbackConfig)).data,
    createTemporaryImage: async (payload: { imageUrl: string; fileName?: string }) =>
      (await api.post<Icon>("/icons/temporary-image", payload, silentFeedbackConfig)).data,
    createEmoji: async (payload: { name: string; emoji: string }) =>
      (await api.post<Icon>("/icons/emoji", payload, silentFeedbackConfig)).data,
    remove: async (id: string) =>
      (await api.delete<{ success: boolean }>(`/icons/${id}`, silentFeedbackConfig)).data,
  };

  const workspaceMembersApi = {
    ...crud<WorkspaceMember>("/workspace-members"),
    select: async () =>
      (await api.get<WorkspaceMemberSelectOption[]>("/workspace-members/select")).data,
    investments: async (memberId: string) =>
      (await api.get<Transaction[]>(`/workspace-members/${memberId}/investments`)).data,
    investmentsSummary: async () =>
      (await api.get("/workspace-members/investments/summary")).data,
  };

  return {
    accountApi,
    authApi,
    globalSearchApi,
    iconsApi,
    workspaceMembersApi,
    workspacesApi,
  };
}
