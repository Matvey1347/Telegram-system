import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

    if (resolvedLegacyChannels.some((channel) => !channel?.id)) {
      throw new BadRequestException(
        'One or more advertising channels are invalid',
      );
    }

    return {
      channelIds: [
        ...new Set([
          ...parsed.channelIds,
          ...resolvedLegacyChannels.map((channel: any) => channel.id),
        ]),
      ],
      sourceIds: [...new Set(people.map((source: any) => source.id))],
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
    promoId: string | null | undefined,
    advertisingSourceIds: string[],
  ) {
    const parsed = this.parseAdvertisingSourceSelection(advertisingSourceIds);
    const [promo, channels, people] = await Promise.all([
      promoId
        ? tx.promo.findFirst({
            where: { id: promoId, workspaceId },
            select: { title: true },
          })
        : null,
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
    const promoLabel = this.shortenBlock(promo?.title || 'promo');
    const typeLabel = this.shortenBlock(this.sourceTypeLabel(firstSource));
    const dateLabel = this.formatDatePart(placementDate);
    return `${dateLabel} | ${sourceLabel} | ${promoLabel} | ${typeLabel}`;
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

  private async shapeCampaign(row: any) {
    const analytics = await this.campaignMetrics(row);
    const telegramInviteLink = row.telegramInviteLinkId
      ? await this.prisma.telegramInviteLink.findFirst({
          where: {
            id: row.telegramInviteLinkId,
            workspaceId: row.workspaceId,
          },
          select: { id: true, name: true, url: true },
        })
      : null;
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
    return {
      ...row,
      telegramInviteLink,
      ownTelegramChannelId: row.telegramChannelId,
      promoInviteLinkId: row.telegramInviteLinkId,
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
      analytics,
    };
  }

  async findAll(userId: string, query: AdCampaignQueryDto = {}) {
    const workspaceId = await this.workspace(userId);
    const rows = await (this.prisma.adCampaign as any).findMany({
      where: {
        workspaceId,
        telegramChannelId: query.telegramChannelId || undefined,
        assignedMemberId: query.assignedMemberId || undefined,
      },
      include: {
        telegramChannel: true,
        promo: true,
        account: true,
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
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
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((row) => this.shapeCampaign(row)));
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const row = await (this.prisma.adCampaign as any).findFirst({
      where: { id, workspaceId },
      include: {
        telegramChannel: true,
        promo: true,
        account: true,
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
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
      },
    });
    if (!row) throw new NotFoundException('Campaign not found');
    return this.shapeCampaign(row);
  }

  async create(userId: string, dto: CreateAdCampaignDto) {
    const { workspaceId, assignedMemberId } = await this.workspaceService.resolveAssignedMemberId(userId, dto.assignedMemberId);
    await this.ensurePromoBelongsToChannel(
      workspaceId,
      dto.promoId,
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
        dto.promoId,
        rawAdvertisingSourceIds,
      );
      const row = await (tx.adCampaign as any).create({
        data: {
          workspaceId,
          telegramChannelId: dto.telegramChannelId,
          promoId: dto.promoId,
          telegramInviteLinkId: dto.telegramInviteLinkId,
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

    if (dto.telegramChannelId && dto.promoId) {
      await this.ensurePromoBelongsToChannel(
        workspaceId,
        dto.promoId,
        dto.telegramChannelId,
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
      const nextPromoId = dto.promoId ?? existing.promoId;
      const nextOwnTelegramChannelId =
        dto.telegramChannelId ?? existing.telegramChannelId;
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
        nextPromoId,
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
          promoId: dto.promoId,
          telegramInviteLinkId: dto.telegramInviteLinkId,
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
    const inviteLink = campaign.telegramInviteLinkId
      ? await this.prisma.telegramInviteLink.findFirst({
          where: {
            id: campaign.telegramInviteLinkId,
            workspaceId: campaign.workspaceId,
          },
          select: { joinedCount: true },
        })
      : null;
    const joinedCount = Number(inviteLink?.joinedCount ?? campaign.joinedCount ?? 0);
    const costAmount = Number(campaign.price || 0);

    return {
      joinedCount,
      leftCount: null,
      netGrowth: null,
      costAmount,
      currency: campaign.currency,
      costPerJoinedSubscriber:
        joinedCount > 0 ? costAmount / joinedCount : null,
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
