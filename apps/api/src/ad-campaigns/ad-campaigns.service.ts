import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  sumInviteLinkAttributedSubscribers,
  sumInviteLinkJoinedSubscribers,
} from '../common/analytics/invite-link-metrics';
import { createPaginatedResponse, normalizePagination } from '../common/pagination/pagination.utils';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { FinanceCategoriesService } from '../finance-categories/finance-categories.service';
import {
  AdCampaignAnalyticsInputDto,
  AdCampaignQueryDto,
  CreateAdCampaignDto,
  UpdateAdCampaignDto,
} from './dto';
import { AdCampaignAnalyticsService } from './ad-campaign-analytics.service';

@Injectable()
export class AdCampaignsService {
  private campaignPromoStorageState: 'unknown' | 'available' | 'missing' =
    'unknown';
  private inviteLinkSnapshotStorageState: 'unknown' | 'available' | 'missing' =
    'unknown';

  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private financeCategoriesService: FinanceCategoriesService,
    private campaignAnalyticsService: AdCampaignAnalyticsService,
  ) {}

  private analyticsInputData(dto: Partial<AdCampaignAnalyticsInputDto>) {
    return {
      subscribersBefore: dto.subscribersBefore,
      avgViewsBefore: dto.avgViewsBefore,
      avgReactionsBefore: dto.avgReactionsBefore,
      subscribersAfter24h: dto.subscribersAfter24h,
      subscribersAfter48h: dto.subscribersAfter48h,
      subscribersAfter72h: dto.subscribersAfter72h,
      subscribersAfter7d: dto.subscribersAfter7d,
      subscribersAfter30d: dto.subscribersAfter30d,
      avgViewsAfter: dto.avgViewsAfter,
      avgReactionsAfter: dto.avgReactionsAfter,
      clicksAfter: dto.clicksAfter,
      analyticsNotes: dto.analyticsNotes,
      excludeFromAnalytics: dto.excludeFromAnalytics,
    };
  }

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private isCampaignPromoTableMissing(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2021') return true;
    if (error.code !== 'P2010') return false;

    const originalCode =
      (
        error.meta as
          | {
              driverAdapterError?: {
                cause?: { originalCode?: string };
              };
            }
          | undefined
      )?.driverAdapterError?.cause?.originalCode ?? null;

    return originalCode === '42P01';
  }

  private async hasCampaignPromoStorage() {
    if (this.campaignPromoStorageState === 'available') return true;
    if (this.campaignPromoStorageState === 'missing') return false;

    try {
      await this.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM "AdCampaignPromo" LIMIT 1`,
      );
      this.campaignPromoStorageState = 'available';
      return true;
    } catch (error) {
      if (!this.isCampaignPromoTableMissing(error)) throw error;
      this.campaignPromoStorageState = 'missing';
      return false;
    }
  }

  private isInviteLinkSnapshotStorageMissing(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2021') return true;
    if (error.code !== 'P2010') return false;

    const originalCode =
      (
        error.meta as
          | {
              driverAdapterError?: {
                cause?: { originalCode?: string };
              };
            }
          | undefined
      )?.driverAdapterError?.cause?.originalCode ?? null;

    return originalCode === '42P01';
  }

  private async ensurePromoBelongsToChannel(
    workspaceId: string,
    promoId: string,
    channelId: string,
  ) {
    const promo = await this.prisma.promo.findFirst({
      where: { id: promoId, workspaceId, telegramChannelId: channelId },
    });
    if (!promo)
      throw new BadRequestException(
        'Promo must belong to selected Telegram channel',
      );
  }

  private normalizeSelectionIds(ids: Array<string | null | undefined>) {
    return [...new Set(ids.map((value) => String(value || '').trim()).filter(Boolean))];
  }

  private inviteLinkHistoryPoints<T extends { syncedAt: Date; joinedCount: number; requestedCount: number }>(
    rows: T[],
  ) {
    let peakJoinedCount = 0;
    return rows.map((row) => {
      const joinedCount = Number(row.joinedCount || 0);
      const requestedCount = Number(row.requestedCount || 0);
      peakJoinedCount = Math.max(peakJoinedCount, joinedCount);
      const drawdownFromPeak = Math.max(0, peakJoinedCount - joinedCount);
      const drawdownPercent =
        peakJoinedCount > 0 ? (drawdownFromPeak / peakJoinedCount) * 100 : 0;
      return {
        syncedAt: row.syncedAt,
        joinedCount,
        requestedCount,
        totalAttributed: joinedCount + requestedCount,
        peakJoinedCount,
        drawdownFromPeak,
        drawdownPercent,
      };
    });
  }

  private inviteLinkSyntheticHistoryPoint(params: {
    syncedAt?: Date | null;
    joinedCount?: number | null;
    requestedCount?: number | null;
    isRevoked?: boolean | null;
  }) {
    return {
      syncedAt: params.syncedAt ?? new Date(),
      joinedCount: Number(params.joinedCount ?? 0),
      requestedCount: Number(params.requestedCount ?? 0),
      isRevoked: Boolean(params.isRevoked),
    };
  }

  private appendCurrentInviteLinkHistoryRowIfChanged<
    T extends {
      syncedAt: Date;
      joinedCount: number;
      requestedCount: number;
      isRevoked?: boolean | null;
    },
  >(
    rows: T[],
    current: {
      syncedAt?: Date | null;
      joinedCount?: number | null;
      requestedCount?: number | null;
      isRevoked?: boolean | null;
    },
  ) {
    const currentJoinedCount = Number(current.joinedCount ?? 0);
    const currentRequestedCount = Number(current.requestedCount ?? 0);
    const currentRevoked = Boolean(current.isRevoked);
    const latest = rows[rows.length - 1] ?? null;
    if (
      latest &&
      Number(latest.joinedCount || 0) === currentJoinedCount &&
      Number(latest.requestedCount || 0) === currentRequestedCount &&
      Boolean(latest.isRevoked) === currentRevoked
    ) {
      return rows;
    }
    return [
      ...rows,
      this.inviteLinkSyntheticHistoryPoint({
        syncedAt: current.syncedAt ?? new Date(),
        joinedCount: currentJoinedCount,
        requestedCount: currentRequestedCount,
        isRevoked: currentRevoked,
      }),
    ];
  }

  private inviteLinkHistorySummary<
    T extends {
      joinedCount: number;
      requestedCount: number;
      peakJoinedCount: number;
      drawdownFromPeak: number;
      drawdownPercent: number;
    },
  >(points: T[]) {
    const current = points[points.length - 1] ?? null;
    const peakJoinedCount = points.reduce(
      (max, point) => Math.max(max, Number(point.peakJoinedCount || 0)),
      0,
    );
    const peakRequestedCount = points.reduce(
      (max, point) => Math.max(max, Number(point.requestedCount || 0)),
      0,
    );
    return {
      currentJoinedCount: Number(current?.joinedCount || 0),
      currentRequestedCount: Number(current?.requestedCount || 0),
      currentTotalAttributed:
        Number(current?.joinedCount || 0) + Number(current?.requestedCount || 0),
      peakJoinedCount,
      peakRequestedCount,
      peakTotalAttributed: peakJoinedCount + peakRequestedCount,
      drawdownFromPeak: Number(current?.drawdownFromPeak || 0),
      drawdownPercent: Number(current?.drawdownPercent || 0),
      hasHighDropoff: Number(current?.drawdownPercent || 0) >= 15,
    };
  }

  private buildCampaignInviteLinkHistoryPayload(
    campaign: {
      id: string;
      title?: string | null;
      inviteLinks: Array<{
        id: string;
        name: string;
        url: string;
        joinedCount: number;
        requestedCount?: number | null;
        isRevoked: boolean;
        lastSyncedAt?: Date | null;
        createdAt?: Date | null;
        updatedAt?: Date | null;
      }>;
    },
    rowsAsc: Array<{
      inviteLinkId: string;
      syncedAt: Date;
      joinedCount: number;
      requestedCount: number;
      isRevoked: boolean | null;
    }>,
    limit = 120,
  ) {
    const maxPoints = Math.max(2, Math.min(365, limit));
    const grouped = new Map<
      string,
      { syncedAt: Date; joinedCount: number; requestedCount: number; isRevoked: boolean }
    >();
    for (const row of rowsAsc) {
      const key = row.syncedAt.toISOString();
      const current = grouped.get(key);
      if (current) {
        current.joinedCount += Number(row.joinedCount || 0);
        current.requestedCount += Number(row.requestedCount || 0);
        current.isRevoked = current.isRevoked && Boolean(row.isRevoked);
      } else {
        grouped.set(key, {
          syncedAt: row.syncedAt,
          joinedCount: Number(row.joinedCount || 0),
          requestedCount: Number(row.requestedCount || 0),
          isRevoked: Boolean(row.isRevoked),
        });
      }
    }

    const currentAggregateSyncedAt = campaign.inviteLinks.reduce<Date | null>(
      (latest, link) => {
        const candidate =
          link.lastSyncedAt ?? link.updatedAt ?? link.createdAt ?? null;
        if (!candidate) return latest;
        if (!latest || candidate.getTime() > latest.getTime()) return candidate;
        return latest;
      },
      null,
    );
    const aggregateRows = this.appendCurrentInviteLinkHistoryRowIfChanged(
      [...grouped.values()].slice(-maxPoints),
      {
        syncedAt: currentAggregateSyncedAt,
        joinedCount: campaign.inviteLinks.reduce(
          (sum, link) => sum + Number(link.joinedCount || 0),
          0,
        ),
        requestedCount: campaign.inviteLinks.reduce(
          (sum, link) => sum + Number(link.requestedCount || 0),
          0,
        ),
        isRevoked:
          campaign.inviteLinks.length > 0 &&
          campaign.inviteLinks.every((link) => Boolean(link.isRevoked)),
      },
    ).slice(-maxPoints);
    const aggregatePoints = this.inviteLinkHistoryPoints(
      aggregateRows.length
        ? aggregateRows
        : [
            this.inviteLinkSyntheticHistoryPoint({
              joinedCount: campaign.inviteLinks.reduce(
                (sum, link) => sum + Number(link.joinedCount || 0),
                0,
              ),
              requestedCount: campaign.inviteLinks.reduce(
                (sum, link) => sum + Number(link.requestedCount || 0),
                0,
              ),
              isRevoked:
                campaign.inviteLinks.length > 0 &&
                campaign.inviteLinks.every((link) => Boolean(link.isRevoked)),
            }),
          ],
    );

    const perLinkRows = new Map<
      string,
      Array<{ syncedAt: Date; joinedCount: number; requestedCount: number; isRevoked: boolean }>
    >();
    for (const row of rowsAsc) {
      const list = perLinkRows.get(row.inviteLinkId) ?? [];
      list.push({
        syncedAt: row.syncedAt,
        joinedCount: Number(row.joinedCount || 0),
        requestedCount: Number(row.requestedCount || 0),
        isRevoked: Boolean(row.isRevoked),
      });
      perLinkRows.set(row.inviteLinkId, list);
    }

    const inviteLinks = campaign.inviteLinks.map((link) => {
      const linkRows = this.appendCurrentInviteLinkHistoryRowIfChanged(
        (perLinkRows.get(link.id) ?? []).slice(-maxPoints),
        {
          syncedAt: link.lastSyncedAt ?? link.updatedAt ?? link.createdAt ?? null,
          joinedCount: link.joinedCount,
          requestedCount: link.requestedCount,
          isRevoked: link.isRevoked,
        },
      ).slice(-maxPoints);
      const points = this.inviteLinkHistoryPoints(
        linkRows.length
          ? linkRows
          : [
              this.inviteLinkSyntheticHistoryPoint({
                joinedCount: link.joinedCount,
                requestedCount: link.requestedCount,
                isRevoked: link.isRevoked,
              }),
            ],
      );
      return {
        ...link,
        points,
        summary: this.inviteLinkHistorySummary(points),
      };
    });

    return {
      campaign: {
        id: campaign.id,
        title: campaign.title,
      },
      inviteLinks,
      points: aggregatePoints,
      summary: {
        ...this.inviteLinkHistorySummary(aggregatePoints),
        inviteLinksCount: campaign.inviteLinks.length,
      },
    };
  }

  private async preloadCampaignInviteLinkHistories(
    workspaceId: string,
    rows: any[],
    limit = 120,
  ) {
    if (!rows.length) return new Map<string, ReturnType<AdCampaignsService["buildCampaignInviteLinkHistoryPayload"]>>();
    const campaignIds = rows.map((row) => row.id);
    let snapshotRows: Array<{
      adCampaignId: string | null;
      inviteLinkId: string;
      syncedAt: Date;
      joinedCount: number;
      requestedCount: number;
      isRevoked: boolean | null;
    }> = [];
    if (this.inviteLinkSnapshotStorageState !== 'missing') {
      try {
        snapshotRows = await this.prisma.telegramInviteLinkSnapshot.findMany({
          where: {
            workspaceId,
            adCampaignId: { in: campaignIds },
          },
          orderBy: [{ adCampaignId: 'asc' }, { syncedAt: 'asc' }, { inviteLinkId: 'asc' }],
          take: Math.max(2, Math.min(5000, limit * Math.max(1, campaignIds.length))),
          select: {
            adCampaignId: true,
            inviteLinkId: true,
            syncedAt: true,
            joinedCount: true,
            requestedCount: true,
            isRevoked: true,
          },
        });
        this.inviteLinkSnapshotStorageState = 'available';
      } catch (error) {
        if (!this.isInviteLinkSnapshotStorageMissing(error)) throw error;
        this.inviteLinkSnapshotStorageState = 'missing';
      }
    }

    const rowsByCampaignId = new Map<string, typeof snapshotRows>();
    for (const row of snapshotRows) {
      if (!row.adCampaignId) continue;
      const list = rowsByCampaignId.get(row.adCampaignId) ?? [];
      list.push(row);
      rowsByCampaignId.set(row.adCampaignId, list);
    }

    const historyByCampaignId = new Map<
      string,
      ReturnType<AdCampaignsService["buildCampaignInviteLinkHistoryPayload"]>
    >();
    for (const row of rows) {
      const inviteLinks = Array.isArray(row.inviteLinks)
        ? row.inviteLinks.map((link: any) => ({
            ...link,
            requestedCount: Number(link.requestedCount ?? 0),
          }))
        : [];
      historyByCampaignId.set(
        row.id,
        this.buildCampaignInviteLinkHistoryPayload(
          {
            id: row.id,
            title: row.title,
            inviteLinks,
          },
          rowsByCampaignId.get(row.id) ?? [],
          limit,
        ),
      );
    }
    return historyByCampaignId;
  }

  private selectedPromoIds(dto: {
    promoId?: string | null;
    promoIds?: string[] | null;
  }) {
    return this.normalizeSelectionIds([
      ...(dto.promoIds || []),
      dto.promoId,
    ]);
  }

  private selectedInviteLinkIds(dto: {
    telegramInviteLinkId?: string | null;
    inviteLinkIds?: string[] | null;
  }) {
    return this.normalizeSelectionIds([
      ...(dto.inviteLinkIds || []),
      dto.telegramInviteLinkId,
    ]);
  }

  private async ensurePromosBelongToChannel(
    workspaceId: string,
    promoIds: string[],
    channelId: string,
  ) {
    if (!promoIds.length) return;
    const promos = await this.prisma.promo.findMany({
      where: { id: { in: promoIds }, workspaceId, telegramChannelId: channelId },
      select: { id: true },
    });
    if (promos.length !== promoIds.length) {
      throw new BadRequestException(
        'One or more promos do not belong to selected Telegram channel',
      );
    }
  }

  private formatDatePart(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private shortenBlock(value?: string | null) {
    const words = String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return '-';
    if (words.length <= 2) return words.join(' ');
    return `${words[0]} ${words[1]}...`;
  }

  private formatPromoLabel(promos: Array<{ title?: string | null }>) {
    const cleaned = promos
      .map((promo) => this.shortenBlock(promo?.title))
      .filter((title) => title && title !== '-');
    if (!cleaned.length) return 'promo';
    if (cleaned.length === 1) return cleaned[0];
    return `${cleaned[0]} +${cleaned.length - 1}`;
  }

  private sourceTypeLabel(source: any) {
    const raw = String(source?.sourceKind || source?.sourceType || 'telegram')
      .replace(/_/g, ' ')
      .trim();
    return raw || 'telegram';
  }

  private parseAdvertisingSourceSelection(ids: string[]) {
    const channelIds: string[] = [];
    const sourceIds: string[] = [];
    for (const rawId of ids || []) {
      const raw = String(rawId || '').trim();
      if (!raw) continue;
      if (raw.startsWith('source:') || raw.startsWith('person:')) {
        sourceIds.push(raw.replace(/^(source|person):/, ''));
      } else if (raw.startsWith('channel:')) {
        channelIds.push(raw.replace(/^channel:/, ''));
      } else {
        channelIds.push(raw);
      }
    }
    return {
      channelIds: [...new Set(channelIds)],
      sourceIds: [...new Set(sourceIds)],
    };
  }

  private normalizeTelegramChannelSource(channel: any) {
    const isOwn =
      Array.isArray(channel?.adminLinks) && channel.adminLinks.length > 0;
    return {
      ...channel,
      selectionId: `channel:${channel.id}`,
      sourceKind: isOwn ? 'own_channel' : 'external_channel',
      kind: isOwn ? 'own_channel' : 'external_channel',
      imageUrl: channel.photoUrl,
      subscribersCount: channel.currentSubscribersCount ?? 0,
    };
  }

  private normalizePersonSource(source: any) {
    return {
      id: source.id,
      selectionId: `source:${source.id}`,
      sourceKind: 'person',
      kind: 'person',
      title: source.name,
      username: source.telegramUsername,
      telegramUrl: source.url,
      contactInfo: source.contactInfo,
      notes: source.notes,
      imageUrl: source.imageUrl,
      subscribersCount: source.subscribersCount ?? 0,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    };
  }

  private normalizeUsername(value?: string | null) {
    const normalized = String(value || '')
      .trim()
      .replace(/^@/, '')
      .toLowerCase();
    return normalized || null;
  }

  private async resolveLegacyTelegramChannelSource(
    tx: any,
    workspaceId: string,
    source: any,
  ) {
    const username = this.normalizeUsername(source?.telegramUsername);
    const channel = await tx.telegramChannel.findFirst({
      where: {
        workspaceId,
        OR: [
          ...(username ? [{ username: { equals: username, mode: 'insensitive' } }] : []),
          ...(source?.name ? [{ title: source.name }] : []),
        ],
      },
      include: { adminLinks: true },
    });
    return channel ? this.normalizeTelegramChannelSource(channel) : null;
  }

  private dedupeAdvertisingSources(sources: any[]) {
    const seen = new Set<string>();
    return sources.filter((source) => {
      const key =
        source.selectionId ||
        `${source.sourceKind || source.kind || 'unknown'}:${source.id || source.title || source.name || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async resolveAdvertisingSourceSelection(
    tx: any,
    workspaceId: string,
    rawIds: string[],
  ) {
    const parsed = this.parseAdvertisingSourceSelection(rawIds);
    const [channels, sourceRows] = await Promise.all([
      parsed.channelIds.length
        ? tx.telegramChannel.findMany({
            where: { workspaceId, id: { in: parsed.channelIds } },
            select: { id: true },
          })
        : [],
      parsed.sourceIds.length
        ? tx.advertisingSource.findMany({
            where: { workspaceId, id: { in: parsed.sourceIds } },
            select: {
              id: true,
              type: true,
              name: true,
              telegramUsername: true,
            },
          })
        : [],
    ]);

    if (channels.length !== parsed.channelIds.length) {
      throw new BadRequestException(
        'One or more advertising channels are invalid',
      );
    }

    if (sourceRows.length !== parsed.sourceIds.length) {
      throw new BadRequestException(
        'One or more advertising people are invalid',
      );
    }

    const people = sourceRows.filter(
      (source: any) => source.type !== 'telegram_channel',
    );
    const legacyChannelSources = sourceRows.filter(
      (source: any) => source.type === 'telegram_channel',
    );

    const resolvedLegacyChannels = await Promise.all(
      legacyChannelSources.map((source: any) =>
        this.resolveLegacyTelegramChannelSource(tx, workspaceId, source),
      ),
    );

    const unresolvedLegacyChannelSources = legacyChannelSources.filter(
      (_source: any, index: number) => !resolvedLegacyChannels[index]?.id,
    );

    return {
      channelIds: [
        ...new Set([
          ...parsed.channelIds,
          ...resolvedLegacyChannels
            .filter((channel: any) => channel?.id)
            .map((channel: any) => channel.id),
        ]),
      ],
      sourceIds: [
        ...new Set([
          ...people.map((source: any) => source.id),
          ...unresolvedLegacyChannelSources.map((source: any) => source.id),
        ]),
      ],
    };
  }

  private async ensureAdvertisingSources(
    tx: any,
    workspaceId: string,
    ownTelegramChannelId: string,
    advertisingSourceIds: string[],
  ) {
    const parsed = await this.resolveAdvertisingSourceSelection(
      tx,
      workspaceId,
      advertisingSourceIds,
    );
    if (parsed.channelIds.includes(ownTelegramChannelId)) {
      throw new BadRequestException(
        'Advertising channel cannot be the same as own Telegram channel',
      );
    }
    return parsed;
  }

  private async generateCampaignTitle(
    tx: any,
    workspaceId: string,
    placementDate: Date,
    promoIds: string[],
    advertisingSourceIds: string[],
  ) {
    const parsed = this.parseAdvertisingSourceSelection(advertisingSourceIds);
    const [promo, channels, people] = await Promise.all([
      promoIds.length
        ? tx.promo.findMany({
            where: { id: { in: promoIds }, workspaceId },
            select: { id: true, title: true },
          })
        : [],
      tx.telegramChannel.findMany({
        where: { workspaceId, id: { in: parsed.channelIds } },
        select: { title: true, sourceType: true },
      }),
      tx.advertisingSource.findMany({
        where: { workspaceId, id: { in: parsed.sourceIds } },
        select: { name: true, type: true },
      }),
    ]);

    const sources = [
      ...channels.map((channel: any) => ({
        title: channel.title,
        sourceKind: 'telegram_channel',
        sourceType: channel.sourceType,
      })),
      ...people.map((person: any) => ({
        title: person.name,
        sourceKind: 'person',
      })),
    ];
    const firstSource = sources?.[0];
    const sourceLabel = this.shortenBlock(
      firstSource?.title || firstSource?.name || 'source',
    );
    const promosById = new Map((promo || []).map((item: any) => [item.id, item]));
    const orderedPromos = promoIds
      .map((promoId) => promosById.get(promoId))
      .filter((promo): promo is { title?: string | null } => Boolean(promo));
    const promoLabel = this.formatPromoLabel(orderedPromos);
    const typeLabel = this.shortenBlock(this.sourceTypeLabel(firstSource));
    const dateLabel = this.formatDatePart(placementDate);
    return `${dateLabel} | ${sourceLabel} | ${promoLabel} | ${typeLabel}`;
  }

  private async ensureInviteLinksBelongToChannel(
    tx: any,
    workspaceId: string,
    inviteLinkIds: string[],
    telegramChannelId: string,
    currentCampaignId?: string,
  ) {
    if (!inviteLinkIds.length) return;
    const links = await tx.telegramInviteLink.findMany({
      where: { id: { in: inviteLinkIds }, workspaceId, telegramChannelId },
      select: { id: true, adCampaignId: true },
    });
    if (links.length !== inviteLinkIds.length) {
      throw new BadRequestException(
        'One or more invite links do not belong to selected Telegram channel',
      );
    }
    const conflictingLink = links.find(
      (link: any) => link.adCampaignId && link.adCampaignId !== currentCampaignId,
    );
    if (conflictingLink) {
      throw new BadRequestException(
        'One or more invite links are already linked to another campaign',
      );
    }
  }

  private async replaceCampaignInviteLinks(
    tx: any,
    workspaceId: string,
    campaignId: string,
    inviteLinkIds: string[],
  ) {
    await tx.telegramInviteLink.updateMany({
      where: {
        workspaceId,
        adCampaignId: campaignId,
        id: { notIn: inviteLinkIds.length ? inviteLinkIds : [''] },
      },
      data: { adCampaignId: null, lastSyncedAt: new Date() },
    });
    if (!inviteLinkIds.length) return;
    await tx.telegramInviteLink.updateMany({
      where: { workspaceId, id: { in: inviteLinkIds } },
      data: { adCampaignId: campaignId, lastSyncedAt: new Date() },
    });
  }

  private async replaceCampaignPromos(
    tx: any,
    campaignId: string,
    promoIds: string[],
  ) {
    if (!(await this.hasCampaignPromoStorage())) return;
    await (tx as any).adCampaignPromo.deleteMany({
      where: { adCampaignId: campaignId },
    });
    if (!promoIds.length) return;
    await (tx as any).adCampaignPromo.createMany({
      data: promoIds.map((promoId) => ({
        adCampaignId: campaignId,
        promoId,
      })),
      skipDuplicates: true,
    });
  }

  private async resolveRateToPrimary(
    tx: any,
    workspaceId: string,
    fromCurrency: string,
    primaryCurrency: string,
  ) {
    if (fromCurrency === primaryCurrency) return 1;

    const direct = await tx.exchangeRate.findFirst({
      where: {
        workspaceId,
        baseCurrency: fromCurrency,
        targetCurrency: primaryCurrency,
      },
      orderBy: { date: 'desc' },
    });
    if (direct?.rate) return Number(direct.rate);

    const inverse = await tx.exchangeRate.findFirst({
      where: {
        workspaceId,
        baseCurrency: primaryCurrency,
        targetCurrency: fromCurrency,
      },
      orderBy: { date: 'desc' },
    });
    if (inverse?.rate) return 1 / Number(inverse.rate);

    throw new BadRequestException(
      `No exchange rate from ${fromCurrency} to ${primaryCurrency}`,
    );
  }

  private async syncExpenseTransaction(
    tx: any,
    workspaceId: string,
    campaign: any,
    accountId?: string,
  ) {
    const account = await tx.account.findFirst({
      where: { id: accountId || campaign.accountId, workspaceId },
    });
    if (!account) return;

    const description = `Telegram ad campaign: ${campaign.title}`;
    const date = campaign.placementDate || campaign.startedAt || new Date();
    const existing = await tx.transaction.findFirst({
      where: { adCampaignId: campaign.id },
    });
    await this.financeCategoriesService.ensureSystemCategories(workspaceId, tx);
    const advertisingCategory = await tx.transactionCategory.findFirst({
      where: { workspaceId, type: 'expense', key: 'advertising' },
    });
    if (!advertisingCategory) return;

    const payload = {
      workspaceId,
      accountId: account.id,
      adCampaignId: campaign.id,
      type: 'expense' as const,
      category: advertisingCategory.name,
      categoryId: advertisingCategory.id,
      memberId: null,
      assignedMemberId: campaign.assignedMemberId,
      amount: campaign.price,
      currency: campaign.currency,
      exchangeRateToPrimary: campaign.exchangeRateToPrimary,
      amountInPrimaryCurrency: campaign.priceInPrimaryCurrency,
      date,
      description,
    };

    if (existing) {
      await tx.transaction.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      await tx.transaction.create({ data: payload });
    }
  }

  private async shapeCampaign(
    row: any,
    preloadedInviteLinkHistory?: ReturnType<
      AdCampaignsService["buildCampaignInviteLinkHistoryPayload"]
    > | null,
  ) {
    const analytics = await this.campaignMetrics(row);
    const linkedPromos = this.normalizeSelectionIds([
      row.promo?.id,
      ...(Array.isArray(row.promos) ? row.promos.map((item: any) => item?.promo?.id) : []),
    ]).map((promoId) => {
      if (row.promo?.id === promoId) return row.promo;
      return row.promos.find((item: any) => item.promo?.id === promoId)?.promo;
    }).filter(Boolean);
    const inviteLinks = Array.isArray(row.inviteLinks) ? row.inviteLinks : [];
    const telegramInviteLink =
      inviteLinks.find((link: any) => link.id === row.telegramInviteLinkId) ||
      inviteLinks[0] ||
      null;
    const normalizedLegacySources = await Promise.all(
      row.advertisingChannels.map(async (x: any) => {
        const source = x.advertisingSource;
        if (source?.type === 'telegram_channel') {
          const legacyChannel = await this.resolveLegacyTelegramChannelSource(
            this.prisma,
            row.workspaceId,
            source,
          );
          if (legacyChannel) return legacyChannel;
        }
        return this.normalizePersonSource(source);
      }),
    );
    const inviteLinkHistory = preloadedInviteLinkHistory ?? null;
    const inviteLinkHistoryById = new Map(
      (inviteLinkHistory?.inviteLinks ?? []).map((link) => [link.id, link]),
    );
    const enrichedInviteLinks = inviteLinks.map((link: any) => ({
      ...link,
      requestedCount: Number(link.requestedCount ?? 0),
      history: inviteLinkHistoryById.has(link.id)
        ? {
            inviteLink: link,
            points: inviteLinkHistoryById.get(link.id)?.points ?? [],
            summary: inviteLinkHistoryById.get(link.id)?.summary ?? null,
          }
        : null,
    }));
    return {
      ...row,
      telegramInviteLink,
      inviteLinks: enrichedInviteLinks,
      promos: linkedPromos,
      promo: linkedPromos[0] || row.promo || null,
      promoId: linkedPromos[0]?.id || row.promoId || null,
      promoIds: linkedPromos.map((promo: any) => promo.id),
      ownTelegramChannelId: row.telegramChannelId,
      promoInviteLinkId: telegramInviteLink?.id || row.telegramInviteLinkId,
      telegramInviteLinkId: telegramInviteLink?.id || row.telegramInviteLinkId,
      inviteLinkIds: inviteLinks.map((link: any) => link.id),
      costAmount: Number(row.price),
      advertisingChannels: this.dedupeAdvertisingSources([
        ...row.advertisingTelegramChannels.map((x: any) =>
          this.normalizeTelegramChannelSource(x.telegramChannel),
        ),
        ...normalizedLegacySources,
      ]),
      attributionType:
        row.advertisingTelegramChannels.length +
          row.advertisingChannels.length >
        1
          ? 'mixed'
          : 'clean',
      isMixedAttribution:
        row.advertisingTelegramChannels.length +
          row.advertisingChannels.length >
        1,
      inviteLinkHistory,
      analytics,
    };
  }

  private adCampaignInclude(withCampaignPromos: boolean) {
    return {
      telegramChannel: true,
      promo: { include: { icon: true, telegramChannel: true } },
      ...(withCampaignPromos
        ? {
            promos: {
              include: {
                promo: { include: { icon: true, telegramChannel: true } },
              },
            },
          }
        : {}),
      account: true,
      assignedMember: WorkspaceService.assignedMemberInclude,
      createdByUser: WorkspaceService.createdByUserInclude,
      inviteLinks: {
        select: {
          id: true,
          telegramChannelId: true,
          adCampaignId: true,
          name: true,
          url: true,
          joinedCount: true,
          requestedCount: true,
          isRevoked: true,
          lastSyncedAt: true,
          createdAt: true,
          updatedAt: true,
          creatorTelegramUserId: true,
          creatorUsername: true,
          creatorFirstName: true,
          creatorLastName: true,
          creatorPhotoUrl: true,
          creatorMatchSource: true,
          creatorMember: WorkspaceService.assignedMemberInclude,
        },
      },
      advertisingTelegramChannels: {
        include: {
          telegramChannel: {
            include: { adminLinks: true },
          },
        },
      },
      advertisingChannels: { include: { advertisingSource: true } },
      hypothesisLinks: {
        include: {
          hypothesis: {
            select: { id: true, name: true, status: true },
          },
        },
      },
    };
  }

  async findAll(userId: string, query: AdCampaignQueryDto = {}) {
    const workspaceId = await this.workspace(userId);
    const where = {
      workspaceId,
      telegramChannelId: query.telegramChannelId || undefined,
      assignedMemberId: query.assignedMemberId || undefined,
    };
    const pagination = normalizePagination(query);
    const loadRows = async (withCampaignPromos: boolean) => {
      const [items, totalItems] = await Promise.all([
        (this.prisma.adCampaign as any).findMany({
          where,
          include: this.adCampaignInclude(withCampaignPromos),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: pagination.skip,
          take: pagination.take,
        }),
        this.prisma.adCampaign.count({ where }),
      ]);
      return { items, totalItems };
    };
    let rows;
    try {
      rows = await loadRows(await this.hasCampaignPromoStorage());
    } catch (error) {
      if (!this.isCampaignPromoTableMissing(error)) throw error;
      this.campaignPromoStorageState = 'missing';
      rows = await loadRows(false);
    }
    const preloadedInviteLinkHistories = await this.preloadCampaignInviteLinkHistories(
      workspaceId,
      rows.items,
    );
    const items = await Promise.all(
      rows.items.map((row) =>
        this.shapeCampaign(row, preloadedInviteLinkHistories.get(row.id) ?? null),
      ),
    );
    return createPaginatedResponse(items, rows.totalItems, pagination);
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    let row;
    try {
      row = await (this.prisma.adCampaign as any).findFirst({
        where: { id, workspaceId },
        include: this.adCampaignInclude(await this.hasCampaignPromoStorage()),
      });
    } catch (error) {
      if (!this.isCampaignPromoTableMissing(error)) throw error;
      this.campaignPromoStorageState = 'missing';
      row = await (this.prisma.adCampaign as any).findFirst({
        where: { id, workspaceId },
        include: this.adCampaignInclude(false),
      });
    }
    if (!row) throw new NotFoundException('Campaign not found');
    return this.shapeCampaign(
      row,
      this.buildCampaignInviteLinkHistoryPayload(
        {
          id: row.id,
          title: row.title,
          inviteLinks: Array.isArray(row.inviteLinks)
            ? row.inviteLinks.map((link: any) => ({
                ...link,
                requestedCount: Number(link.requestedCount ?? 0),
              }))
            : [],
        },
        [],
      ),
    );
  }

  async inviteLinkHistory(userId: string, id: string, limit = 120) {
    const workspaceId = await this.workspace(userId);
    const campaign = await this.prisma.adCampaign.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        title: true,
        inviteLinks: {
          select: {
            id: true,
            name: true,
            url: true,
            joinedCount: true,
            requestedCount: true,
            isRevoked: true,
            lastSyncedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    let rows: Array<{
      inviteLinkId: string;
      syncedAt: Date;
      joinedCount: number;
      requestedCount: number;
      isRevoked: boolean | null;
    }> = [];
    if (this.inviteLinkSnapshotStorageState !== 'missing') {
      try {
        rows = await this.prisma.telegramInviteLinkSnapshot.findMany({
          where: { workspaceId, adCampaignId: id },
          orderBy: [{ syncedAt: 'desc' }, { inviteLinkId: 'asc' }],
          take: Math.max(
            2,
            Math.min(2000, limit * Math.max(1, campaign.inviteLinks.length || 1)),
          ),
          select: {
            inviteLinkId: true,
            syncedAt: true,
            joinedCount: true,
            requestedCount: true,
            isRevoked: true,
          },
        });
        this.inviteLinkSnapshotStorageState = 'available';
      } catch (error) {
        if (!this.isInviteLinkSnapshotStorageMissing(error)) throw error;
        this.inviteLinkSnapshotStorageState = 'missing';
      }
    }

    return this.buildCampaignInviteLinkHistoryPayload(
      {
        id: campaign.id,
        title: campaign.title,
        inviteLinks: campaign.inviteLinks.map((link) => ({
          ...link,
          requestedCount: Number(link.requestedCount ?? 0),
        })),
      },
      [...rows].reverse(),
      limit,
    );
  }

  async create(userId: string, dto: CreateAdCampaignDto) {
    const promoIds = this.selectedPromoIds(dto);
    const inviteLinkIds = this.selectedInviteLinkIds(dto);
    const { workspaceId, assignedMemberId } = await this.workspaceService.resolveAssignedMemberId(userId, dto.assignedMemberId);
    await this.ensurePromosBelongToChannel(
      workspaceId,
      promoIds,
      dto.telegramChannelId,
    );

    const campaign = await this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.findUnique({
        where: { id: workspaceId },
      });
      if (!workspace) throw new NotFoundException('Workspace not found');
      const account = await tx.account.findFirst({
        where: { id: dto.accountId, workspaceId },
      });
      if (!account) throw new NotFoundException('Account not found');

      await this.ensureInviteLinksBelongToChannel(
        tx,
        workspaceId,
        inviteLinkIds,
        dto.telegramChannelId,
      );
      const exchangeRateToPrimary = await this.resolveRateToPrimary(
        tx,
        workspaceId,
        account.currency,
        workspace.primaryCurrency,
      );
      const placementDate = dto.date ? new Date(dto.date) : new Date();
      const advertisingSources = await this.ensureAdvertisingSources(
        tx,
        workspaceId,
        dto.telegramChannelId,
        dto.advertisingChannelIds || [],
      );
      const rawAdvertisingSourceIds = dto.advertisingChannelIds || [];
      const generatedTitle = await this.generateCampaignTitle(
        tx,
        workspaceId,
        placementDate,
        promoIds,
        rawAdvertisingSourceIds,
      );
      const row = await (tx.adCampaign as any).create({
        data: {
          workspaceId,
          telegramChannelId: dto.telegramChannelId,
          promoId: promoIds[0] || null,
          telegramInviteLinkId: inviteLinkIds[0] || null,
          title: generatedTitle,
          status: 'planned',
          price: dto.price,
          currency: account.currency,
          exchangeRateToPrimary,
          priceInPrimaryCurrency: dto.price * exchangeRateToPrimary,
          accountId: account.id,
          placementDate,
          notes: dto.notes,
          assignedMemberId,
          createdByUserId: userId,
          ...this.analyticsInputData(dto),
        },
      });

      await this.replaceCampaignPromos(tx, row.id, promoIds);
      await this.replaceCampaignInviteLinks(tx, workspaceId, row.id, inviteLinkIds);

      if (advertisingSources.channelIds.length) {
        await (tx as any).adCampaignTelegramChannelPlacement.createMany({
          data: advertisingSources.channelIds.map((id) => ({
            adCampaignId: row.id,
            telegramChannelId: id,
          })),
          skipDuplicates: true,
        });
      }
      if (advertisingSources.sourceIds.length) {
        await (tx as any).adCampaignAdvertisingChannel.createMany({
          data: advertisingSources.sourceIds.map((id) => ({
            adCampaignId: row.id,
            advertisingSourceId: id,
          })),
          skipDuplicates: true,
        });
      }

      await this.syncExpenseTransaction(tx, workspaceId, row, dto.accountId);
      return row;
    });

    await this.campaignAnalyticsService.recalculateCampaignAnalytics(
      workspaceId,
      campaign.id,
    );
    return this.findOne(userId, campaign.id);
  }

  async update(userId: string, id: string, dto: UpdateAdCampaignDto) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.adCampaign.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Campaign not found');
    const assignedMemberId = dto.assignedMemberId === undefined ? undefined : (
      await this.workspaceService.resolveAssignedMemberId(userId, dto.assignedMemberId)
    ).assignedMemberId;

    const hasPromoSelection = dto.promoIds !== undefined || dto.promoId !== undefined;
    const hasInviteLinkSelection =
      dto.inviteLinkIds !== undefined || dto.telegramInviteLinkId !== undefined;
    const existingPromoLinks = await this.hasCampaignPromoStorage()
      ? await (this.prisma as any).adCampaignPromo.findMany({
          where: { adCampaignId: id },
          select: { promoId: true },
        })
      : [];
    const existingPromoIds = this.normalizeSelectionIds([
      existing.promoId,
      ...existingPromoLinks.map((item: any) => item.promoId),
    ]);
    const existingInviteLinkIds = this.normalizeSelectionIds(
      (
        await this.prisma.telegramInviteLink.findMany({
          where: { workspaceId, adCampaignId: id },
          select: { id: true },
        })
      ).map((link) => link.id).concat(existing.telegramInviteLinkId || []),
    );
    const nextPromoIds = hasPromoSelection
      ? this.selectedPromoIds(dto)
      : existingPromoIds;
    const nextInviteLinkIds = hasInviteLinkSelection
      ? this.selectedInviteLinkIds(dto)
      : existingInviteLinkIds;
    const nextOwnTelegramChannelId =
      dto.telegramChannelId ?? existing.telegramChannelId;

    if (nextPromoIds.length) {
      await this.ensurePromosBelongToChannel(
        workspaceId,
        nextPromoIds,
        nextOwnTelegramChannelId,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const price = dto.price ?? Number(existing.price);
      const accountId = dto.accountId ?? existing.accountId;
      const account = accountId
        ? await tx.account.findFirst({ where: { id: accountId, workspaceId } })
        : null;
      if (!account) throw new NotFoundException('Account not found');
      const workspace = await tx.workspace.findUnique({
        where: { id: workspaceId },
      });
      if (!workspace) throw new NotFoundException('Workspace not found');
      const exchangeRateToPrimary = await this.resolveRateToPrimary(
        tx,
        workspaceId,
        account.currency,
        workspace.primaryCurrency,
      );
      const nextPlacementDate = dto.date
        ? new Date(dto.date)
        : existing.placementDate || new Date();
      await this.ensureInviteLinksBelongToChannel(
        tx,
        workspaceId,
        nextInviteLinkIds,
        nextOwnTelegramChannelId,
        id,
      );
      const rawNextAdvertisingChannelIds = dto.advertisingChannelIds ?? [
        ...(
          await (tx as any).adCampaignTelegramChannelPlacement.findMany({
            where: { adCampaignId: id },
            select: { telegramChannelId: true },
          })
        ).map((x: any) => `channel:${x.telegramChannelId}`),
        ...(
          await (tx as any).adCampaignAdvertisingChannel.findMany({
            where: { adCampaignId: id },
            select: { advertisingSourceId: true },
          })
        ).map((x: any) => `source:${x.advertisingSourceId}`),
      ];
      const nextAdvertisingSources = await this.ensureAdvertisingSources(
        tx,
        workspaceId,
        nextOwnTelegramChannelId,
        rawNextAdvertisingChannelIds,
      );
      const generatedTitle = await this.generateCampaignTitle(
        tx,
        workspaceId,
        nextPlacementDate,
        nextPromoIds,
        [
          ...nextAdvertisingSources.channelIds.map(
            (sourceId) => `channel:${sourceId}`,
          ),
          ...nextAdvertisingSources.sourceIds.map(
            (sourceId) => `source:${sourceId}`,
          ),
        ],
      );

      const row = await (tx.adCampaign as any).update({
        where: { id },
        data: {
          title: generatedTitle,
          telegramChannelId: dto.telegramChannelId,
          promoId: nextPromoIds[0] || null,
          telegramInviteLinkId: nextInviteLinkIds[0] || null,
          price,
          currency: account.currency,
          exchangeRateToPrimary,
          priceInPrimaryCurrency: price * exchangeRateToPrimary,
          accountId: account.id,
          placementDate: dto.date ? new Date(dto.date) : undefined,
          notes: dto.notes,
          assignedMemberId,
          ...this.analyticsInputData(dto),
        },
      });

      if (hasPromoSelection) {
        await this.replaceCampaignPromos(tx, id, nextPromoIds);
      }

      if (hasInviteLinkSelection) {
        await this.replaceCampaignInviteLinks(
          tx,
          workspaceId,
          id,
          nextInviteLinkIds,
        );
      }

      if (dto.advertisingChannelIds) {
        await (tx as any).adCampaignTelegramChannelPlacement.deleteMany({
          where: { adCampaignId: id },
        });
        await (tx as any).adCampaignAdvertisingChannel.deleteMany({
          where: { adCampaignId: id },
        });
        await (tx as any).adCampaignTelegramChannelPlacement.createMany({
          data: nextAdvertisingSources.channelIds.map((sourceId) => ({
            adCampaignId: id,
            telegramChannelId: sourceId,
          })),
          skipDuplicates: true,
        });
        await (tx as any).adCampaignAdvertisingChannel.createMany({
          data: nextAdvertisingSources.sourceIds.map((sourceId) => ({
            adCampaignId: id,
            advertisingSourceId: sourceId,
          })),
          skipDuplicates: true,
        });
      }

      await this.syncExpenseTransaction(tx, workspaceId, row, dto.accountId);
    });

    await this.campaignAnalyticsService.recalculateCampaignAnalytics(
      workspaceId,
      id,
    );
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.adCampaign.update({
      where: { id },
      data: { status: 'archived' },
    });
  }

  private async campaignMetrics(campaign: any) {
    const inviteLinks = Array.isArray(campaign.inviteLinks)
      ? campaign.inviteLinks
      : campaign.id
        ? await this.prisma.telegramInviteLink.findMany({
            where: {
              workspaceId: campaign.workspaceId,
              adCampaignId: campaign.id,
            },
            select: { joinedCount: true, requestedCount: true },
          })
        : [];
    const linkedJoinedCount = sumInviteLinkJoinedSubscribers(inviteLinks);
    const linkedRequestedCount =
      sumInviteLinkAttributedSubscribers(inviteLinks) - linkedJoinedCount;
    const joinedCount =
      linkedJoinedCount > 0 ? linkedJoinedCount : Number(campaign.joinedCount ?? 0);
    const requestedCount =
      linkedJoinedCount > 0
        ? linkedRequestedCount
        : Number(campaign.requestedCount ?? 0);
    const attributedCount = joinedCount + requestedCount;
    const costAmount = Number(campaign.price || 0);

    return {
      joinedCount,
      requestedCount,
      attributedCount,
      leftCount: null,
      netGrowth: null,
      costAmount,
      currency: campaign.currency,
      costPerJoinedSubscriber:
        attributedCount > 0 ? costAmount / attributedCount : null,
      costPerNetSubscriber: null,
      attributionSource: 'mtproto_invite_link_usage',
    };
  }

  async analytics(userId: string, id: string) {
    const campaign = await this.findOne(userId, id);
    return {
      campaignId: campaign.id,
      promoInviteLinkId: campaign.telegramInviteLinkId,
      ownTelegramChannel: campaign.telegramChannel,
      advertisingChannels: campaign.advertisingChannels,
      isMixedAttribution: campaign.isMixedAttribution,
      ...campaign.analytics,
    };
  }

  async updateAnalyticsInput(
    userId: string,
    id: string,
    dto: AdCampaignAnalyticsInputDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.adCampaign.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Campaign not found');
    await (this.prisma.adCampaign as any).update({
      where: { id },
      data: this.analyticsInputData(dto),
    });
    await this.campaignAnalyticsService.recalculateCampaignAnalytics(
      workspaceId,
      id,
    );
    return this.findOne(userId, id);
  }

  async recalculateAnalytics(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    await this.campaignAnalyticsService.recalculateCampaignAnalytics(
      workspaceId,
      id,
    );
    return this.findOne(userId, id);
  }

  async analyticsSummary(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const campaign: any = await this.prisma.adCampaign.findFirst({
      where: { id, workspaceId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return this.campaignAnalyticsService.summary(campaign);
  }

  async performanceSummary(userId: string, query: any = {}) {
    const workspaceId = await this.workspace(userId);
    const where: any = {
      workspaceId,
      excludeFromAnalytics: false,
      telegramChannelId: query.channelId || undefined,
      placementDate: {
        gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
        lte: query.dateTo ? new Date(query.dateTo) : undefined,
      },
    };
    if (!query.dateFrom && !query.dateTo) delete where.placementDate;
    if (query.hypothesisId) {
      where.hypothesisLinks = { some: { hypothesisId: query.hypothesisId } };
    }
    const [campaigns, lastDailyAnalyticsSync] = await Promise.all([
      (this.prisma.adCampaign as any).findMany({
        where,
        include: { telegramChannel: true },
        orderBy: { createdAt: 'desc' },
      }),
      (this.prisma as any).dailyAnalyticsSyncRun.findFirst({
        where: { OR: [{ workspaceId }, { workspaceId: null }] },
        orderBy: { startedAt: 'desc' },
      }),
    ]);
    const totalSpend = campaigns.reduce(
      (sum, campaign) => sum + Number(campaign.priceInPrimaryCurrency || 0),
      0,
    );
    const totalNewSubscribers = campaigns.reduce(
      (sum, campaign) => sum + Number(campaign.newSubscribers || 0),
      0,
    );
    const totalActiveSubscribersFromAd = campaigns.reduce(
      (sum, campaign) => sum + Number(campaign.activeSubscribersFromAd || 0),
      0,
    );
    const avg = (values: Array<number | null>) => {
      const clean = values.filter((value): value is number => value != null);
      return clean.length
        ? clean.reduce((sum, value) => sum + value, 0) / clean.length
        : null;
    };
    const statusCounts = campaigns.reduce(
      (acc, campaign) => {
        const status = campaign.overallStatus || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      { good: 0, acceptable: 0, bad: 0, unknown: 0 } as Record<string, number>,
    );
    const dataQualityCounts = campaigns.reduce(
      (acc, campaign) => {
        const quality = String(campaign.adDataQuality || 'normal');
        if (quality === 'anomalous') acc.anomalousCount += 1;
        else if (quality === 'suspicious') acc.suspiciousCount += 1;
        else if (quality === 'normal' || quality === 'borderline') acc.normalDataCount += 1;
        if (campaign.hasSubscriberBasePollution) acc.pollutedCount += 1;
        return acc;
      },
      {
        anomalousCount: 0,
        suspiciousCount: 0,
        pollutedCount: 0,
        normalDataCount: 0,
      },
    );
    const metric = (campaign: any) =>
      Number(campaign.cappedActiveCpa ?? campaign.activeCpa ?? campaign.cpa ?? Number.POSITIVE_INFINITY);
    const ranked = campaigns.filter((campaign) => Number.isFinite(metric(campaign)));
    const bestRanked = ranked.filter(
      (campaign) =>
        campaign.adDataQuality !== 'anomalous' &&
        !campaign.excludeFromAnalytics,
    );
    return {
      campaignsCount: campaigns.length,
      totalSpend,
      totalNewSubscribers,
      totalActiveSubscribersFromAd,
      avgCpa:
        totalNewSubscribers > 0 ? totalSpend / totalNewSubscribers : null,
      avgActiveCpa:
        totalActiveSubscribersFromAd > 0
          ? totalSpend / totalActiveSubscribersFromAd
          : null,
      avgActiveRate: avg(campaigns.map((campaign) => campaign.activeRate)),
      avgRetention7d: avg(campaigns.map((campaign) => campaign.retention7d)),
      ...dataQualityCounts,
      goodCount: statusCounts.good || 0,
      acceptableCount: statusCounts.acceptable || 0,
      badCount: statusCounts.bad || 0,
      unknownCount: statusCounts.unknown || 0,
      bestCampaigns: [...bestRanked].sort((a, b) => metric(a) - metric(b)).slice(0, 5),
      worstCampaigns: [...ranked].sort((a, b) => metric(b) - metric(a)).slice(0, 5),
      lastDailyAnalyticsSync,
    };
  }
}
