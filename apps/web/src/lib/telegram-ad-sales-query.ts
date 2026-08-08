"use client";

import type { QueryClient } from "@tanstack/react-query";
import {
  accountKeys,
  currencyKeys,
  dashboardKeys,
  telegramChannelKeys,
  telegramPostKeys,
} from "./query-keys";

export const telegramAdSalesKeys = {
  root: ["telegram-ad-sales"] as const,
  sales: (params?: Record<string, unknown>) =>
    ["telegram-ad-sales", "sales", params ?? {}] as const,
  sale: (saleId: string) => ["telegram-ad-sale", saleId] as const,
  crmAdvertisersRoot: () =>
    ["telegram-ad-sales", "crm", "advertisers"] as const,
  crmAdvertisers: (params?: Record<string, unknown>) =>
    ["telegram-ad-sales", "crm", "advertisers", params ?? {}] as const,
  workspaceSettings: () => ["telegram-ad-sales", "workspace-settings"] as const,
  preferences: () => ["telegram-ad-sales", "preferences"] as const,
  availability: (params: Record<string, unknown>) =>
    ["telegram-ad-availability", params] as const,
  products: (params?: Record<string, unknown>) =>
    ["telegram-ad-products", params ?? {}] as const,
  channelProducts: (channelId: string) =>
    ["telegram-ad-products", "channel", channelId] as const,
  policy: (channelId: string) => ["telegram-ad-policy", channelId] as const,
  baseline: (channelId: string) => ["telegram-ad-baseline", channelId] as const,
  priceHistory: (channelId: string, params?: Record<string, unknown>) =>
    ["telegram-ad-price-history", channelId, params ?? {}] as const,
  analytics: (params?: Record<string, unknown>) =>
    ["telegram-ad-analytics", params ?? {}] as const,
  analyticsSummary: (params?: Record<string, unknown>) =>
    ["telegram-ad-analytics", "summary", params ?? {}] as const,
  channelAnalytics: (channelId: string, params?: Record<string, unknown>) =>
    ["telegram-ad-analytics", "channel", channelId, params ?? {}] as const,
  networkAnalytics: (networkId: string, params?: Record<string, unknown>) =>
    ["telegram-ad-analytics", "network", networkId, params ?? {}] as const,
  revenueSeries: (params?: Record<string, unknown>) =>
    ["telegram-ad-analytics", "revenue-series", params ?? {}] as const,
  pricingSeries: (params?: Record<string, unknown>) =>
    ["telegram-ad-analytics", "pricing-series", params ?? {}] as const,
  inventory: (params?: Record<string, unknown>) =>
    ["telegram-ad-analytics", "inventory", params ?? {}] as const,
  alerts: (params?: Record<string, unknown>) =>
    ["telegram-ad-analytics", "alerts", params ?? {}] as const,
} as const;

export async function invalidateTelegramAdSalesQueries(
  queryClient: QueryClient,
  params?: {
    saleId?: string | null;
    channelIds?: string[];
  },
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: telegramAdSalesKeys.root }),
    queryClient.invalidateQueries({ queryKey: ["telegram-ad-availability"] }),
    queryClient.invalidateQueries({ queryKey: dashboardKeys.summary() }),
    queryClient.invalidateQueries({ queryKey: accountKeys.transactions() }),
    queryClient.invalidateQueries({ queryKey: accountKeys.accounts() }),
    queryClient.invalidateQueries({ queryKey: telegramChannelKeys.list() }),
    queryClient.invalidateQueries({ queryKey: currencyKeys.settings() }),
    queryClient.invalidateQueries({ queryKey: currencyKeys.rates() }),
    ...(params?.saleId
      ? [
          queryClient.invalidateQueries({
            queryKey: telegramAdSalesKeys.sale(params.saleId),
          }),
        ]
      : []),
    ...(params?.channelIds ?? []).flatMap((channelId) => [
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.managedCalendar(channelId),
      }),
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.managed(channelId),
      }),
      queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.financialSummary(channelId),
      }),
      queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.analytics(channelId),
      }),
    ]),
  ]);
}
