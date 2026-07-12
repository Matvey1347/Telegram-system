import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramChannelDataType,
  TelegramChannelSourceRole,
  TelegramDataSourceStatus,
  TelegramSourceType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type TelegramSourcePermissions = {
  canPostMessages: boolean;
  canEditMessages: boolean;
  canDeleteMessages: boolean;
  canInviteUsers: boolean;
  canManageInviteLinks: boolean;
  canViewStats: boolean;
};

type AccessInput = {
  workspaceId: string;
  channelId: string;
  sourceId: string;
  sourceType: TelegramSourceType;
  role: TelegramChannelSourceRole;
  permissions: TelegramSourcePermissions;
  rawPermissions?: unknown;
};

type AttributionInput = {
  workspaceId: string;
  channelId: string;
  sourceId: string;
  sourceType: TelegramSourceType;
  dataType: TelegramChannelDataType;
  status?: TelegramDataSourceStatus;
  sourceDisplayName?: string | null;
  errorMessage?: string | null;
  metadata?: unknown;
};

const dataTypeLabels: Record<TelegramChannelDataType, string> = {
  CHANNEL_INFO: 'Channel info',
  POSTS: 'Posts',
  INVITE_LINKS: 'Invite links',
  STATS: 'Stats',
  MEMBERS: 'Members',
  REACTIONS: 'Reactions',
  VIEWS: 'Views',
  OTHER: 'Other',
};
const TELEGRAM_BROADCAST_STATS_MIN_SUBSCRIBERS = 50;

@Injectable()
export class TelegramSourceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  emptyPermissions(): TelegramSourcePermissions {
    return {
      canPostMessages: false,
      canEditMessages: false,
      canDeleteMessages: false,
      canInviteUsers: false,
      canManageInviteLinks: false,
      canViewStats: false,
    };
  }

  normalizeMtprotoPermissions(raw: Record<string, unknown> | null | undefined) {
    const adminRights = raw?.adminRights as
      | Record<string, unknown>
      | null
      | undefined;
    const role = raw?.isCreator
      ? TelegramChannelSourceRole.OWNER
      : adminRights
        ? TelegramChannelSourceRole.ADMIN
        : TelegramChannelSourceRole.UNKNOWN;
    return {
      role,
      permissions: {
        canPostMessages: Boolean(raw?.isCreator || adminRights?.postMessages),
        canEditMessages: Boolean(raw?.isCreator || adminRights?.editMessages),
        canDeleteMessages: Boolean(
          raw?.isCreator || adminRights?.deleteMessages,
        ),
        canInviteUsers: Boolean(raw?.isCreator || adminRights?.inviteUsers),
        canManageInviteLinks: Boolean(
          raw?.isCreator || adminRights?.inviteUsers,
        ),
        canViewStats: Boolean(raw?.isCreator || adminRights),
      },
    };
  }

  normalizeBotPermissions(raw: Record<string, unknown> | null | undefined) {
    const status = String(raw?.status || '').toLowerCase();
    const role =
      status === 'creator'
        ? TelegramChannelSourceRole.OWNER
        : status === 'administrator'
          ? TelegramChannelSourceRole.ADMIN
          : status === 'member'
            ? TelegramChannelSourceRole.MEMBER
            : TelegramChannelSourceRole.UNKNOWN;
    return {
      role,
      permissions: {
        canPostMessages: Boolean(
          raw?.can_post_messages || status === 'creator',
        ),
        canEditMessages: Boolean(
          raw?.can_edit_messages || status === 'creator',
        ),
        canDeleteMessages: Boolean(
          raw?.can_delete_messages || status === 'creator',
        ),
        canInviteUsers: Boolean(raw?.can_invite_users || status === 'creator'),
        canManageInviteLinks: Boolean(
          raw?.can_invite_users || status === 'creator',
        ),
        canViewStats: false,
      },
    };
  }

  canBeUsedForAnalytics(
    permissions: TelegramSourcePermissions,
    role: TelegramChannelSourceRole,
  ) {
    return (
      role === TelegramChannelSourceRole.OWNER ||
      role === TelegramChannelSourceRole.ADMIN ||
      permissions.canPostMessages ||
      permissions.canEditMessages ||
      permissions.canDeleteMessages ||
      permissions.canManageInviteLinks ||
      permissions.canViewStats
    );
  }

  async upsertAccess(input: AccessInput) {
    return this.prisma.telegramChannelSourceAccess.upsert({
      where: {
        channelId_sourceId_sourceType: {
          channelId: input.channelId,
          sourceId: input.sourceId,
          sourceType: input.sourceType,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        role: input.role,
        ...input.permissions,
        rawPermissions: input.rawPermissions as Prisma.InputJsonValue,
        lastCheckedAt: new Date(),
      },
      update: {
        role: input.role,
        ...input.permissions,
        rawPermissions: input.rawPermissions as Prisma.InputJsonValue,
        lastCheckedAt: new Date(),
      },
    });
  }

  async recordDataSource(input: AttributionInput) {
    return this.prisma.telegramChannelDataSource.create({
      data: {
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        dataType: input.dataType,
        status: input.status || TelegramDataSourceStatus.SUCCESS,
        sourceDisplayName: input.sourceDisplayName || null,
        errorMessage: input.errorMessage || null,
        metadata: input.metadata as Prisma.InputJsonValue,
        syncedAt: new Date(),
      },
    });
  }

  async channelsForSource(
    workspaceId: string,
    sourceId: string,
    sourceType: TelegramSourceType,
  ) {
    const rows = await this.prisma.telegramChannelSourceAccess.findMany({
      where: { workspaceId, sourceId, sourceType },
      include: { channel: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => ({
      channelId: row.channelId,
      telegramChannelId: row.channel.telegramChatId,
      title: row.channel.title,
      username: row.channel.username,
      avatarUrl: row.channel.photoUrl,
      currentSubscribersCount: row.channel.currentSubscribersCount,
      sourceType: row.sourceType,
      role: row.role,
      permissions: this.permissionsFromRow(row),
      rawPermissions: row.rawPermissions,
      lastCheckedAt: row.lastCheckedAt,
      canBeUsedForAnalytics: this.canBeUsedForAnalytics(
        this.permissionsFromRow(row),
        row.role,
      ),
    }));
  }

  async sourcesForChannel(workspaceId: string, channelId: string) {
    const rows = await this.prisma.telegramChannelSourceAccess.findMany({
      where: { workspaceId, channelId },
      orderBy: [{ role: 'asc' }, { updatedAt: 'desc' }],
    });
    const [bots, accounts] = await Promise.all([
      this.prisma.telegramBotIntegration.findMany({
        where: {
          workspaceId,
          isActive: true,
          id: {
            in: rows
              .filter((row) => row.sourceType === TelegramSourceType.BOT)
              .map((row) => row.sourceId),
          },
        },
      }),
      this.prisma.telegramUserAccountIntegration.findMany({
        where: {
          workspaceId,
          isActive: true,
          id: {
            in: rows
              .filter((row) => row.sourceType === TelegramSourceType.MTPROTO)
              .map((row) => row.sourceId),
          },
        },
      }),
    ]);
    const botById = new Map(bots.map((bot) => [bot.id, bot]));
    const accountById = new Map(
      accounts.map((account) => [account.id, account]),
    );
    return rows
      .filter((row) =>
        row.sourceType === TelegramSourceType.BOT
          ? botById.has(row.sourceId)
          : accountById.has(row.sourceId),
      )
      .map((row) => {
        const permissions = this.permissionsFromRow(row);
        return {
          sourceId: row.sourceId,
          sourceType: row.sourceType,
          displayName:
            row.sourceType === TelegramSourceType.BOT
              ? this.botDisplayName(botById.get(row.sourceId))
              : this.accountDisplayName(accountById.get(row.sourceId)),
          avatarUrl:
            row.sourceType === TelegramSourceType.BOT
              ? null
              : accountById.get(row.sourceId)?.photoUrl || null,
          role: row.role,
          permissions,
          rawPermissions: row.rawPermissions,
          lastCheckedAt: row.lastCheckedAt,
          canBeUsedForAnalytics: this.canBeUsedForAnalytics(
            permissions,
            row.role,
          ),
        };
      });
  }

  async analyticsSources(workspaceId: string, channelId: string) {
    const [channel, sources, dataRows] = await Promise.all([
      this.prisma.telegramChannel.findFirst({
        where: { id: channelId, workspaceId },
        select: {
          id: true,
          telegramChatId: true,
          title: true,
          username: true,
          currentSubscribersCount: true,
        },
      }),
      this.sourcesForChannel(workspaceId, channelId),
      this.prisma.telegramChannelDataSource.findMany({
        where: { workspaceId, channelId },
        orderBy: { syncedAt: 'desc' },
      }),
    ]);
    const latestByType = new Map<TelegramChannelDataType, typeof dataRows>();
    for (const row of dataRows) {
      const rows = latestByType.get(row.dataType) || [];
      if (
        !rows.length ||
        rows[0]?.syncedAt.getTime() === row.syncedAt.getTime()
      ) {
        rows.push(row);
        latestByType.set(row.dataType, rows);
      }
    }
    const usedBySource = new Map<string, Set<TelegramChannelDataType>>();
    const visibleSourceKeys = new Set(
      sources.map((source) => `${source.sourceType}:${source.sourceId}`),
    );
    for (const row of dataRows.filter(
      (item) =>
        item.status !== TelegramDataSourceStatus.FAILED &&
        visibleSourceKeys.has(`${item.sourceType}:${item.sourceId}`),
    )) {
      const key = `${row.sourceType}:${row.sourceId}`;
      const set = usedBySource.get(key) || new Set<TelegramChannelDataType>();
      set.add(row.dataType);
      usedBySource.set(key, set);
    }
    const dataAttribution = Object.values(TelegramChannelDataType).map(
      (dataType) => {
        const rows = latestByType.get(dataType) || [];
        const latestStatus = rows[0]?.status || TelegramDataSourceStatus.SKIPPED;
        const rawErrorMessage =
          rows.find((row) => row.errorMessage)?.errorMessage ||
          (rows.length ? null : 'No connected source has required permission');
        const statsUnavailableBecauseChannelIsTooSmall =
          dataType === TelegramChannelDataType.STATS &&
          latestStatus === TelegramDataSourceStatus.FAILED &&
          (channel?.currentSubscribersCount ?? 0) > 0 &&
          (channel?.currentSubscribersCount ?? 0) <
            TELEGRAM_BROADCAST_STATS_MIN_SUBSCRIBERS;
        const status = statsUnavailableBecauseChannelIsTooSmall
          ? TelegramDataSourceStatus.SKIPPED
          : latestStatus;
        const errorMessage = statsUnavailableBecauseChannelIsTooSmall
          ? `Stats are not available yet: Telegram usually opens channel analytics after ${TELEGRAM_BROADCAST_STATS_MIN_SUBSCRIBERS}+ subscribers. Current subscribers: ${channel?.currentSubscribersCount ?? 0}.`
          : rawErrorMessage;
        return {
          dataType,
          label: dataTypeLabels[dataType],
          status,
          sources: rows
            .filter((row) => row.status !== TelegramDataSourceStatus.FAILED)
            .map((row) => ({
              sourceId: row.sourceId,
              sourceType: row.sourceType,
              displayName: row.sourceDisplayName || null,
            })),
          syncedAt: rows[0]?.syncedAt || null,
          errorMessage,
        };
      },
    );
    return {
      channel,
      sources: sources.map((source) => ({
        ...source,
        usedFor: Array.from(
          usedBySource.get(`${source.sourceType}:${source.sourceId}`) || [],
        ),
      })),
      dataAttribution,
    };
  }

  scoreSource(
    source: {
      sourceType: TelegramSourceType;
      role: TelegramChannelSourceRole;
      permissions: TelegramSourcePermissions;
    },
    dataType?: TelegramChannelDataType,
  ) {
    const roleScore = {
      OWNER: 100,
      ADMIN: 70,
      MEMBER: 10,
      UNKNOWN: 0,
    }[source.role];
    const permissionScore =
      (source.permissions.canPostMessages ? 10 : 0) +
      (source.permissions.canEditMessages ? 10 : 0) +
      (source.permissions.canDeleteMessages ? 10 : 0) +
      (source.permissions.canManageInviteLinks ? 15 : 0) +
      (source.permissions.canViewStats ? 25 : 0);
    const typeScore =
      dataType === TelegramChannelDataType.STATS &&
      source.sourceType === TelegramSourceType.MTPROTO
        ? 20
        : dataType === TelegramChannelDataType.POSTS &&
            source.sourceType === TelegramSourceType.BOT
          ? 10
          : 0;
    return roleScore + permissionScore + typeScore;
  }

  async bestMtprotoSource(
    workspaceId: string,
    channelId: string,
    dataType: TelegramChannelDataType,
  ) {
    const sources = await this.sourcesForChannel(workspaceId, channelId);
    return sources
      .filter(
        (source) =>
          source.sourceType === TelegramSourceType.MTPROTO &&
          source.canBeUsedForAnalytics,
      )
      .sort(
        (left, right) =>
          this.scoreSource(right, dataType) - this.scoreSource(left, dataType),
      )[0];
  }

  private permissionsFromRow(
    row: TelegramSourcePermissions,
  ): TelegramSourcePermissions {
    return {
      canPostMessages: row.canPostMessages,
      canEditMessages: row.canEditMessages,
      canDeleteMessages: row.canDeleteMessages,
      canInviteUsers: row.canInviteUsers,
      canManageInviteLinks: row.canManageInviteLinks,
      canViewStats: row.canViewStats,
    };
  }

  private botDisplayName(bot?: {
    label: string;
    username: string | null;
    firstName: string | null;
    botTokenMasked: string;
  }) {
    if (!bot) return 'Telegram bot';
    return bot.username
      ? `@${bot.username}`
      : bot.firstName || bot.label || bot.botTokenMasked;
  }

  private accountDisplayName(account?: {
    label: string;
    username: string | null;
    phoneMasked: string | null;
    firstName: string | null;
  }) {
    if (!account) return 'MTProto account';
    return account.username
      ? `@${account.username}`
      : account.firstName ||
          account.label ||
          account.phoneMasked ||
          'MTProto account';
  }
}
