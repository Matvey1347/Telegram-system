import type { WorkspaceMember } from "./core";

export type TelegramUserAccount = {
  id: string;
  label: string;
  apiId: string;
  phoneMasked?: string;
  telegramUserId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  nameColor?: number;
  isPremium: boolean;
  premiumCheckedAt?: string | null;
  captionLengthMax: number;
  messageLengthMax: number;
  premiumCapabilities?: {
    maxUploadFileSizeMb: number;
    supportsCustomEmoji: boolean;
    limitsSource: "telegram_config" | "fallback";
  } | null;
  status:
    | "pending"
    | "needs_code"
    | "needs_password"
    | "connected"
    | "error"
    | "disabled";
  lastErrorMessage?: string;
  lastCheckedAt?: string;
  lastSyncedAt?: string;
  isActive: boolean;
  assignedMember?: WorkspaceMember | null;
};
export type TelegramBot = {
  id: string;
  label: string;
  botTokenMasked: string;
  botId?: string;
  username?: string;
  firstName?: string;
  lastErrorMessage?: string;
  lastCheckedAt?: string;
  isActive: boolean;
};
export type TelegramSourceType = "BOT" | "MTPROTO";
export type TelegramChannelSourceRole =
  | "OWNER"
  | "ADMIN"
  | "MEMBER"
  | "UNKNOWN";
export type TelegramChannelDataType =
  | "CHANNEL_INFO"
  | "POSTS"
  | "INVITE_LINKS"
  | "STATS"
  | "MEMBERS"
  | "REACTIONS"
  | "VIEWS"
  | "OTHER";
export type TelegramSourcePermissions = {
  canPostMessages: boolean;
  canEditMessages: boolean;
  canDeleteMessages: boolean;
  canInviteUsers: boolean;
  canManageInviteLinks: boolean;
  canViewStats: boolean;
};
export type TelegramSourceChannelAccess = {
  channelId: string;
  telegramChannelId?: string | null;
  title: string;
  username?: string | null;
  avatarUrl?: string | null;
  currentSubscribersCount?: number | null;
  sourceType: TelegramSourceType;
  role: TelegramChannelSourceRole;
  permissions: TelegramSourcePermissions;
  rawPermissions?: unknown;
  lastCheckedAt?: string | null;
  isPremium?: boolean;
  captionLengthMax?: number;
  messageLengthMax?: number;
  premiumCheckedAt?: string | null;
  canBeUsedForAnalytics: boolean;
};
export type TelegramSyncedDialogChannel = {
  channelId: string;
  workspaceChannelId?: string;
  telegramChannelId?: string | null;
  title: string;
  username?: string | null;
  role: TelegramChannelSourceRole;
  permissions: TelegramSourcePermissions;
  canBeUsedForAnalytics: boolean;
};
export type TelegramUserAccountSyncDialogsResponse = {
  success: boolean;
  message?: string;
  channels?: unknown[];
  matchedChannels?: number;
  syncedChannels?: TelegramSyncedDialogChannel[];
  availableChannels?: TelegramSyncedDialogChannel[];
};
export type TelegramChannelSourceAccess = {
  sourceId: string;
  sourceType: TelegramSourceType;
  displayName: string;
  avatarUrl?: string | null;
  isPremium?: boolean;
  captionLengthMax?: number;
  messageLengthMax?: number;
  premiumCheckedAt?: string | null;
  role: TelegramChannelSourceRole;
  permissions: TelegramSourcePermissions;
  rawPermissions?: unknown;
  lastCheckedAt?: string | null;
  canBeUsedForAnalytics: boolean;
};
export type TelegramAnalyticsSources = {
  channel: {
    id: string;
    telegramChatId?: string | null;
    title: string;
    username?: string | null;
  } | null;
  sources: Array<
    TelegramChannelSourceAccess & { usedFor: TelegramChannelDataType[] }
  >;
  dataAttribution: Array<{
    dataType: TelegramChannelDataType;
    label: string;
    status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";
    sources: Array<{
      sourceId: string;
      sourceType: TelegramSourceType;
      displayName?: string | null;
    }>;
    syncedAt?: string | null;
    errorMessage?: string | null;
  }>;
};
