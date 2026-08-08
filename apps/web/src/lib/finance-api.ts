import type { AxiosInstance, AxiosRequestConfig } from "axios";
import type { PaginatedResponse } from "@telegram-system/shared";
import type {
  Account,
  Currency,
  CurrencyDisplayMode,
  PaginationParams,
  Transaction,
  TransactionCategory,
  TransactionType,
  Transfer,
} from "./api-types";

type PaginatedGetter = <T>(
  path: string,
  params?: Record<string, unknown>,
) => Promise<PaginatedResponse<T>>;

type AllPaginatedGetter = <T>(
  path: string,
  params?: Record<string, unknown>,
) => Promise<T[]>;

type QuietCrudFactory = <T>(path: string) => {
  list: () => Promise<T[]>;
  get: (id: string) => Promise<T>;
  create: (payload: Record<string, unknown>) => Promise<T>;
  update: (id: string, payload: Record<string, unknown>) => Promise<T>;
  remove: (id: string) => Promise<T>;
};

export type TransactionQuery = {
  assignedMemberId?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  type?: TransactionType | "all";
  accountId?: string;
  sort?: "date_desc" | "date_asc";
  search?: string;
};

export type TransferQuery = {
  assignedMemberId?: string;
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  sort?: "date_desc" | "date_asc";
};

export type CurrencySettings = {
  primaryCurrency: Currency;
  secondaryCurrency: Currency;
  tertiaryCurrency: Currency;
  currencyDisplayMode: CurrencyDisplayMode;
  supportedCurrencies: Currency[];
};

export type ExchangeRate = {
  id: string;
  baseCurrency: Currency;
  targetCurrency: Currency;
  rate: number;
  date: string;
  source?: string;
};

export function createFinanceApi({
  api,
  getPaginated,
  getAllPaginatedItems,
  hasExplicitPagination,
  quietCrud,
  quietMutationConfig,
}: {
  api: AxiosInstance;
  getPaginated: PaginatedGetter;
  getAllPaginatedItems: AllPaginatedGetter;
  hasExplicitPagination: (params?: Record<string, unknown>) => boolean;
  quietCrud: QuietCrudFactory;
  quietMutationConfig: AxiosRequestConfig;
}) {
  const accountsApi = {
    ...quietCrud<Account>("/accounts"),
    listPage: async (params?: PaginationParams & { assignedMemberId?: string }) =>
      getPaginated<Account>("/accounts", params),
    list: async () => getAllPaginatedItems<Account>("/accounts"),
  };

  const transactionsApi = {
    ...quietCrud<Transaction>("/transactions"),
    listPage: async (params?: TransactionQuery & PaginationParams) =>
      getPaginated<Transaction>("/transactions", params),
    list: async (params?: TransactionQuery & PaginationParams) =>
      hasExplicitPagination(params)
        ? (await getPaginated<Transaction>("/transactions", params)).items
        : getAllPaginatedItems<Transaction>("/transactions", params),
    create: async (payload: {
      assignedMemberId?: string | null;
      accountId: string;
      type: TransactionType;
      amount: number;
      exchangeRateToPrimary?: number;
      categoryId: string;
      memberId?: string;
      iconId?: string | null;
      telegramChannelId?: string | null;
      description?: string;
      date: string;
    }) =>
      (await api.post<Transaction>("/transactions", payload, quietMutationConfig)).data,
    update: async (
      id: string,
      payload: {
        assignedMemberId?: string | null;
        accountId?: string;
        type?: TransactionType;
        amount?: number;
        exchangeRateToPrimary?: number;
        categoryId?: string;
        memberId?: string | null;
        iconId?: string | null;
        telegramChannelId?: string | null;
        description?: string;
        date?: string;
      },
    ) =>
      (await api.patch<Transaction>(`/transactions/${id}`, payload, quietMutationConfig)).data,
  };

  const transactionCategoriesApi = {
    list: async (type: TransactionType) =>
      (await api.get<TransactionCategory[]>("/finance/categories", { params: { type } })).data,
    create: async (payload: {
      name: string;
      type: TransactionType;
      iconId?: string | null;
    }) =>
      (await api.post<TransactionCategory>("/finance/categories", payload, quietMutationConfig)).data,
    update: async (id: string, payload: { name?: string; iconId?: string | null }) =>
      (await api.patch<TransactionCategory>(`/finance/categories/${id}`, payload, quietMutationConfig)).data,
    remove: async (id: string) =>
      (await api.delete(`/finance/categories/${id}`, quietMutationConfig)).data,
  };

  const transfersApi = {
    ...quietCrud<Transfer>("/transfers"),
    listPage: async (params?: TransferQuery & PaginationParams) =>
      getPaginated<Transfer>("/transfers", params),
    list: async (params?: TransferQuery & PaginationParams) =>
      hasExplicitPagination(params)
        ? (await getPaginated<Transfer>("/transfers", params)).items
        : getAllPaginatedItems<Transfer>("/transfers", params),
  };

  const exchangeRatesApi = {
    ...quietCrud<ExchangeRate>("/exchange-rates"),
  };

  const currenciesApi = {
    getSettings: async () =>
      (await api.get<CurrencySettings>("/currencies/settings")).data,
    updateSettings: async (payload: {
      primaryCurrency: Currency;
      secondaryCurrency: Currency;
      tertiaryCurrency?: Currency;
      currencyDisplayMode?: CurrencyDisplayMode;
    }) => (await api.patch<CurrencySettings>("/currencies/settings", payload)).data,
    listRates: async () => (await api.get<ExchangeRate[]>("/currencies/rates")).data,
    createRate: async (payload: Record<string, unknown>) =>
      (await api.post<ExchangeRate>("/currencies/rates", payload)).data,
    updateRate: async (id: string, payload: Record<string, unknown>) =>
      (await api.patch<ExchangeRate>(`/currencies/rates/${id}`, payload)).data,
    removeRate: async (id: string) => (await api.delete(`/currencies/rates/${id}`)).data,
    syncRates: async () =>
      (await api.post<{ success: boolean; updated: number }>("/currencies/sync-rates")).data,
  };

  return {
    accountsApi,
    transactionsApi,
    transactionCategoriesApi,
    transfersApi,
    exchangeRatesApi,
    currenciesApi,
  };
}
