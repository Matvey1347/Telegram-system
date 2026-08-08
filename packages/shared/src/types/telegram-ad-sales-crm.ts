import type { PaginatedResponse } from "../pagination";
import type { ResolvedEmoji } from "./resolved-emoji";
import type {
  TelegramAdvertiserContactType,
  TelegramAdvertiserLifecycleStage,
  TelegramAdvertiserStatus,
  TelegramAdvertiserTaskPriority,
  TelegramAdvertiserTaskStatus,
  TelegramAdvertiserTaskType,
} from "./telegram-ad-sales";

export type TelegramAdCrmOwnerMode =
  | "SALE_ASSIGNEE"
  | "ADVERTISER_OWNER"
  | "WORKSPACE_DEFAULT";

export type TelegramAdCrmMemberSettings = {
  id: string;
  workspaceId: string;
  workspaceMemberId: string;
  defaultFollowUpDays: number;
  defaultReactivationDays: number;
  autoCreateFollowUpAfterPlacement: boolean;
  autoCreateFeedbackTask: boolean;
  autoCreatePaymentFollowUp: boolean;
  dailyDigestEnabled: boolean;
  overdueDigestEnabled: boolean;
  reminderNotificationsEnabled: boolean;
  preferredReminderTime: string | null;
  timezone: string;
  defaultTaskPriority: TelegramAdvertiserTaskPriority;
  defaultAdvertiserOwnerMode: TelegramAdCrmOwnerMode;
  createdAt: string;
  updatedAt: string;
};

export type TelegramAdCrmWorkspaceSettings = {
  workspaceId: string;
  defaultFollowUpDays: number;
  defaultReactivationDays: number;
  defaultSaleOwnerAssignment: TelegramAdCrmOwnerMode;
  autoCreateAdvertiserFromSale: boolean;
  requireAdvertiserForConfirmedSale: boolean;
  duplicateDetectionEnabled: boolean;
  inactivityThresholdDays: number;
  highValueCustomerThreshold: string;
  createdAt: string;
  updatedAt: string;
};

export type TelegramAdSaleMetricsResponse = {
  saleId: string;
  placements: Array<{
    placementId: string;
    actualViews24h: number | null;
    actualViews48h: number | null;
    actualViewsFinal: number | null;
    actualCpm: string | null;
  }>;
};

export type TelegramAdCrmRecencyBucket =
  | "NONE"
  | "RECENT"
  | "WARM"
  | "COLD"
  | "DORMANT";

export type TelegramAdCrmFrequencyBucket =
  | "NONE"
  | "ONE_TIME"
  | "REPEAT"
  | "LOYAL"
  | "POWER";

export type TelegramAdCrmRfmSegment =
  | "CHAMPION"
  | "LOYAL"
  | "PROMISING"
  | "NEW"
  | "AT_RISK"
  | "DORMANT"
  | "LOST"
  | "LEAD";

export type TelegramAdCrmUrgency = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export type TelegramAdCrmAdvertiserListItem = {
  id: string;
  displayName: string;
  companyName: string | null;
  telegramUsername: string | null;
  primaryContact: {
    id: string;
    type: TelegramAdvertiserContactType;
    value: string;
    label: string | null;
    isPrimary: boolean;
  } | null;
  ownerMember: {
    id: string;
    name: string;
    email: string;
    avatarPresentation?: ResolvedEmoji | null;
  } | null;
  status: TelegramAdvertiserStatus;
  lifecycleStage: TelegramAdvertiserLifecycleStage;
  completedSalesCount: number;
  totalSalesCount: number;
  completedPlacementsCount: number;
  totalPlacementsCount: number;
  totalRevenueInPrimaryCurrency: string;
  averageOrderValueInPrimaryCurrency: string;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  lastContactAt: string | null;
  nextContactAt: string | null;
  daysSinceLastPurchase: number | null;
  recencyBucket: TelegramAdCrmRecencyBucket;
  frequencyBucket: TelegramAdCrmFrequencyBucket;
  monetaryValue: number;
  isHighValue: boolean;
  rfmSegment: TelegramAdCrmRfmSegment;
  priorityRank: number;
  urgency: TelegramAdCrmUrgency;
  nextOpenTask: {
    id: string;
    title: string;
    dueAt: string;
    priority: TelegramAdvertiserTaskPriority;
    type: TelegramAdvertiserTaskType;
    status: TelegramAdvertiserTaskStatus;
  } | null;
  lostReason: string | null;
  lostAt: string | null;
};

export type TelegramAdCrmAdvertisersListResult =
  PaginatedResponse<TelegramAdCrmAdvertiserListItem>;
