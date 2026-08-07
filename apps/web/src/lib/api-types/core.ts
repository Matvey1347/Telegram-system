import type {
  BulkActionResult,
  BulkActionResultItem,
  PaginatedResponse,
  PaginationMeta,
  StructuredApiError,
  SyncOperationResult,
  TelegramChannelAccessMode,
  ResolvedEmoji,
} from "@telegram-system/shared";

export type {
  BulkActionResult,
  BulkActionResultItem,
  PaginatedResponse,
  PaginationMeta,
  StructuredApiError,
  SyncOperationResult,
  TelegramChannelAccessMode,
  ResolvedEmoji,
};

export type WorkspaceRole = "owner" | "admin" | "MEDIA_BUYER" | "member";
export type PaginationParams = {
  page?: number;
  pageSize?: number;
};
export type CurrencyDisplayMode = "code" | "symbol";
export type IconType = "emoji" | "image";
export type Icon = {
  id: string;
  workspaceId?: string | null;
  type: IconType;
  name: string;
  emoji?: string | null;
  imageUrl?: string | null;
  createdByUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};
export type WorkspaceInfo = {
  id: string;
  name: string;
  timezone?: string;
  role: WorkspaceRole;
  primaryCurrency?: Currency;
  secondaryCurrency?: Currency;
  currencyDisplayMode?: CurrencyDisplayMode;
  avatarIcon?: Icon | null;
  avatarPresentation?: ResolvedEmoji | null;
};
export type User = {
  id: string;
  email: string;
  name: string;
  createdAt?: string;
};
export type AuthResponse = {
  accessToken: string;
  user: User;
  workspace: WorkspaceInfo;
};
export type MeResponse = { user: User; workspace: WorkspaceInfo };
export type TelegramAccountCapabilitySummary = {
  isPremium: boolean;
  captionLengthMax: number;
  messageLengthMax: number;
  maxUploadFileSizeMb: number;
  supportsCustomEmoji: boolean;
  checkedAt: string;
  limitsSource: "telegram_config" | "fallback";
};
export type AccountMe = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  avatarIconId?: string | null;
  avatarIcon?: Icon | null;
  avatarPresentation?: ResolvedEmoji | null;
  telegramUsername?: string | null;
  assignedTelegramUserAccounts?: Array<{
    id: string;
    label: string;
    telegramUserId?: string | null;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    photoUrl?: string | null;
    status:
      | "pending"
      | "needs_code"
      | "needs_password"
      | "connected"
      | "error"
      | "disabled";
    capabilities?: TelegramAccountCapabilitySummary | null;
  }>;
  workspace: WorkspaceInfo;
};
export type WorkspaceMemberSelectOption = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  avatarIconId?: string | null;
  avatarIcon?: Icon | null;
  avatarPresentation?: ResolvedEmoji | null;
  user: User;
  isCurrentUser: boolean;
};
export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  isHidden?: boolean;
  avatarIconId?: string | null;
  avatarIcon?: Icon | null;
  avatarPresentation?: ResolvedEmoji | null;
  telegramUsername?: string | null;
  createdAt: string;
  user: User;
  isCurrentUser: boolean;
  assignedTelegramUserAccounts?: Array<{
    id: string;
    label: string;
    telegramUserId?: string | null;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    photoUrl?: string | null;
    status:
      | "pending"
      | "needs_code"
      | "needs_password"
      | "connected"
      | "error"
      | "disabled";
  }>;
  investmentSummary?: {
    isInvestor: boolean;
    totalInvestedPrimary: number;
    investmentSharePercent: number;
    investmentsCount: number;
  };
  temporaryPassword?: string;
};
export type AssignedMember = WorkspaceMember;
export type EntityAssignment = {
  assignedMemberId?: string | null;
  assignedMember?: AssignedMember | null;
  createdByUserId?: string | null;
  createdByUser?: Pick<User, "id" | "email" | "name"> | null;
};
export type GlobalSearchResult = {
  id: string;
  type: string;
  label: string;
  title: string;
  subtitle?: string | null;
  href: string;
  iconUrl?: string | null;
  iconEmoji?: string | null;
};
export type Currency = string;
