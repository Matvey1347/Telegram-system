import type { TelegramChannelAccessMode } from "./core";

export type TelegramChannelNetworkKpiStatus =
  | "good"
  | "acceptable"
  | "bad"
  | "unknown";
export type TelegramChannelNetworkSummary = {
  channelsCount: number;
  totalSubscribers: number;
  activeSubscribersEstimate: number;
  paidActiveSubscribersEstimate: number;
  viewRate: number | null;
  totalAdSpend: number;
  campaignsCount: number;
  totalJoinedSubscribers: number;
  totalPendingSubscribers?: number;
  totalAttributedSubscribers?: number;
  avgCpa: number | null;
  activeCpa: number | null;
  kpiStatus: TelegramChannelNetworkKpiStatus;
  kpiLabel: string;
};
export type TelegramChannelNetworkMember = {
  id: string;
  title: string;
  name?: string;
  username?: string | null;
  photoUrl?: string | null;
  accessMode?: TelegramChannelAccessMode;
  subscribersCount?: number | null;
  currentSubscribersCount?: number | null;
  activeSubscribersEstimate?: number | null;
};
export type TelegramChannelNetworkChannelSummary = {
  channelId: string;
  id: string;
  title: string;
  name?: string;
  username?: string | null;
  photoUrl?: string | null;
  subscribersCount?: number | null;
  currentSubscribersCount?: number | null;
  activeSubscribersEstimate?: number | null;
  paidActiveSubscribersEstimate?: number | null;
  viewRate?: number | null;
  totalAdSpend: number;
  campaignsCount: number;
  totalJoinedSubscribers: number;
  totalPendingSubscribers?: number;
  totalAttributedSubscribers?: number;
  avgCpa: number | null;
  activeCpa: number | null;
  kpiStatus: TelegramChannelNetworkKpiStatus;
  kpiLabel?: string;
};
export type TelegramChannelNetwork = {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  channels: TelegramChannelNetworkMember[];
  summary: TelegramChannelNetworkSummary;
};
export type TelegramChannelNetworkDetail = TelegramChannelNetwork & {
  channelSummaries: TelegramChannelNetworkChannelSummary[];
};
export type CreateTelegramChannelNetworkPayload = {
  name: string;
  description?: string | null;
  telegramChannelIds: string[];
};
export type UpdateTelegramChannelNetworkPayload = {
  name?: string;
  description?: string | null;
  telegramChannelIds?: string[];
};
