import { TelegramInviteLinkCreatorMatchSource } from '@prisma/client';
import { normalizeTelegramUsername } from './telegram-import.helpers';

export type InviteLinkCreatorSnapshot = {
  creatorTelegramUserId?: string | null;
  creatorUsername?: string | null;
  creatorFirstName?: string | null;
  creatorLastName?: string | null;
  creatorPhotoUrl?: string | null;
};

export type AttributionMember = {
  id: string;
  telegramUsername?: string | null;
};

export type AttributionIntegration = {
  telegramUserId?: string | null;
  username?: string | null;
  assignedMemberId?: string | null;
};

export type InviteLinkAttributionResult = {
  creatorMemberId: string | null;
  creatorMatchSource: TelegramInviteLinkCreatorMatchSource;
  creatorUsername: string | null;
};

export function buildInviteLinkAttributionMaps(params: {
  members: AttributionMember[];
  integrations: AttributionIntegration[];
}) {
  const memberByUsername = new Map<string, string>();
  const memberByTelegramUserId = new Map<string, string>();
  const memberByMtprotoUsername = new Map<string, string>();

  for (const member of params.members) {
    const username = normalizeTelegramUsername(member.telegramUsername);
    if (username && !memberByUsername.has(username)) {
      memberByUsername.set(username, member.id);
    }
  }

  for (const integration of params.integrations) {
    if (!integration.assignedMemberId) continue;
    if (integration.telegramUserId && !memberByTelegramUserId.has(integration.telegramUserId)) {
      memberByTelegramUserId.set(
        integration.telegramUserId,
        integration.assignedMemberId,
      );
    }
    const username = normalizeTelegramUsername(integration.username);
    if (username && !memberByMtprotoUsername.has(username)) {
      memberByMtprotoUsername.set(username, integration.assignedMemberId);
    }
  }

  return {
    memberByUsername,
    memberByTelegramUserId,
    memberByMtprotoUsername,
  };
}

export function attributeInviteLinkCreator(
  snapshot: InviteLinkCreatorSnapshot,
  maps: ReturnType<typeof buildInviteLinkAttributionMaps>,
): InviteLinkAttributionResult {
  const normalizedUsername = normalizeTelegramUsername(snapshot.creatorUsername);

  if (
    snapshot.creatorTelegramUserId &&
    maps.memberByTelegramUserId.has(snapshot.creatorTelegramUserId)
  ) {
    return {
      creatorMemberId:
        maps.memberByTelegramUserId.get(snapshot.creatorTelegramUserId) ?? null,
      creatorMatchSource:
        TelegramInviteLinkCreatorMatchSource.TELEGRAM_USER_ID,
      creatorUsername: normalizedUsername,
    };
  }

  if (normalizedUsername && maps.memberByMtprotoUsername.has(normalizedUsername)) {
    return {
      creatorMemberId:
        maps.memberByMtprotoUsername.get(normalizedUsername) ?? null,
      creatorMatchSource:
        TelegramInviteLinkCreatorMatchSource.MTPROTO_USERNAME,
      creatorUsername: normalizedUsername,
    };
  }

  if (normalizedUsername && maps.memberByUsername.has(normalizedUsername)) {
    return {
      creatorMemberId: maps.memberByUsername.get(normalizedUsername) ?? null,
      creatorMatchSource:
        TelegramInviteLinkCreatorMatchSource.MEMBER_USERNAME,
      creatorUsername: normalizedUsername,
    };
  }

  return {
    creatorMemberId: null,
    creatorMatchSource: TelegramInviteLinkCreatorMatchSource.UNRESOLVED,
    creatorUsername: normalizedUsername,
  };
}
