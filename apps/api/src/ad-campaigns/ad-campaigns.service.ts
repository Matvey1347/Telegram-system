import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { FinanceCategoriesService } from '../finance-categories/finance-categories.service';
import {
  AdCampaignQueryDto,
  CreateAdCampaignDto,
  UpdateAdCampaignDto,
} from './dto';

@Injectable()
export class AdCampaignsService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private financeCategoriesService: FinanceCategoriesService,
  ) {}

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

  private async ensureAdvertisingSources(
    tx: any,
    workspaceId: string,
    ownTelegramChannelId: string,
    advertisingSourceIds: string[],
  ) {
    const parsed = this.parseAdvertisingSourceSelection(advertisingSourceIds);
    if (parsed.channelIds.includes(ownTelegramChannelId)) {
      throw new BadRequestException(
        'Advertising channel cannot be the same as own Telegram channel',
      );
    }
    const [channels, people] = await Promise.all([
      parsed.channelIds.length
        ? tx.telegramChannel.findMany({
            where: { workspaceId, id: { in: parsed.channelIds } },
            select: { id: true },
          })
        : [],
      parsed.sourceIds.length
        ? tx.advertisingSource.findMany({
            where: {
              workspaceId,
              id: { in: parsed.sourceIds },
              type: { not: 'telegram_channel' },
            },
            select: { id: true },
          })
        : [],
    ]);
    if (channels.length !== parsed.channelIds.length) {
      throw new BadRequestException(
        'One or more advertising channels are invalid',
      );
    }
    if (people.length !== parsed.sourceIds.length) {
      throw new BadRequestException(
        'One or more advertising people are invalid',
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
    return {
      ...row,
      telegramInviteLink,
      ownTelegramChannelId: row.telegramChannelId,
      promoInviteLinkId: row.telegramInviteLinkId,
      costAmount: Number(row.price),
      advertisingChannels: [
        ...row.advertisingTelegramChannels.map((x: any) =>
          this.normalizeTelegramChannelSource(x.telegramChannel),
        ),
        ...row.advertisingChannels.map((x: any) =>
          this.normalizePersonSource(x.advertisingSource),
        ),
      ],
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
      },
      include: {
        telegramChannel: true,
        promo: true,
        account: true,
        advertisingTelegramChannels: {
          include: {
            telegramChannel: {
              include: { adminLinks: true },
            },
          },
        },
        advertisingChannels: { include: { advertisingSource: true } },
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
        advertisingTelegramChannels: {
          include: {
            telegramChannel: {
              include: { adminLinks: true },
            },
          },
        },
        advertisingChannels: { include: { advertisingSource: true } },
      },
    });
    if (!row) throw new NotFoundException('Campaign not found');
    return this.shapeCampaign(row);
  }

  async create(userId: string, dto: CreateAdCampaignDto) {
    const workspaceId = await this.workspace(userId);
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

    return this.findOne(userId, campaign.id);
  }

  async update(userId: string, id: string, dto: UpdateAdCampaignDto) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.adCampaign.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Campaign not found');

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
    const joinedCount = Number(inviteLink?.joinedCount ?? 0);
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
}
