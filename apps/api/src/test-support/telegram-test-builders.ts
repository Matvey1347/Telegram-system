import type {
  ResolvedTelegramEntity,
  TelegramTitleCandidate,
} from "../telegram/shared/telegram-import.helpers";

let sequence = 0;

function nextId(prefix: string) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export function resetTelegramTestBuilders() {
  sequence = 0;
}

export function buildWorkspace(overrides: Partial<{
  id: string;
  name: string;
}> = {}) {
  const id = overrides.id || nextId("workspace");
  return {
    id,
    name: overrides.name || `Workspace ${id}`,
  };
}

export function buildTelegramChannel(
  overrides: Partial<{
    id: string;
    workspaceId: string;
    title: string;
    username: string | null;
    telegramChatId: string;
    inviteLink: string | null;
    accessMode:
      | "PUBLIC"
      | "PRIVATE"
      | "PRIVATE_INVITE"
      | "PRIVATE_JOIN_REQUEST"
      | "UNKNOWN";
    requiresJoinRequest: boolean;
    telegramAccessHash: string | null;
  }> = {},
) {
  const numeric = String(10_000 + sequence + 1);
  return {
    id: overrides.id || nextId("channel"),
    workspaceId: overrides.workspaceId || nextId("workspace"),
    title: overrides.title || `Telegram Channel ${numeric}`,
    username:
      overrides.username === undefined ? `channel_${numeric}` : overrides.username,
    telegramChatId: overrides.telegramChatId || numeric,
    inviteLink:
      overrides.inviteLink === undefined
        ? `https://t.me/+invite_${numeric}`
        : overrides.inviteLink,
    accessMode: overrides.accessMode || "PUBLIC",
    requiresJoinRequest: overrides.requiresJoinRequest ?? false,
    telegramAccessHash:
      overrides.telegramAccessHash === undefined
        ? `${90_000 + sequence}`
        : overrides.telegramAccessHash,
  };
}

export function buildTelegramUserAccount(
  overrides: Partial<{
    id: string;
    workspaceId: string;
    label: string;
    apiId: string;
    username: string | null;
    firstName: string | null;
    phoneMasked: string | null;
    sessionEncrypted: string | null;
    sessionIv: string | null;
    sessionAuthTag: string | null;
  }> = {},
) {
  const id = overrides.id || nextId("tg-account");
  return {
    id,
    workspaceId: overrides.workspaceId || nextId("workspace"),
    label: overrides.label || `MTProto ${id}`,
    apiId: overrides.apiId || `${20_000 + sequence}`,
    apiHashEncrypted: "enc",
    apiHashIv: "iv",
    apiHashAuthTag: "tag",
    username:
      overrides.username === undefined ? `account_${sequence}` : overrides.username,
    firstName: overrides.firstName === undefined ? `User ${sequence}` : overrides.firstName,
    phoneMasked:
      overrides.phoneMasked === undefined ? `+100000${sequence}` : overrides.phoneMasked,
    sessionEncrypted:
      overrides.sessionEncrypted === undefined ? "session" : overrides.sessionEncrypted,
    sessionIv: overrides.sessionIv === undefined ? "session-iv" : overrides.sessionIv,
    sessionAuthTag:
      overrides.sessionAuthTag === undefined ? "session-tag" : overrides.sessionAuthTag,
  };
}

export function buildSourcePermissions(
  overrides: Partial<{
    canPostMessages: boolean;
    canEditMessages: boolean;
    canDeleteMessages: boolean;
    canInviteUsers: boolean;
    canManageInviteLinks: boolean;
    canViewStats: boolean;
  }> = {},
) {
  return {
    canPostMessages: overrides.canPostMessages ?? true,
    canEditMessages: overrides.canEditMessages ?? true,
    canDeleteMessages: overrides.canDeleteMessages ?? true,
    canInviteUsers: overrides.canInviteUsers ?? true,
    canManageInviteLinks: overrides.canManageInviteLinks ?? true,
    canViewStats: overrides.canViewStats ?? true,
  };
}

export function buildResolvedTelegramEntity(
  overrides: Partial<ResolvedTelegramEntity> = {},
): ResolvedTelegramEntity {
  const numeric = String(30_000 + sequence + 1);
  return {
    kind: overrides.kind || "channel",
    telegramChatId: overrides.telegramChatId || numeric,
    title: overrides.title || `Resolved Channel ${numeric}`,
    username:
      overrides.username === undefined ? `resolved_${numeric}` : overrides.username,
    description:
      overrides.description === undefined ? `Description ${numeric}` : overrides.description,
    participantsCount:
      overrides.participantsCount === undefined ? 100 + sequence : overrides.participantsCount,
    photoUrl:
      overrides.photoUrl === undefined
        ? `https://example.com/channel-${numeric}.jpg`
        : overrides.photoUrl,
    telegramAccessHash:
      overrides.telegramAccessHash === undefined
        ? `${70_000 + sequence}`
        : overrides.telegramAccessHash,
    inviteLink:
      overrides.inviteLink === undefined
        ? `https://t.me/+resolved_${numeric}`
        : overrides.inviteLink,
    joinedByInvite: overrides.joinedByInvite ?? false,
    accessMode: overrides.accessMode || "PUBLIC",
    requiresJoinRequest: overrides.requiresJoinRequest ?? false,
  };
}

export function buildTelegramTitleCandidate<T = unknown>(
  overrides: Partial<TelegramTitleCandidate<T>> = {},
) {
  const numeric = String(40_000 + sequence + 1);
  return {
    entity: (overrides.entity ?? ({ id: numeric } as T)) as T,
    entityId: overrides.entityId || numeric,
    kind: overrides.kind || "channel",
    title: overrides.title || `Candidate ${numeric}`,
    username:
      overrides.username === undefined ? `candidate_${numeric}` : overrides.username,
    source: overrides.source || "dialogs",
  } satisfies TelegramTitleCandidate<T>;
}
