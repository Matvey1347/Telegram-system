import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TelegramAdCrmDealStage,
  TelegramAdPlacementStatus,
  TelegramAdPricingMode,
  TelegramAdSaleStatus,
  TelegramAdvertiserActivityType,
  TelegramAdvertiserContactType,
  TelegramAdvertiserLifecycleStage,
  TelegramAdvertiserStatus,
} from '@prisma/client';
import type {
  TelegramAdSalesBulkCreateResponse,
  TelegramAdSalesBulkRowResult,
} from '@telegram-system/shared';
import { ApplicationLoggerService } from '../application-logs/application-logger.service';
import { ResponseCacheService } from '../common/response-cache.service';
import { WorkspaceService } from '../common/workspace.service';
import { PrismaService } from '../prisma/prisma.service';
import { decimal, decimalOrNull } from './domain/decimal';
import { utcDateKey, zonedDateTimeToUtc } from './domain/timezone';
import { TelegramAdSalesBulkCreateDto } from './dto';
import {
  telegramAdSalesAdvisoryLockKey,
} from './telegram-ad-sales-reservation';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

type ResolvedChannel = {
  id: string;
  adBaseCurrency?: string | null;
};

type ResolvedAdvertiser = {
  advertiserId: string | null;
  advertiserName: string;
  advertiserTelegram: string | null;
  advertiserContact: string | null;
  advertiserCompanyName: string | null;
  createAdvertiser: boolean;
};

type ExpandedPlacement = {
  clientRowIds: string[];
  date: string;
  channelId: string;
  networkId: string | null;
  scheduledAt: Date;
  telegramPostId: string | null;
  productId: string | null;
  pricingMode: TelegramAdPricingMode;
  expectedViews: number;
  recommendedPrice: Prisma.Decimal;
  minimumPrice: Prisma.Decimal;
  agreedPrice: Prisma.Decimal;
  currency: string;
  manualPriceReason: string | null;
  advertiser: ResolvedAdvertiser;
};

type BulkProduct = Prisma.TelegramAdProductGetPayload<{}>;
type BulkTelegramPost = {
  id: string;
  telegramChannelId: string;
  postDate: Date;
};

@Injectable()
export class TelegramAdSalesBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly logger: ApplicationLoggerService,
    private readonly responseCache: ResponseCacheService,
    private readonly salesService: TelegramAdSalesService,
  ) {}

  async create(userId: string, dto: TelegramAdSalesBulkCreateDto): Promise<TelegramAdSalesBulkCreateResponse> {
    if (!dto.rows.length) {
      throw new BadRequestException('At least one bulk row is required');
    }
    const { workspaceId, assignedMemberId } = await this.workspaceService.resolveAssignedMemberId(
      userId,
      dto.defaults.assignedMemberId,
    );
    const channels = await this.resolveTargetChannels(workspaceId, dto);
    const expanded = await this.expandPlacements(workspaceId, channels, dto);
    if (expanded.length > 500) {
      throw new BadRequestException('Bulk operation can create at most 500 placements');
    }
    this.assertBulkPriceRules(expanded);

    const saleIds = new Set<string>();
    const rowResults = new Map<string, TelegramAdSalesBulkRowResult>();
    await this.prisma.$transaction(async (tx) => {
      const advertiserIdsByKey = await this.resolveAdvertisers(tx, workspaceId, userId, assignedMemberId, expanded);
      for (const [advertiserKey, placements] of this.groupByAdvertiser(expanded)) {
        const advertiser = placements[0].advertiser;
        const linkedAdvertiserId = advertiserIdsByKey.get(advertiserKey) ?? advertiser.advertiserId;
        const sale = await tx.telegramAdSale.create({
          data: {
            workspaceId,
            advertiserId: linkedAdvertiserId,
            advertiserName: advertiser.advertiserName,
            advertiserTelegram: advertiser.advertiserTelegram,
            advertiserContact: advertiser.advertiserContact,
            advertiserNameSnapshot: advertiser.advertiserName,
            advertiserTelegramSnapshot: advertiser.advertiserTelegram,
            advertiserCompanySnapshot: advertiser.advertiserCompanyName,
            status: TelegramAdSaleStatus.RESERVED,
            crmDealStage: TelegramAdCrmDealStage.SLOT_RESERVED,
            settlementCurrency: dto.defaults.settlementCurrency,
            createdByUserId: userId,
            assignedMemberId,
          },
        });
        saleIds.add(sale.id);
        if (linkedAdvertiserId) {
          await tx.telegramAdvertiserActivity.create({
            data: {
              workspaceId,
              advertiserId: linkedAdvertiserId,
              saleId: sale.id,
              actorUserId: userId,
              type: TelegramAdvertiserActivityType.SALE_CREATED,
              title: sale.advertiserName,
              metadata: Prisma.JsonNull,
              occurredAt: new Date(),
            },
          });
        }

        for (const placement of placements) {
          const created = await tx.telegramAdSalePlacement.create({
            data: {
              workspaceId,
              telegramAdSaleId: sale.id,
              telegramChannelId: placement.channelId,
              telegramChannelNetworkId: placement.networkId,
              telegramAdProductId: placement.productId,
              status: TelegramAdPlacementStatus.DRAFT,
              scheduledAt: placement.scheduledAt,
              timezone: dto.defaults.timezone,
              pricingMode: placement.pricingMode,
              expectedViews: placement.expectedViews,
              recommendedPrice: placement.recommendedPrice,
              minimumPrice: placement.minimumPrice,
              agreedPrice: placement.agreedPrice,
              currency: placement.currency,
              manualPriceReason: placement.manualPriceReason,
              telegramPostId: placement.telegramPostId,
              publishedAt: placement.telegramPostId ? placement.scheduledAt : null,
            },
          });
          const lockKey = telegramAdSalesAdvisoryLockKey(
            placement.channelId,
            utcDateKey(placement.scheduledAt, dto.defaults.timezone),
          );
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
          await tx.telegramAdSalePlacement.update({
            where: { id: created.id },
            data: {
              status: placement.telegramPostId
                ? TelegramAdPlacementStatus.PUBLISHED
                : TelegramAdPlacementStatus.RESERVED,
            },
          });
          for (const clientRowId of placement.clientRowIds) {
            const current = rowResults.get(clientRowId) ?? {
              clientRowId,
              date: placement.date,
              saleId: sale.id,
              placementIds: [],
            };
            current.placementIds.push(created.id);
            rowResults.set(clientRowId, current);
          }
        }
      }
    });

    this.responseCache.clearByPrefix(`telegram-ad-sales:availability:${workspaceId}:`);
    const sales = await Promise.all([...saleIds].map((saleId) => this.salesService.getSale(userId, saleId)));
    return {
      sales,
      rows: [...rowResults.values()].sort((left, right) => left.date.localeCompare(right.date)),
      createdSaleCount: sales.length,
      createdPlacementCount: [...rowResults.values()].reduce((sum, row) => sum + row.placementIds.length, 0),
      channelIds: channels.map((channel) => channel.id),
    };
  }

  private async resolveTargetChannels(
    workspaceId: string,
    dto: TelegramAdSalesBulkCreateDto,
  ): Promise<ResolvedChannel[]> {
    if (dto.target.type === 'CHANNEL') {
      const channel = await this.prisma.telegramChannel.findFirst({
        where: { id: dto.target.channelId, workspaceId },
        select: { id: true, adBaseCurrency: true },
      });
      if (!channel) throw new NotFoundException('Telegram channel not found');
      return [channel];
    }
    const network = await this.prisma.telegramChannelNetwork.findFirst({
      where: { id: dto.target.networkId, workspaceId },
      include: { channels: { include: { telegramChannel: { select: { id: true, adBaseCurrency: true } } } } },
    });
    if (!network) throw new NotFoundException('Telegram channel network not found');
    const channels = network.channels.map((member) => member.telegramChannel);
    if (!channels.length) throw new BadRequestException('Selected network has no channels');
    return channels;
  }

  private async expandPlacements(
    workspaceId: string,
    channels: ResolvedChannel[],
    dto: TelegramAdSalesBulkCreateDto,
  ): Promise<ExpandedPlacement[]> {
    const sortedRows = dto.rows
      .map((row, index) => ({ ...row, clientRowIds: [row.clientRowId], sortIndex: index }))
      .sort((left, right) => left.date.localeCompare(right.date) || left.sortIndex - right.sortIndex);
    const productIds = new Set<string>();
    const postIds = new Set<string>();
    for (const row of sortedRows) {
      if (dto.defaults.productId) productIds.add(dto.defaults.productId);
      for (const override of row.channelOverrides ?? []) {
        if (override.productId) productIds.add(override.productId);
        if (override.telegramPostId) postIds.add(override.telegramPostId);
      }
    }
    const [products, posts]: [BulkProduct[], BulkTelegramPost[]] = await Promise.all([
      productIds.size
        ? this.prisma.telegramAdProduct.findMany({
            where: { id: { in: [...productIds] }, workspaceId, isActive: true },
          })
        : Promise.resolve([] as BulkProduct[]),
      postIds.size
        ? this.prisma.telegramPost.findMany({
            where: { id: { in: [...postIds] }, workspaceId },
            select: { id: true, telegramChannelId: true, postDate: true },
          })
        : Promise.resolve([] as BulkTelegramPost[]),
    ]);
    const productById = new Map<string, BulkProduct>(
      products.map((product) => [product.id, product]),
    );
    const postById = new Map<string, BulkTelegramPost>(
      posts.map((post) => [post.id, post]),
    );
    const channelIds = new Set(channels.map((channel) => channel.id));

    return sortedRows.flatMap((row) => {
      const overrides = new Map((row.channelOverrides ?? []).map((override) => [override.channelId, override]));
      for (const channelId of overrides.keys()) {
        if (!channelIds.has(channelId)) {
          throw new BadRequestException('Channel override is outside selected target');
        }
      }
      const rowAdvertiser = this.resolveRowAdvertiser(dto, row);
      return channels.map((channel) => {
        const override = overrides.get(channel.id);
        const productId = override?.productId ?? dto.defaults.productId ?? null;
        const product = productId ? productById.get(productId) : null;
        if (productId && (!product || product.telegramChannelId !== channel.id)) {
          throw new BadRequestException('Telegram ad product does not belong to target channel');
        }
        const telegramPostId = override?.telegramPostId ?? null;
        const telegramPost = telegramPostId ? postById.get(telegramPostId) : null;
        if (telegramPostId && (!telegramPost || telegramPost.telegramChannelId !== channel.id)) {
          throw new BadRequestException('Telegram post does not belong to target channel');
        }
        const scheduledAt = telegramPost
          ? telegramPost.postDate
          : zonedDateTimeToUtc(row.date, override?.time || dto.defaults.time, dto.defaults.timezone);
        if (telegramPost && utcDateKey(telegramPost.postDate, dto.defaults.timezone) !== row.date) {
          throw new BadRequestException('Telegram post date does not match bulk row date');
        }
        const recommendedPrice = decimalOrNull(override?.recommendedPrice ?? dto.defaults.recommendedPrice) ?? decimal(0);
        const minimumPrice = decimalOrNull(override?.minimumPrice ?? dto.defaults.minimumPrice) ?? decimalOrNull(product?.minimumPrice) ?? decimal(0);
        const agreedPrice = decimal(row.agreedPriceOverride ?? dto.defaults.agreedPrice);
        const manualPriceReason =
          (override?.manualPriceReason ?? dto.defaults.manualPriceReason)?.trim() ||
          (agreedPrice.lt(minimumPrice) ? 'Bulk price override' : null);
        return {
          clientRowIds: row.clientRowIds,
          date: row.date,
          channelId: channel.id,
          networkId: dto.target.type === 'NETWORK' ? dto.target.networkId ?? null : null,
          scheduledAt,
          telegramPostId,
          productId,
          pricingMode: override?.pricingMode ?? dto.defaults.pricingMode ?? product?.defaultPricingMode ?? TelegramAdPricingMode.CPM,
          expectedViews: override?.expectedViews ?? dto.defaults.expectedViews ?? 0,
          recommendedPrice,
          minimumPrice,
          agreedPrice,
          currency: dto.defaults.settlementCurrency || product?.currency || channel.adBaseCurrency || 'USD',
          manualPriceReason,
          advertiser: rowAdvertiser,
        };
      });
    });
  }

  private resolveRowAdvertiser(
    dto: TelegramAdSalesBulkCreateDto,
    row: TelegramAdSalesBulkCreateDto['rows'][number],
  ): ResolvedAdvertiser {
    const source = row.advertiserOverride ?? dto.defaults;
    return {
      advertiserId: source.advertiserId ?? null,
      advertiserName: source.advertiserName.trim(),
      advertiserTelegram: source.advertiserTelegram?.trim() || null,
      advertiserContact: source.advertiserContact?.trim() || null,
      advertiserCompanyName: source.advertiserCompanyName?.trim() || null,
      createAdvertiser: source.createAdvertiser ?? !source.advertiserId,
    };
  }

  private assertBulkPriceRules(placements: ExpandedPlacement[]) {
    for (const placement of placements) {
      if (!placement.advertiser.advertiserName) {
        throw new BadRequestException('Advertiser name is required');
      }
    }
  }

  private groupByAdvertiser(placements: ExpandedPlacement[]) {
    const groups = new Map<string, ExpandedPlacement[]>();
    for (const placement of placements) {
      const key = this.advertiserKey(placement.advertiser);
      groups.set(key, [...(groups.get(key) ?? []), placement]);
    }
    return groups;
  }

  private advertiserKey(advertiser: ResolvedAdvertiser) {
    return [
      advertiser.advertiserId ?? '',
      advertiser.advertiserName.toLowerCase(),
      advertiser.advertiserTelegram ?? '',
      advertiser.advertiserContact ?? '',
      advertiser.advertiserCompanyName ?? '',
    ].join('|');
  }

  private async resolveAdvertisers(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    userId: string,
    assignedMemberId: string | null,
    placements: ExpandedPlacement[],
  ) {
    const result = new Map<string, string | null>();
    for (const [key, group] of this.groupByAdvertiser(placements)) {
      const advertiser = group[0].advertiser;
      if (advertiser.advertiserId) {
        const existing = await tx.telegramAdvertiser.findFirst({
          where: { id: advertiser.advertiserId, workspaceId },
          select: { id: true },
        });
        if (!existing) throw new NotFoundException('Telegram advertiser not found');
        result.set(key, existing.id);
        continue;
      }
      if (!advertiser.createAdvertiser) {
        result.set(key, null);
        continue;
      }
      const normalizedEmail = this.normalizeEmail(advertiser.advertiserContact);
      const normalizedPhone = this.normalizePhone(advertiser.advertiserContact);
      const contactIsEmail = Boolean(normalizedEmail?.includes('@'));
      const existingByName = await tx.telegramAdvertiser.findFirst({
        where: { workspaceId, displayName: advertiser.advertiserName },
        select: { id: true },
      });
      if (existingByName) {
        result.set(key, existingByName.id);
        continue;
      }
      try {
        const created = await tx.telegramAdvertiser.create({
          data: {
            workspaceId,
            displayName: advertiser.advertiserName,
            companyName: advertiser.advertiserCompanyName,
            telegramUsername: advertiser.advertiserTelegram?.replace(/^@+/, '').toLowerCase() ?? null,
            phone: contactIsEmail ? null : normalizedPhone,
            email: contactIsEmail ? normalizedEmail : null,
            ownerMemberId: assignedMemberId,
            createdByUserId: userId,
            status: TelegramAdvertiserStatus.LEAD,
            lifecycleStage: TelegramAdvertiserLifecycleStage.NEW,
          },
        });
        await this.createAdvertiserContacts(tx, workspaceId, created.id, advertiser);
        result.set(key, created.id);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error;
        }
        const existingAfterConflict = await tx.telegramAdvertiser.findFirst({
          where: { workspaceId, displayName: advertiser.advertiserName },
          select: { id: true },
        });
        if (!existingAfterConflict) throw error;
        result.set(key, existingAfterConflict.id);
      }
    }
    return result;
  }

  private async createAdvertiserContacts(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    advertiserId: string,
    advertiser: ResolvedAdvertiser,
  ) {
    if (advertiser.advertiserTelegram) {
      await tx.telegramAdvertiserContact.create({
        data: {
          workspaceId,
          advertiserId,
          type: TelegramAdvertiserContactType.TELEGRAM_USERNAME,
          value: advertiser.advertiserTelegram,
          normalizedValue: advertiser.advertiserTelegram.replace(/^@+/, '').toLowerCase(),
          isPrimary: true,
        },
      });
    }
    if (!advertiser.advertiserContact) return;
    const normalizedEmail = this.normalizeEmail(advertiser.advertiserContact);
    const contactIsEmail = Boolean(normalizedEmail?.includes('@'));
    const normalizedPhone = this.normalizePhone(advertiser.advertiserContact);
    const type = contactIsEmail
      ? TelegramAdvertiserContactType.EMAIL
      : TelegramAdvertiserContactType.PHONE;
    await tx.telegramAdvertiserContact.create({
      data: {
        workspaceId,
        advertiserId,
        type,
        value: advertiser.advertiserContact,
        normalizedValue:
          (contactIsEmail ? normalizedEmail : normalizedPhone) ??
          advertiser.advertiserContact,
        isPrimary: !advertiser.advertiserTelegram,
      },
    });
  }

  private normalizePhone(value?: string | null) {
    const normalized = value?.trim().replace(/[^\d+]/g, '') || '';
    return normalized || null;
  }

  private normalizeEmail(value?: string | null) {
    const normalized = value?.trim().toLowerCase() || '';
    return normalized || null;
  }
}
