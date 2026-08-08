import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TelegramAdCrmDealStage,
  TelegramAdSalePaymentStatus,
  TelegramAdPlacementStatus,
  TelegramAdPricingMode,
  TelegramAdSaleStatus,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
  TelegramAdSlotStrategy,
  TelegramAdvertiserActivityType,
  TelegramAdvertiserContactType,
  TelegramAdvertiserLifecycleStage,
  TelegramAdvertiserStatus,
  TelegramAdvertiserTaskPriority,
  TelegramAdvertiserTaskStatus,
  TelegramAdvertiserTaskType,
  TransactionType,
  WorkspaceRole,
} from '@prisma/client';
import { createPaginatedResponse, normalizePagination } from '../common/pagination/pagination.utils';
import { ResponseCacheService } from '../common/response-cache.service';
import { CurrencyConversionService } from '../common/currency-conversion.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { WorkspaceService } from '../common/workspace.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationLoggerService } from '../application-logs/application-logger.service';
import { FinanceCategoriesService } from '../finance-categories/finance-categories.service';
import { TelegramChannelsService } from '../telegram-channels/telegram-channels.service';
import { TelegramMtprotoClient } from '../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../telegram/shared/telegram-source-access.service';
import {
  AttachPlacementManagedPostDto,
  TelegramAdAlertsQueryDto,
  TelegramAdAnalyticsQueryDto,
  TelegramAdAnalyticsSeriesQueryDto,
  TelegramAdInventoryDetailsQueryDto,
  TelegramAdInventoryRebuildDto,
  TelegramAdNetworkAnalyticsQueryDto,
  TelegramAdPriceFillCorrelationQueryDto,
  TelegramAdRevenueScenarioDto,
  CancelPlacementDto,
  CompletePermanentPlacementDto,
  CreateTelegramAdProductDto,
  CreateTelegramAdQuoteDto,
  CreateTelegramAdvertiserActivityDto,
  CreateTelegramAdvertiserContactDto,
  CreateTelegramAdvertiserDto,
  CreateTelegramAdSaleDto,
  CreateTelegramAdSalePlacementDto,
  CreateTelegramAdSalePaymentDto,
  CreateTelegramAdvertiserTaskDto,
  CreatePlacementManagedPostDto,
  PublishPlacementDto,
  RecommendTelegramAdPolicyDto,
  ReserveTelegramAdSaleDto,
  ReschedulePlacementDto,
  RetryPlacementDeletionDto,
  SchedulePlacementDto,
  ScheduleSaleDto,
  TelegramAdAvailabilityQueryDto,
  TelegramAdPriceHistoryQueryDto,
  TelegramAdProductsQueryDto,
  TelegramAdSalesQueryDto,
  TelegramAdvertiserActivitiesQueryDto,
  TelegramAdvertiserSearchDto,
  TelegramAdvertiserTasksQueryDto,
  TelegramAdvertisersQueryDto,
  CompleteTelegramAdvertiserTaskDto,
  SkipTelegramAdvertiserTaskDto,
  UpdateTelegramAdChannelPricingDto,
  UpdateTelegramAdSalesMemberPreferencesDto,
  UpdateTelegramAdSalesWorkspaceSettingsDto,
  UpdateTelegramAdSalePaymentDto,
  UpdateTelegramAdvertiserContactDto,
  UpdateTelegramAdvertiserDto,
  UpdateTelegramAdvertiserTaskDto,
  UpdateTelegramAdPolicyDto,
  UpdateTelegramAdProductDto,
  UpdateTelegramAdSaleDto,
  UpdateTelegramAdSalePlacementDto,
  VoidTelegramAdSalePaymentDto,
} from './dto';
import { calculateExpectedViews } from './domain/expected-views';
import { recommendPolicyFromOrganicPosts } from './domain/policy-recommendation';
import { calculatePricing } from './domain/pricing';
import { buildAvailabilitySlots } from './domain/slot-engine';
import { decimal, decimalOrNull, decimalToString } from './domain/decimal';
import { utcDateKey, utcTimeKey, zonedDateTimeToUtc } from './domain/timezone';
import {
  ACTIVE_TELEGRAM_AD_PLACEMENT_STATUSES,
  assertTelegramAdPlacementConflictFree,
  telegramAdSalesAdvisoryLockKey,
} from './telegram-ad-sales-reservation';

@Injectable()
export class TelegramAdSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly logger: ApplicationLoggerService,
    private readonly responseCache: ResponseCacheService,
    private readonly currencyConversionService: CurrencyConversionService,
    private readonly financeCategoriesService: FinanceCategoriesService,
    private readonly telegramChannelsService: TelegramChannelsService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly encryptionService: TokenEncryptionService,
  ) {}

  private availabilityCacheKey(params: {
    workspaceId: string;
    channelIds: string[];
    networkId?: string | null;
    productIds?: string[];
    from: string;
    to: string;
    cacheBust?: string;
  }) {
    return [
      'telegram-ad-sales',
      'availability',
      params.workspaceId,
      params.from,
      params.to,
      params.networkId ?? 'all-networks',
      [...params.channelIds].sort().join(','),
      [...(params.productIds ?? [])].sort().join(',') || 'all-products',
      params.cacheBust ?? 'cached',
    ].join(':');
  }

  private invalidateAvailabilityCache(workspaceId: string) {
    this.responseCache.clearByPrefix(`telegram-ad-sales:availability:${workspaceId}:`);
  }

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private async findWorkspaceChannel(workspaceId: string, channelId: string) {
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      include: {
        timePosts: { orderBy: [{ position: 'asc' }, { time: 'asc' }] },
      },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return channel;
  }

  private async findWorkspaceNetwork(workspaceId: string, networkId: string) {
    const network = await this.prisma.telegramChannelNetwork.findFirst({
      where: { id: networkId, workspaceId },
      include: { channels: true },
    });
    if (!network) throw new NotFoundException('Telegram channel network not found');
    return network;
  }

  private async findSale(workspaceId: string, id: string) {
    const sale = await this.prisma.telegramAdSale.findFirst({
      where: { id, workspaceId },
      include: {
        placements: { orderBy: { scheduledAt: 'asc' } },
      },
    });
    if (!sale) throw new NotFoundException('Telegram ad sale not found');
    return sale;
  }

  private mapProduct(product: any) {
    return {
      ...product,
      defaultCpm: decimalToString(product.defaultCpm),
      defaultFixedPrice: decimalToString(product.defaultFixedPrice),
      minimumPrice: decimalToString(product.minimumPrice),
      estimatedPrice: decimalToString(product.estimatedPrice),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private mapPolicy(policy: any) {
    return {
      ...policy,
      expectedOrganicPostsPerDay: decimalToString(policy.expectedOrganicPostsPerDay),
      createdAt: policy.createdAt.toISOString(),
      updatedAt: policy.updatedAt.toISOString(),
    };
  }

  private mapSnapshot(snapshot: any) {
    return {
      ...snapshot,
      averageViews: decimalToString(snapshot.averageViews),
      medianViews: decimalToString(snapshot.medianViews),
      adjustedViews: decimalToString(snapshot.adjustedViews),
      targetCpm: decimalToString(snapshot.targetCpm),
      minimumCpm: decimalToString(snapshot.minimumCpm),
      recommendedPrice: decimalToString(snapshot.recommendedPrice),
      minimumPrice: decimalToString(snapshot.minimumPrice),
      calculatedAt: snapshot.calculatedAt.toISOString(),
      createdAt: snapshot.createdAt.toISOString(),
    };
  }

  private mapPlacement(placement: any) {
    return {
      ...placement,
      quotedCpm: decimalToString(placement.quotedCpm),
      recommendedPrice: decimalToString(placement.recommendedPrice),
      minimumPrice: decimalToString(placement.minimumPrice),
      agreedPrice: decimalToString(placement.agreedPrice),
      actualCpm: decimalToString(placement.actualCpm),
      scheduledAt: placement.scheduledAt.toISOString(),
      scheduledManagedAt: placement.scheduledManagedAt?.toISOString() ?? null,
      publishedAt: placement.publishedAt?.toISOString() ?? null,
      plannedDeleteAt: placement.plannedDeleteAt?.toISOString() ?? null,
      deletedAt: placement.deletedAt?.toISOString() ?? null,
      lastDeletionAttemptAt: placement.lastDeletionAttemptAt?.toISOString() ?? null,
      completedAt: placement.completedAt?.toISOString() ?? null,
      createdAt: placement.createdAt.toISOString(),
      updatedAt: placement.updatedAt.toISOString(),
      paidAllocatedAmount: decimalToString(placement.paidAllocatedAmount),
      unpaidAmount: decimalToString(placement.unpaidAmount),
      underpricingAmount: decimalToString(placement.underpricingAmount),
      underpricingPercent: decimalToString(placement.underpricingPercent),
    };
  }

  private mapPayment(payment: any) {
    return {
      ...payment,
      amount: decimalToString(payment.amount),
      amountInPrimaryCurrency: decimalToString(payment.amountInPrimaryCurrency),
      exchangeRateToPrimary: decimalToString(payment.exchangeRateToPrimary),
      paidAt: payment.paidAt.toISOString(),
      voidedAt: payment.voidedAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
      allocations: Array.isArray(payment.allocations)
        ? payment.allocations.map((allocation: any) => ({
            ...allocation,
            amount: decimalToString(allocation.amount),
            amountInPrimaryCurrency: decimalToString(
              allocation.amountInPrimaryCurrency,
            ),
            createdAt: allocation.createdAt.toISOString(),
          }))
        : [],
    };
  }

  private mapSale(sale: any) {
    const detailed = this.buildSaleSummary(sale);
    return {
      ...sale,
      reservedUntil: sale.reservedUntil?.toISOString() ?? null,
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
      placements: detailed.placements.map((placement: any) =>
        this.mapPlacement(placement),
      ),
      payments: detailed.payments.map((payment: any) => this.mapPayment(payment)),
      advertiser: sale.advertiser ? this.mapAdvertiser(sale.advertiser) : null,
      ...detailed.summary,
    };
  }

  private normalizeTelegramUsername(value?: string | null) {
    const normalized = value?.trim().replace(/^@+/, '').toLowerCase() || '';
    return normalized || null;
  }

  private normalizePhone(value?: string | null) {
    const normalized = value?.trim().replace(/[^\d+]/g, '') || '';
    return normalized || null;
  }

  private normalizeEmail(value?: string | null) {
    const normalized = value?.trim().toLowerCase() || '';
    return normalized || null;
  }

  private normalizeWebsite(value?: string | null) {
    const normalized = value?.trim().toLowerCase() || '';
    return normalized || null;
  }

  private normalizeContactValue(type: TelegramAdvertiserContactType, value?: string | null) {
    if (type === TelegramAdvertiserContactType.TELEGRAM_USERNAME) {
      return this.normalizeTelegramUsername(value);
    }
    if (type === TelegramAdvertiserContactType.PHONE) {
      return this.normalizePhone(value);
    }
    if (type === TelegramAdvertiserContactType.EMAIL) {
      return this.normalizeEmail(value);
    }
    if (type === TelegramAdvertiserContactType.WEBSITE) {
      return this.normalizeWebsite(value);
    }
    return value?.trim() || null;
  }

  private mapAdvertiserContact(contact: any) {
    return {
      ...contact,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    };
  }

  private mapAdvertiserActivity(activity: any) {
    return {
      ...activity,
      occurredAt: activity.occurredAt.toISOString(),
      createdAt: activity.createdAt.toISOString(),
    };
  }

  private mapAdvertiserTask(task: any) {
    return {
      ...task,
      dueAt: task.dueAt.toISOString(),
      remindAt: task.remindAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      skippedAt: task.skippedAt?.toISOString() ?? null,
      snoozedUntil: task.snoozedUntil?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private mapAdvertiser(settings: any) {
    return {
      ...settings,
      totalRevenueInPrimaryCurrency: decimalToString(settings.totalRevenueInPrimaryCurrency),
      averageOrderValueInPrimaryCurrency: decimalToString(settings.averageOrderValueInPrimaryCurrency),
      lastContactAt: settings.lastContactAt?.toISOString() ?? null,
      lastPurchaseAt: settings.lastPurchaseAt?.toISOString() ?? null,
      nextContactAt: settings.nextContactAt?.toISOString() ?? null,
      firstPurchaseAt: settings.firstPurchaseAt?.toISOString() ?? null,
      repeatCustomerAt: settings.repeatCustomerAt?.toISOString() ?? null,
      archivedAt: settings.archivedAt?.toISOString() ?? null,
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
      contacts: Array.isArray(settings.contacts)
        ? settings.contacts.map((contact: any) => this.mapAdvertiserContact(contact))
        : undefined,
      recentActivities: Array.isArray(settings.activities)
        ? settings.activities.map((activity: any) => this.mapAdvertiserActivity(activity))
        : undefined,
      openTasks: Array.isArray(settings.tasks)
        ? settings.tasks.map((task: any) => this.mapAdvertiserTask(task))
        : undefined,
      sales: Array.isArray(settings.sales) ? settings.sales.map((sale: any) => this.mapSale(sale)) : undefined,
    };
  }

  private policyDefaults(timezone: string) {
    return {
      timezone,
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: true,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 999,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: TelegramAdSlotStrategy.BEFORE_ORGANIC_POST,
      fallbackSlotTimes: [],
      allowManualSlots: false,
    };
  }

  private defaultProductTemplates() {
    return [
      {
        name: '1/24',
        topDurationMinutes: 60,
        feedDurationHours: 24,
        deleteAfterHours: 24,
        isPermanent: false,
        position: 0,
      },
      {
        name: '2/48',
        topDurationMinutes: 120,
        feedDurationHours: 48,
        deleteAfterHours: 48,
        isPermanent: false,
        position: 1,
      },
      {
        name: '3/72',
        topDurationMinutes: 180,
        feedDurationHours: 72,
        deleteAfterHours: 72,
        isPermanent: false,
        position: 2,
      },
      {
        name: 'No auto-delete',
        topDurationMinutes: 60,
        feedDurationHours: null,
        deleteAfterHours: null,
        isPermanent: true,
        position: 3,
      },
    ] as const;
  }

  private normalizeDefaultProductName(name: string) {
    const normalized = name.trim().toLowerCase();
    if (normalized === '1/permanent' || normalized === 'no auto-delete') {
      return 'no auto-delete';
    }
    return normalized;
  }

  private async ensureDefaultProductsForChannel(params: {
    workspaceId: string;
    channelId: string;
    currency: string;
  }) {
    const existing = await this.prisma.telegramAdProduct.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.channelId,
      },
      select: {
        name: true,
      },
    });
    const existingNames = new Set(
      existing
        .map((product) => this.normalizeDefaultProductName(product.name ?? ''))
        .filter((name): name is string => Boolean(name)),
    );
    const missing = this.defaultProductTemplates().filter(
      (template) => !existingNames.has(this.normalizeDefaultProductName(template.name)),
    );
    if (!missing.length) return;

    await this.prisma.telegramAdProduct.createMany({
      skipDuplicates: true,
      data: missing.map((template) => ({
        workspaceId: params.workspaceId,
        telegramChannelId: params.channelId,
        name: template.name,
        description: null,
        topDurationMinutes: template.topDurationMinutes,
        feedDurationHours: template.feedDurationHours,
        deleteAfterHours: template.deleteAfterHours,
        isPermanent: template.isPermanent,
        defaultPricingMode: TelegramAdPricingMode.CPM,
        defaultCpm: null,
        defaultFixedPrice: null,
        minimumPrice: null,
        currency: params.currency,
        isActive: true,
        position: template.position,
      })),
    });
  }

  private projectedOrganicPostsPerDay(params: {
    channel: { timePosts?: Array<{ time: string }> };
    policy: { expectedOrganicPostsPerDay?: Prisma.Decimal | number | null };
    historicalOrganicPosts: number;
    historyWindowDays: number;
  }) {
    const scheduledPerDay = params.channel.timePosts?.length ?? 0;
    if (scheduledPerDay > 0) return scheduledPerDay;

    const explicit = Number(params.policy.expectedOrganicPostsPerDay ?? 0);
    if (Number.isFinite(explicit) && explicit > 0) {
      return Math.max(1, Math.round(explicit));
    }

    if (params.historicalOrganicPosts <= 0 || params.historyWindowDays <= 0) {
      return 0;
    }

    return Math.max(
      1,
      Math.round(params.historicalOrganicPosts / params.historyWindowDays),
    );
  }

  private projectedOrganicTimeline(params: {
    dateKey: string;
    timezone: string;
    projectedCount: number;
    scheduledTimes: Array<{ time: string }>;
  }) {
    const timeline: Array<{ id: string; at: Date }> = [];
    if (params.projectedCount <= 0) return timeline;

    const fallbackTimes = ['09:00', '13:00', '17:00', '21:00'];
    for (let index = 0; index < params.projectedCount; index += 1) {
      const scheduledTime =
        params.scheduledTimes[index]?.time ??
        fallbackTimes[index] ??
        `${String((9 + index * 2) % 24).padStart(2, '0')}:00`;
      timeline.push({
        id: `projected:${params.dateKey}:${index}`,
        at: zonedDateTimeToUtc(params.dateKey, scheduledTime, params.timezone),
      });
    }
    return timeline;
  }

  private async resolveAdSalesWorkspaceSettings(workspaceId: string) {
    return this.prisma.telegramAdSalesWorkspaceSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, defaultOrganicPostsPerAdSlot: 3 },
      update: {},
    });
  }

  private mapAdSalesWorkspaceSettings(settings: any) {
    return {
      ...settings,
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  private mapAdSalesMemberPreferences(preferences: any) {
    return {
      ...preferences,
      createdAt: preferences.createdAt.toISOString(),
      updatedAt: preferences.updatedAt.toISOString(),
    };
  }

  private async resolveWorkspaceTimezone(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { timezone: true },
    });
    return workspace.timezone || 'Europe/Warsaw';
  }

  private async resolvePolicy(workspaceId: string, channelId: string, timezone = 'UTC') {
    const policy = await this.prisma.telegramAdSchedulePolicy.findFirst({
      where: { workspaceId, telegramChannelId: channelId },
    });
    const workspaceSettings = await this.resolveAdSalesWorkspaceSettings(workspaceId);
    if (policy) {
      return policy.useWorkspaceDefault
        ? {
            ...policy,
            organicPostsPerAdSlot: workspaceSettings.defaultOrganicPostsPerAdSlot,
          }
        : policy;
    }
    return {
      id: 'virtual',
      workspaceId,
      telegramChannelId: channelId,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...this.policyDefaults(timezone),
      organicPostsPerAdSlot: workspaceSettings.defaultOrganicPostsPerAdSlot,
    };
  }

  private async computeExpectedViews(workspaceId: string, channelId: string) {
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: {
        id: true,
        currentSubscribersCount: true,
        ownViewsPerPost: true,
      },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');

    const [posts, audienceSnapshot] = await Promise.all([
      this.prisma.telegramPost.findMany({
        where: {
          workspaceId,
          telegramChannelId: channelId,
        },
        orderBy: { postDate: 'desc' },
        take: 60,
        select: {
          id: true,
          postDate: true,
          viewsCount: true,
          manualOwnViews: true,
          excludeFromAnalytics: true,
          adSalePlacements: { select: { id: true }, take: 1 },
        },
      }),
      this.prisma.telegramChannelAudienceSnapshot.findFirst({
        where: { workspaceId, telegramChannelId: channelId },
        orderBy: { collectedAt: 'desc' },
      }),
    ]);

    return calculateExpectedViews({
      posts: posts.map((post) => ({
        id: post.id,
        postDate: post.postDate,
        viewsCount: post.viewsCount,
        manualOwnViews: post.manualOwnViews,
        excludeFromAnalytics: post.excludeFromAnalytics,
        adPlacementLinked: post.adSalePlacements.length > 0,
      })),
      currentSubscribersCount: channel.currentSubscribersCount,
      ownViewsPerPost: channel.ownViewsPerPost,
      audienceSnapshot,
    });
  }

  private async loadPricingPosts(workspaceId: string, channelId: string, asOf?: Date) {
    return this.prisma.telegramPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        ...(asOf ? { postDate: { lte: asOf } } : {}),
      },
      orderBy: { postDate: 'desc' },
      take: 60,
      select: {
        id: true,
        postDate: true,
        viewsCount: true,
        manualOwnViews: true,
        excludeFromAnalytics: true,
        adSalePlacements: { select: { id: true }, take: 1 },
        metricSnapshots: {
          ...(asOf ? { where: { collectedAt: { lte: asOf } } } : {}),
          select: {
            viewsCount: true,
            collectedAt: true,
          },
          orderBy: { collectedAt: 'asc' },
        },
      },
    });
  }

  private resolvePricingWindow(product?: {
    deleteAfterHours?: number | null;
    isPermanent?: boolean;
  } | null) {
    if (!product) {
      return { hours: null as number | null, label: 'Post' };
    }
    if (product.isPermanent) {
      return { hours: 168, label: '7d placement' };
    }
    if (product.deleteAfterHours != null) {
      return { hours: product.deleteAfterHours, label: `${product.deleteAfterHours}h placement` };
    }
    return { hours: null as number | null, label: 'Post' };
  }

  private selectWindowViews(
    post: {
      postDate: Date;
      viewsCount: number | null;
      metricSnapshots: Array<{ viewsCount: number | null; collectedAt: Date }>;
    },
    targetHours: number | null,
    now: Date,
    options?: { historicalAsOf?: boolean },
  ) {
    if (targetHours == null) {
      const latestSnapshot =
        [...post.metricSnapshots]
          .filter(
            (snapshot) =>
              snapshot.viewsCount != null &&
              snapshot.collectedAt.getTime() >= post.postDate.getTime() &&
              snapshot.collectedAt.getTime() <= now.getTime(),
          )
          .sort((left, right) => right.collectedAt.getTime() - left.collectedAt.getTime())[0] ?? null;
      return latestSnapshot?.viewsCount ?? (options?.historicalAsOf ? null : post.viewsCount);
    }
    const targetAt = new Date(post.postDate.getTime() + targetHours * 60 * 60 * 1000);
    if (targetAt > now) {
      return null;
    }
    const toleranceHours = targetHours <= 24 ? 8 : targetHours <= 48 ? 12 : 24;
    const candidate =
      [...post.metricSnapshots]
        .filter(
          (snapshot) =>
            snapshot.viewsCount != null &&
            snapshot.collectedAt.getTime() >= post.postDate.getTime() &&
            snapshot.collectedAt.getTime() <= now.getTime(),
        )
        .map((snapshot) => ({
          ...snapshot,
          diff: Math.abs(snapshot.collectedAt.getTime() - targetAt.getTime()),
        }))
        .sort((left, right) => left.diff - right.diff)[0] ?? null;

    if (!candidate || candidate.diff > toleranceHours * 60 * 60 * 1000) {
      return null;
    }

    return candidate.viewsCount;
  }

  private async computeExpectedViewsForWindow(
    workspaceId: string,
    channelId: string,
    targetHours: number | null,
    asOf?: Date,
  ) {
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: {
        id: true,
        currentSubscribersCount: true,
        ownViewsPerPost: true,
      },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const posts = await this.loadPricingPosts(workspaceId, channelId, asOf);
    const now = asOf ?? new Date();
    return calculateExpectedViews({
      now,
      maxPostsForPrimary: 3,
      posts: posts.map((post) => ({
        id: post.id,
        postDate: post.postDate,
        viewsCount: this.selectWindowViews(post, targetHours, now, {
          historicalAsOf: Boolean(asOf),
        }),
        manualOwnViews: post.manualOwnViews,
        excludeFromAnalytics: post.excludeFromAnalytics,
        adPlacementLinked: post.adSalePlacements.length > 0,
      })),
      currentSubscribersCount: channel.currentSubscribersCount,
      ownViewsPerPost: channel.ownViewsPerPost,
      audienceSnapshot: null,
    });
  }

  private async computeExpectedViewsForProduct(
    workspaceId: string,
    channelId: string,
    product?: {
      deleteAfterHours?: number | null;
      isPermanent?: boolean;
    } | null,
    asOf?: Date,
  ) {
    const window = this.resolvePricingWindow(product);
    const result = await this.computeExpectedViewsForWindow(workspaceId, channelId, window.hours, asOf);
    return {
      ...result,
      pricingWindowHours: window.hours,
      pricingWindowLabel: window.label,
    };
  }

  private pricingSettingsForChannel(channel: {
    id: string;
    adBaseCpm?: Prisma.Decimal | null;
    adBaseCurrency?: string | null;
    updatedAt?: Date;
  }) {
    return {
      channelId: channel.id,
      baseCpm: decimalToString(channel.adBaseCpm),
      currency: channel.adBaseCurrency || 'USD',
      updatedAt: channel.updatedAt?.toISOString() ?? null,
    };
  }

  private buildWindowSummary(result: Awaited<ReturnType<typeof this.computeExpectedViewsForWindow>>) {
    return {
      expectedViews: result.expectedViews,
      averageViews: result.averageViews,
      medianViews: result.medianViews,
      postsSampleCount: result.postsSampleCount,
      dataQuality: result.dataQuality,
    };
  }

  private async buildProductPricingPreview(
    workspaceId: string,
    channel: {
      id: string;
      adBaseCpm?: Prisma.Decimal | null;
      adBaseCurrency?: string | null;
    },
    product?: {
      id?: string | null;
      deleteAfterHours?: number | null;
      isPermanent?: boolean;
      defaultPricingMode?: TelegramAdPricingMode;
      defaultCpm?: Prisma.Decimal | null;
      defaultFixedPrice?: Prisma.Decimal | null;
    } | null,
    overrides?: {
      pricingMode?: TelegramAdPricingMode;
      targetCpm?: number | Prisma.Decimal | null;
      minimumCpm?: number | Prisma.Decimal | null;
      fixedPrice?: number | Prisma.Decimal | null;
      asOf?: Date | null;
    },
  ) {
    const expectedViews = await this.computeExpectedViewsForProduct(
      workspaceId,
      channel.id,
      product,
      overrides?.asOf ?? undefined,
    );
    if (expectedViews.expectedViews == null) {
      return {
        ...expectedViews,
        currency: channel.adBaseCurrency || 'USD',
        recommendedPrice: '0.00',
        minimumPrice: '0.00',
        targetCpm: decimalToString(decimal(overrides?.targetCpm ?? channel.adBaseCpm ?? product?.defaultCpm ?? 0)) || '0.00',
      };
    }
    const pricingMode = overrides?.pricingMode ?? product?.defaultPricingMode ?? TelegramAdPricingMode.CPM;
    const targetCpm = overrides?.targetCpm ?? channel.adBaseCpm ?? product?.defaultCpm ?? 0;
    const minimumCpm = overrides?.minimumCpm ?? targetCpm ?? 0;
    const pricing = calculatePricing({
      expectedViews: expectedViews.expectedViews,
      pricingMode,
      targetCpm,
      minimumCpm,
      fixedPrice: overrides?.fixedPrice ?? product?.defaultFixedPrice ?? 0,
    });
    return {
      ...expectedViews,
      currency: channel.adBaseCurrency || 'USD',
      recommendedPrice: decimalToString(pricing.recommendedPrice) ?? '0.00',
      minimumPrice: decimalToString(pricing.minimumPrice) ?? '0.00',
      targetCpm: decimalToString(pricing.targetCpm) ?? '0.00',
    };
  }

  async getChannelBaseline(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.findWorkspaceChannel(workspaceId, channelId);
    const [baseline, h24, h48, h72, d7] = await Promise.all([
      this.computeExpectedViewsForWindow(workspaceId, channelId, null),
      this.computeExpectedViewsForWindow(workspaceId, channelId, 24),
      this.computeExpectedViewsForWindow(workspaceId, channelId, 48),
      this.computeExpectedViewsForWindow(workspaceId, channelId, 72),
      this.computeExpectedViewsForWindow(workspaceId, channelId, 168),
    ]);
    return {
      channelId,
      expectedViews: baseline.expectedViews,
      averageViews: baseline.averageViews,
      medianViews: baseline.medianViews,
      adjustedViews: baseline.adjustedViews,
      postsSampleCount: baseline.postsSampleCount,
      methodVersion: baseline.methodVersion,
      dataQuality: baseline.dataQuality,
      warnings: baseline.warnings,
      fallbackSource: baseline.fallbackSource,
      sample: baseline.sample.map((item) => ({
        ...item,
        date: item.date.toISOString(),
      })),
      pricing: this.pricingSettingsForChannel(channel),
      windows: {
        final: this.buildWindowSummary(baseline),
        h24: this.buildWindowSummary(h24),
        h48: this.buildWindowSummary(h48),
        h72: this.buildWindowSummary(h72),
        d7: this.buildWindowSummary(d7),
      },
    };
  }

  async updateChannelPricing(
    userId: string,
    channelId: string,
    dto: UpdateTelegramAdChannelPricingDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.findWorkspaceChannel(workspaceId, channelId);
    const channel = await this.prisma.telegramChannel.update({
      where: { id: channelId },
      data: {
        ...(dto.baseCpm === undefined ? {} : { adBaseCpm: decimalOrNull(dto.baseCpm) }),
        ...(dto.currency === undefined ? {} : { adBaseCurrency: dto.currency }),
      },
      select: {
        id: true,
        adBaseCpm: true,
        adBaseCurrency: true,
        updatedAt: true,
      },
    });
    this.invalidateAvailabilityCache(workspaceId);
    return this.pricingSettingsForChannel(channel);
  }

  private async ensurePlacementBelongsToSale(
    workspaceId: string,
    saleId: string,
    placementId: string,
  ) {
    const placement = await this.prisma.telegramAdSalePlacement.findFirst({
      where: {
        id: placementId,
        workspaceId,
        telegramAdSaleId: saleId,
      },
    });
    if (!placement) throw new NotFoundException('Telegram ad sale placement not found');
    return placement;
  }

  private async resolvePrimaryCurrency(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { primaryCurrency: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace.primaryCurrency;
  }

  private async resolveRateToPrimary(
    workspaceId: string,
    fromCurrency: string,
    paidAt: Date,
  ) {
    const primaryCurrency = await this.resolvePrimaryCurrency(workspaceId);
    const rate = await this.currencyConversionService.getRate(
      fromCurrency,
      primaryCurrency,
      workspaceId,
      paidAt,
    );
    if (!rate) {
      throw new BadRequestException(
        `No exchange rate from ${fromCurrency} to ${primaryCurrency}`,
      );
    }
    return { primaryCurrency, rate };
  }

  private async resolveSystemCategory(
    workspaceId: string,
    key: 'channel_advertising_revenue' | 'telegram_ad_sales_reversal',
  ) {
    await this.financeCategoriesService.ensureSystemCategories(workspaceId);
    const category = await this.prisma.transactionCategory.findFirst({
      where: { workspaceId, key },
    });
    if (!category) throw new NotFoundException(`Category ${key} not found`);
    return category;
  }

  private includeSaleRelations() {
    return {
      advertiser: {
        include: {
          contacts: {
            orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
          },
        },
      },
      placements: {
        orderBy: { scheduledAt: 'asc' as const },
        include: {
          paymentAllocations: {
            include: { payment: true },
          },
          managedPost: {
            select: {
              id: true,
              title: true,
              status: true,
              telegramRemoteStatus: true,
              telegramMessageIds: true,
              telegramMessageUrls: true,
              publishedAt: true,
              scheduledAt: true,
              lastError: true,
            },
          },
          telegramPost: {
            select: {
              id: true,
              telegramMessageId: true,
              viewsCount: true,
              postDate: true,
            },
          },
        },
      },
      payments: {
        orderBy: { paidAt: 'asc' as const },
        include: {
          allocations: true,
          account: {
            select: {
              id: true,
              name: true,
              currency: true,
            },
          },
          transaction: {
            select: {
              id: true,
              date: true,
              amount: true,
              type: true,
              category: true,
            },
          },
          reversalTransaction: {
            select: {
              id: true,
              date: true,
              amount: true,
              type: true,
              category: true,
            },
          },
        },
      },
    };
  }

  private paymentStatusFromTotals(
    totalPaid: Prisma.Decimal,
    totalAgreed: Prisma.Decimal,
  ) {
    if (totalPaid.eq(0)) return 'UNPAID';
    if (totalPaid.lt(totalAgreed)) return 'PARTIALLY_PAID';
    if (totalPaid.eq(totalAgreed)) return 'PAID';
    return 'OVERPAID';
  }

  private advertiserInclude() {
    return {
      contacts: {
        orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
      },
      activities: {
        orderBy: [{ occurredAt: 'desc' as const }, { id: 'desc' as const }],
        take: 10,
      },
      tasks: {
        where: { status: { in: [TelegramAdvertiserTaskStatus.OPEN, TelegramAdvertiserTaskStatus.IN_PROGRESS] } },
        orderBy: [{ dueAt: 'asc' as const }, { id: 'asc' as const }],
        take: 10,
      },
      sales: {
        orderBy: [{ createdAt: 'desc' as const }],
        take: 10,
        include: this.includeSaleRelations(),
      },
    };
  }

  private async getAdvertiser(workspaceId: string, advertiserId: string) {
    const advertiser = await this.prisma.telegramAdvertiser.findFirst({
      where: { id: advertiserId, workspaceId },
      include: this.advertiserInclude(),
    });
    if (!advertiser) throw new NotFoundException('Telegram advertiser not found');
    return advertiser;
  }

  private async createAdvertiserActivity(
    workspaceId: string,
    advertiserId: string,
    payload: {
      type: TelegramAdvertiserActivityType;
      title: string;
      description?: string | null;
      saleId?: string | null;
      placementId?: string | null;
      taskId?: string | null;
      actorUserId?: string | null;
      actorMemberId?: string | null;
      metadata?: Prisma.InputJsonValue | null;
      occurredAt?: Date;
    },
  ) {
    return this.prisma.telegramAdvertiserActivity.create({
      data: {
        workspaceId,
        advertiserId,
        saleId: payload.saleId ?? null,
        placementId: payload.placementId ?? null,
        taskId: payload.taskId ?? null,
        actorUserId: payload.actorUserId ?? null,
        actorMemberId: payload.actorMemberId ?? null,
        type: payload.type,
        title: payload.title,
        description: payload.description ?? null,
        metadata: payload.metadata ?? Prisma.JsonNull,
        occurredAt: payload.occurredAt ?? new Date(),
      },
    });
  }

  private async recalculateAdvertiserStats(
    workspaceId: string,
    advertiserId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const sales = await tx.telegramAdSale.findMany({
      where: { workspaceId, advertiserId, status: { not: TelegramAdSaleStatus.CANCELLED } },
      include: {
        placements: true,
        payments: {
          where: { status: { not: TelegramAdSalePaymentStatus.VOIDED } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const totalSalesCount = sales.length;
    const completedSales = sales.filter((sale) =>
      sale.status === TelegramAdSaleStatus.CONFIRMED ||
      sale.status === TelegramAdSaleStatus.IN_PROGRESS ||
      sale.status === TelegramAdSaleStatus.COMPLETED,
    );
    const completedSalesCount = completedSales.length;
    const totalPlacementsCount = sales.reduce((sum, sale) => sum + sale.placements.length, 0);
    const totalRevenue = sales.reduce(
      (sum, sale) =>
        sum.add(
          sale.payments.reduce(
            (paymentSum, payment) => paymentSum.add(payment.amountInPrimaryCurrency),
            decimal(0),
          ),
        ),
      decimal(0),
    );
    const averageOrderValue = totalSalesCount ? totalRevenue.div(totalSalesCount) : decimal(0);
    const purchaseDates = completedSales.map((sale) => sale.createdAt).sort((a, b) => a.getTime() - b.getTime());
    const firstPurchaseAt = purchaseDates[0] ?? null;
    const lastPurchaseAt = purchaseDates[purchaseDates.length - 1] ?? null;
    const repeatCustomerAt = purchaseDates[1] ?? null;
    await tx.telegramAdvertiser.update({
      where: { id: advertiserId },
      data: {
        totalSalesCount,
        completedSalesCount,
        totalPlacementsCount,
        totalRevenueInPrimaryCurrency: totalRevenue,
        averageOrderValueInPrimaryCurrency: averageOrderValue,
        firstPurchaseAt,
        lastPurchaseAt,
        repeatCustomerAt,
        lifecycleStage:
          completedSalesCount >= 2
            ? TelegramAdvertiserLifecycleStage.REPEAT_CUSTOMER
            : completedSalesCount >= 1
              ? TelegramAdvertiserLifecycleStage.CUSTOMER
              : undefined,
        status:
          completedSalesCount >= 1
            ? TelegramAdvertiserStatus.ACTIVE
            : undefined,
      },
    });
  }

  private async resolveAdvertiserForSale(
    workspaceId: string,
    userId: string,
    dto: CreateTelegramAdSaleDto | UpdateTelegramAdSaleDto,
    assignedMemberId?: string | null,
  ) {
    if (dto.advertiserId === null) {
      return null;
    }
    if (dto.advertiserId) {
      return this.getAdvertiser(workspaceId, dto.advertiserId);
    }
    const shouldCreate = 'createAdvertiser' in dto ? dto.createAdvertiser : false;
    if (!shouldCreate) return null;
    const created = await this.prisma.telegramAdvertiser.create({
      data: {
        workspaceId,
        displayName: (dto.advertiserName ?? 'Advertiser').trim(),
        companyName: dto.advertiserCompanyName?.trim() || null,
        telegramUsername: this.normalizeTelegramUsername(dto.advertiserTelegram),
        phone: this.normalizePhone(dto.advertiserContact),
        email: this.normalizeEmail(dto.advertiserContact),
        ownerMemberId: assignedMemberId ?? null,
        createdByUserId: userId,
        status: TelegramAdvertiserStatus.LEAD,
        lifecycleStage: TelegramAdvertiserLifecycleStage.NEW,
      },
    });
    if (dto.advertiserTelegram?.trim()) {
      await this.prisma.telegramAdvertiserContact.create({
        data: {
          workspaceId,
          advertiserId: created.id,
          type: TelegramAdvertiserContactType.TELEGRAM_USERNAME,
          value: dto.advertiserTelegram.trim(),
          normalizedValue: this.normalizeTelegramUsername(dto.advertiserTelegram)!,
          isPrimary: true,
        },
      });
    }
    if (dto.advertiserContact?.trim()) {
      const normalizedEmail = this.normalizeEmail(dto.advertiserContact);
      const normalizedPhone = this.normalizePhone(dto.advertiserContact);
      const type = normalizedEmail?.includes('@')
        ? TelegramAdvertiserContactType.EMAIL
        : TelegramAdvertiserContactType.PHONE;
      await this.prisma.telegramAdvertiserContact.create({
        data: {
          workspaceId,
          advertiserId: created.id,
          type,
          value: dto.advertiserContact.trim(),
          normalizedValue:
            (type === TelegramAdvertiserContactType.EMAIL ? normalizedEmail : normalizedPhone) ??
            dto.advertiserContact.trim(),
          isPrimary: !dto.advertiserTelegram?.trim(),
        },
      });
    }
    await this.createAdvertiserActivity(workspaceId, created.id, {
      type: TelegramAdvertiserActivityType.ADVERTISER_CREATED,
      title: 'Advertiser created from ad sale',
      actorUserId: userId,
    });
    return this.getAdvertiser(workspaceId, created.id);
  }

  private appendPlacementFinancials(placement: any) {
    const paidAllocatedAmount = (placement.paymentAllocations ?? [])
      .filter((allocation: any) => allocation.payment?.status !== TelegramAdSalePaymentStatus.VOIDED)
      .reduce(
        (sum: Prisma.Decimal, allocation: any) =>
          sum.add(decimal(allocation.amount)),
        decimal(0),
      );
    const unpaidAmount = decimal(placement.agreedPrice).sub(paidAllocatedAmount);
    const underpricingAmount = decimal(placement.minimumPrice).gt(decimal(placement.agreedPrice))
      ? decimal(placement.minimumPrice).sub(decimal(placement.agreedPrice))
      : decimal(0);
    const underpricingPercent =
      decimal(placement.minimumPrice).gt(0) && underpricingAmount.gt(0)
        ? underpricingAmount.div(decimal(placement.minimumPrice)).mul(100)
        : decimal(0);
    return {
      ...placement,
      paidAllocatedAmount,
      unpaidAmount,
      underpricingAmount,
      underpricingPercent,
    };
  }

  private buildSaleSummary(sale: any) {
    const placements = (sale.placements ?? []).map((placement: any) =>
      this.appendPlacementFinancials(placement),
    );
    const payments = (sale.payments ?? []).filter(
      (payment: any) => payment.status !== TelegramAdSalePaymentStatus.VOIDED,
    );
    const totalAgreedAmount = placements.reduce(
      (sum: Prisma.Decimal, placement: any) => sum.add(decimal(placement.agreedPrice)),
      decimal(0),
    );
    const totalRecommendedAmount = placements.reduce(
      (sum: Prisma.Decimal, placement: any) =>
        sum.add(decimal(placement.recommendedPrice)),
      decimal(0),
    );
    const totalMinimumAmount = placements.reduce(
      (sum: Prisma.Decimal, placement: any) => sum.add(decimal(placement.minimumPrice)),
      decimal(0),
    );
    const totalPaidAmount = payments.reduce(
      (sum: Prisma.Decimal, payment: any) => sum.add(decimal(payment.amount)),
      decimal(0),
    );
    const totalAmountInPrimaryCurrency = payments.reduce(
      (sum: Prisma.Decimal, payment: any) =>
        sum.add(decimal(payment.amountInPrimaryCurrency)),
      decimal(0),
    );
    const outstandingAmount =
      totalPaidAmount.gte(totalAgreedAmount)
        ? decimal(0)
        : totalAgreedAmount.sub(totalPaidAmount);
    const overpaidAmount =
      totalPaidAmount.gt(totalAgreedAmount)
        ? totalPaidAmount.sub(totalAgreedAmount)
        : decimal(0);

    const channelBreakdown = placements.map((placement: any) => ({
      placementId: placement.id,
      channelId: placement.telegramChannelId,
      agreedPrice: decimalToString(decimal(placement.agreedPrice)),
      paidAllocatedAmount: decimalToString(placement.paidAllocatedAmount),
      unpaidAmount: decimalToString(placement.unpaidAmount),
      recommendedPrice: decimalToString(decimal(placement.recommendedPrice)),
      minimumPrice: decimalToString(decimal(placement.minimumPrice)),
      underpricingAmount: decimalToString(placement.underpricingAmount),
      underpricingPercent: decimalToString(placement.underpricingPercent),
      status: placement.status,
    }));

    return {
      placements,
      payments,
      summary: {
        placementsCount: placements.length,
        totalAgreedAmount: decimalToString(totalAgreedAmount),
        totalRecommendedAmount: decimalToString(totalRecommendedAmount),
        totalMinimumAmount: decimalToString(totalMinimumAmount),
        totalPaidAmount: decimalToString(totalPaidAmount),
        outstandingAmount: decimalToString(outstandingAmount),
        overpaidAmount: decimalToString(overpaidAmount),
        paymentStatus: this.paymentStatusFromTotals(totalPaidAmount, totalAgreedAmount),
        totalAmountInPrimaryCurrency: decimalToString(totalAmountInPrimaryCurrency),
        channelBreakdown,
      },
    };
  }

  private async getSaleDetails(workspaceId: string, id: string) {
    const sale = await this.prisma.telegramAdSale.findFirst({
      where: { id, workspaceId },
      include: this.includeSaleRelations(),
    });
    if (!sale) throw new NotFoundException('Telegram ad sale not found');
    return sale;
  }

  private analyticsRange(query?: TelegramAdAnalyticsQueryDto) {
    const timezone = query?.timezone?.trim() || 'UTC';
    const now = new Date();
    const fallbackDays = Math.max(1, Math.min(366, query?.rangeDays ?? 30));
    const fallbackFrom = new Date(now.getTime() - (fallbackDays - 1) * 24 * 60 * 60 * 1000);
    const rawFrom = query?.dateFrom || query?.from ? new Date(query.dateFrom ?? query.from!) : fallbackFrom;
    const rawTo = query?.dateTo || query?.to ? new Date(query.dateTo ?? query.to!) : now;
    const from = Number.isNaN(rawFrom.getTime()) ? fallbackFrom : rawFrom;
    const to = Number.isNaN(rawTo.getTime()) ? now : rawTo;
    const normalized = from <= to ? { from, to } : { from: to, to: from };
    const days = Math.floor((normalized.to.getTime() - normalized.from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (days > 366) {
      throw new BadRequestException('Analytics range cannot exceed 366 days');
    }
    return { ...normalized, timezone };
  }

  private analyticsDateRules() {
    return [
      {
        metric: 'revenue.totalAgreedRevenue',
        dateField: 'placementScheduledAt',
        description: 'Agreed placement revenue is attributed by placement scheduledAt.',
      },
      {
        metric: 'revenue.totalPaidRevenue',
        dateField: 'paymentPaidAt',
        description: 'Paid revenue is attributed by payment paidAt.',
      },
      {
        metric: 'placements.*',
        dateField: 'placementScheduledAt',
        description: 'Placement and inventory metrics are attributed by placement scheduledAt.',
      },
      {
        metric: 'performance.actualViews*',
        dateField: 'placementPublishedAt',
        description: 'Actual performance metrics are attributed by placement publishedAt when present.',
      },
      {
        metric: 'operations.overdueUnpaidSales',
        dateField: 'saleCreatedAt',
        description: 'Overdue unpaid sales use sale createdAt for aging and current outstanding state.',
      },
    ] as const;
  }

  private medianDecimal(values: Prisma.Decimal[]) {
    if (!values.length) return decimal(0);
    const sorted = [...values].sort((left, right) =>
      left.comparedTo(right),
    );
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[middle];
    return sorted[middle - 1].add(sorted[middle]).div(2);
  }

  private bucketDate(value: Date, granularity: 'day' | 'week' | 'month') {
    const date = new Date(value);
    if (granularity === 'month') {
      date.setUTCDate(1);
    } else if (granularity === 'week') {
      const day = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() - day + 1);
    }
    date.setUTCHours(0, 0, 0, 0);
    return date.toISOString().slice(0, 10);
  }

  private async inventorySlotsForChannels(params: {
    workspaceId: string;
    channelIds: string[];
    from: Date;
    to: Date;
  }) {
    if (!params.channelIds.length) return [] as Array<any>;
    const channels = await this.prisma.telegramChannel.findMany({
      where: {
        workspaceId: params.workspaceId,
        id: { in: params.channelIds },
      },
      include: {
        timePosts: { orderBy: [{ position: 'asc' }, { time: 'asc' }] },
      },
    });
    await Promise.all(
      channels.map((channel) =>
        this.ensureDefaultProductsForChannel({
          workspaceId: params.workspaceId,
          channelId: channel.id,
          currency: channel.adBaseCurrency || 'USD',
        }),
      ),
    );
    const [policies, products, placements] = await Promise.all([
      this.prisma.telegramAdSchedulePolicy.findMany({
        where: {
          workspaceId: params.workspaceId,
          telegramChannelId: { in: params.channelIds },
        },
      }),
      this.prisma.telegramAdProduct.findMany({
        where: {
          workspaceId: params.workspaceId,
          telegramChannelId: { in: params.channelIds },
          isActive: true,
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.telegramAdSalePlacement.findMany({
        where: {
          workspaceId: params.workspaceId,
          telegramChannelId: { in: params.channelIds },
          scheduledAt: {
            gte: new Date(params.from.getTime() - 7 * 24 * 60 * 60 * 1000),
            lte: new Date(params.to.getTime() + 24 * 60 * 60 * 1000),
          },
        },
        select: {
          id: true,
          telegramAdSaleId: true,
          telegramChannelId: true,
          status: true,
          scheduledAt: true,
        },
      }),
    ]);
    const slots: Array<any> = [];
    for (const channel of channels) {
      const policy =
        policies.find((item) => item.telegramChannelId === channel.id) ??
        (await this.resolvePolicy(params.workspaceId, channel.id, 'UTC'));
      const product = products.find((item) => item.telegramChannelId === channel.id) ?? null;
      const pricingPreview = await this.buildProductPricingPreview(
        params.workspaceId,
        channel,
        product,
      );
      for (
        let cursor = new Date(params.from);
        cursor <= params.to;
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
      ) {
        const dateKey = utcDateKey(cursor, policy.timezone);
        const dayPlacements = placements.filter(
          (placement) =>
            placement.telegramChannelId === channel.id &&
            utcDateKey(placement.scheduledAt, policy.timezone) === dateKey &&
            placement.status !== TelegramAdPlacementStatus.CANCELLED,
        );
        const daySlots = buildAvailabilitySlots({
          now: new Date(),
          dateKey,
          policy: {
            timezone: policy.timezone,
            slotStrategy: policy.slotStrategy,
            fallbackSlotTimes: policy.fallbackSlotTimes,
            allowManualSlots: policy.allowManualSlots,
            organicPostsPerAdSlot: policy.organicPostsPerAdSlot,
            maxAdsPerDay: policy.maxAdsPerDay,
            minHoursBetweenAds: policy.minHoursBetweenAds,
            minDaysBetweenAds: policy.minDaysBetweenAds,
          },
          product: {
            id: product?.id ?? null,
            topDurationMinutes: product?.topDurationMinutes ?? null,
            currency: pricingPreview.currency,
            expectedViews: pricingPreview.expectedViews ?? 0,
            recommendedPrice: pricingPreview.recommendedPrice,
            minimumPrice: pricingPreview.minimumPrice,
          },
          organicTimes:
            policy.slotStrategy === TelegramAdSlotStrategy.FIXED_TIMES
              ? policy.fallbackSlotTimes
              : channel.timePosts.map((timePost) => timePost.time),
          organicScheduledAt: channel.timePosts.map((timePost) =>
            zonedDateTimeToUtc(dateKey, timePost.time, policy.timezone),
          ),
          placements: dayPlacements.map((placement) => ({
            id: placement.id,
            saleId: placement.telegramAdSaleId,
            status: placement.status,
            scheduledAt: placement.scheduledAt,
          })),
        });
        slots.push(
          ...daySlots.map((slot) => ({
            ...slot,
            channelId: channel.id,
            date: dateKey,
          })),
        );
      }
    }
    return slots;
  }

  private summarizeInventory(slots: Array<any>) {
    const eligibleSlots = slots.filter((slot) => slot.state !== 'MANUAL_ONLY');
    const soldSlots = eligibleSlots.filter((slot) => slot.state === 'SOLD');
    const reservedSlots = eligibleSlots.filter((slot) => slot.state === 'RESERVED');
    const publishedSlots = soldSlots.filter(
      (slot) => slot.existingPlacement?.status === TelegramAdPlacementStatus.PUBLISHED,
    );
    const blockedSlots = slots.filter(
      (slot) =>
        slot.state === 'BLOCKED_BY_POLICY' ||
        slot.state === 'CONFLICT_WITH_AD' ||
        slot.state === 'CONFLICT_WITH_ORGANIC_POST' ||
        slot.state === 'MANUAL_ONLY',
    );
    const pastUnusedSlots = eligibleSlots.filter((slot) => slot.state === 'PAST');
    return {
      eligibleSlots: eligibleSlots.length,
      availableSlots: eligibleSlots.filter((slot) => slot.state === 'AVAILABLE').length,
      reservedSlots: reservedSlots.length,
      soldSlots: soldSlots.length,
      publishedSlots: publishedSlots.length,
      blockedSlots: blockedSlots.length,
      pastUnusedSlots: pastUnusedSlots.length,
      bookingFillRate: eligibleSlots.length
        ? soldSlots.length / eligibleSlots.length
        : 0,
      publishedFillRate: eligibleSlots.length
        ? publishedSlots.length / eligibleSlots.length
        : 0,
    };
  }

  private async adAnalyticsDataset(params: {
    workspaceId: string;
    from: Date;
    to: Date;
    channelIds?: string[];
    networkId?: string | null;
    networkMode?: 'SALE_CONTEXT' | 'CURRENT_CHANNELS';
  }) {
    const where: Prisma.TelegramAdSalePlacementWhereInput = {
      workspaceId: params.workspaceId,
      ...(params.networkId && params.networkMode !== 'CURRENT_CHANNELS'
        ? { telegramChannelNetworkId: params.networkId }
        : {}),
      ...(params.channelIds?.length
        ? { telegramChannelId: { in: params.channelIds } }
        : {}),
      OR: [
        { scheduledAt: { gte: params.from, lte: params.to } },
        { publishedAt: { gte: params.from, lte: params.to } },
        { sale: { createdAt: { gte: params.from, lte: params.to } } },
      ],
    };
    const placements = await this.prisma.telegramAdSalePlacement.findMany({
      where,
      select: {
        id: true,
        workspaceId: true,
        telegramAdSaleId: true,
        telegramChannelId: true,
        telegramChannelNetworkId: true,
        telegramAdProductId: true,
        pricingSnapshotId: true,
        status: true,
        scheduledAt: true,
        timezone: true,
        expectedViews: true,
        recommendedPrice: true,
        minimumPrice: true,
        agreedPrice: true,
        currency: true,
        publishedAt: true,
        plannedDeleteAt: true,
        deletedAt: true,
        lastDeletionError: true,
        actualViews24h: true,
        actualViews48h: true,
        actualViewsFinal: true,
        actualCpm: true,
        createdAt: true,
        sale: {
          select: {
            id: true,
            advertiserName: true,
            status: true,
            createdAt: true,
            settlementCurrency: true,
          },
        },
        paymentAllocations: {
          select: {
            amount: true,
            amountInPrimaryCurrency: true,
            payment: {
              select: {
                status: true,
                paidAt: true,
                amount: true,
                amountInPrimaryCurrency: true,
                currency: true,
              },
            },
          },
        },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    });
    const paymentWhere: Prisma.TelegramAdSalePaymentWhereInput = {
      workspaceId: params.workspaceId,
      status: { not: TelegramAdSalePaymentStatus.VOIDED },
      paidAt: { gte: params.from, lte: params.to },
      ...(params.networkId || params.channelIds?.length
        ? {
            sale: {
              placements: {
                some: {
                  ...(params.networkId && params.networkMode !== 'CURRENT_CHANNELS'
                    ? { telegramChannelNetworkId: params.networkId }
                    : {}),
                  ...(params.channelIds?.length
                    ? { telegramChannelId: { in: params.channelIds } }
                    : {}),
                },
              },
            },
          }
        : {}),
    };
    const payments = await this.prisma.telegramAdSalePayment.findMany({
      where: paymentWhere,
      select: {
        id: true,
        paidAt: true,
        amount: true,
        amountInPrimaryCurrency: true,
        currency: true,
        sale: { select: { id: true } },
      },
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
    });
    const channelIds = [
      ...new Set(placements.map((placement) => placement.telegramChannelId)),
    ];
    const channels = channelIds.length
      ? await this.prisma.telegramChannel.findMany({
          where: {
            workspaceId: params.workspaceId,
            id: { in: channelIds },
          },
          select: {
            id: true,
            title: true,
            username: true,
          },
        })
      : [];
    return { placements, payments, channels };
  }

  private analyticsChannelIds(query: TelegramAdAnalyticsQueryDto) {
    return query.channelIds?.length ? query.channelIds : undefined;
  }

  private sumPaidAllocations(
    placements: Array<{
      paymentAllocations?: Array<{
        amount: Prisma.Decimal | string | number;
        payment?: { status?: TelegramAdSalePaymentStatus | null } | null;
      }>;
    }>,
  ) {
    return placements.reduce(
      (sum, placement) =>
        sum.add(
          (placement.paymentAllocations ?? []).reduce(
            (inner, allocation) =>
              allocation.payment?.status === TelegramAdSalePaymentStatus.VOIDED
                ? inner
                : inner.add(decimal(allocation.amount)),
            decimal(0),
          ),
        ),
      decimal(0),
    );
  }

  private commonCurrency(
    items: Array<{ currency?: string | null }>,
  ): string | null {
    const currencies = [
      ...new Set(
        items
          .map((item) => item.currency?.toUpperCase())
          .filter((currency): currency is string => Boolean(currency)),
      ),
    ];
    return currencies.length === 1 ? currencies[0] : null;
  }

  private startOfUtcDay(value: Date) {
    const date = new Date(value);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  private endOfUtcDay(value: Date) {
    const date = new Date(value);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private listDatesInRange(from: Date, to: Date) {
    const dates: Date[] = [];
    for (
      let cursor = this.startOfUtcDay(from);
      cursor <= to;
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    ) {
      dates.push(new Date(cursor));
    }
    return dates;
  }

  private comparisonPeriods(query: TelegramAdAnalyticsQueryDto, from: Date, to: Date) {
    const mode = query.compareMode ?? 'PREVIOUS_PERIOD';
    const daysCount =
      Math.floor((this.endOfUtcDay(to).getTime() - this.startOfUtcDay(from).getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (mode === 'NONE') return null;
    if (mode === 'CUSTOM' && query.compareDateFrom && query.compareDateTo) {
      const compareFrom = this.startOfUtcDay(new Date(query.compareDateFrom));
      const compareTo = this.endOfUtcDay(new Date(query.compareDateTo));
      return { mode, from: compareFrom, to: compareTo, daysCount };
    }
    if (mode === 'PREVIOUS_30_DAYS') {
      const compareTo = new Date(this.startOfUtcDay(from).getTime() - 1);
      const compareFrom = new Date(compareTo.getTime() - 29 * 24 * 60 * 60 * 1000);
      return { mode, from: this.startOfUtcDay(compareFrom), to: this.endOfUtcDay(compareTo), daysCount: 30 };
    }
    if (mode === 'PREVIOUS_MONTH') {
      const compareTo = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 0, 23, 59, 59, 999));
      const compareFrom = new Date(Date.UTC(compareTo.getUTCFullYear(), compareTo.getUTCMonth(), 1, 0, 0, 0, 0));
      return {
        mode,
        from: compareFrom,
        to: compareTo,
        daysCount:
          Math.floor((compareTo.getTime() - compareFrom.getTime()) / (24 * 60 * 60 * 1000)) + 1,
      };
    }
    const compareTo = new Date(this.startOfUtcDay(from).getTime() - 1);
    const compareFrom = new Date(compareTo.getTime() - (daysCount - 1) * 24 * 60 * 60 * 1000);
    return { mode, from: this.startOfUtcDay(compareFrom), to: this.endOfUtcDay(compareTo), daysCount };
  }

  private async resolveAnalyticsChannelIds(params: {
    workspaceId: string;
    channelId?: string;
    networkId?: string;
    networkMode?: 'SALE_CONTEXT' | 'CURRENT_CHANNELS';
  }) {
    if (params.channelId) return [params.channelId];
    if (params.networkId) {
      const network = await this.findWorkspaceNetwork(params.workspaceId, params.networkId);
      return network.channels.map((item) => item.telegramChannelId);
    }
    return (
      await this.prisma.telegramChannel.findMany({
        where: { workspaceId: params.workspaceId, isActive: true },
        select: { id: true },
      })
    ).map((channel) => channel.id);
  }

  private async buildInventorySnapshotForDate(params: {
    workspaceId: string;
    channelId: string;
    date: Date;
    force?: boolean;
  }) {
    const dayStart = this.startOfUtcDay(params.date);
    const dayEnd = this.endOfUtcDay(params.date);
    await this.findWorkspaceChannel(params.workspaceId, params.channelId);
    const policy =
      (await this.prisma.telegramAdSchedulePolicy.findFirst({
        where: { workspaceId: params.workspaceId, telegramChannelId: params.channelId },
      })) ?? (await this.resolvePolicy(params.workspaceId, params.channelId, 'UTC'));
    const products = await this.prisma.telegramAdProduct.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.channelId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        currency: true,
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    const slots = await this.inventorySlotsForChannels({
      workspaceId: params.workspaceId,
      channelIds: [params.channelId],
      from: dayStart,
      to: dayEnd,
    });
    const channelSlots = slots.filter((slot) => slot.channelId === params.channelId);
    const placements = await this.prisma.telegramAdSalePlacement.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.channelId,
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      select: {
        id: true,
        status: true,
        expectedViews: true,
        actualViewsFinal: true,
        recommendedPrice: true,
        minimumPrice: true,
        agreedPrice: true,
        paymentAllocations: {
          select: {
            amount: true,
            payment: { select: { status: true } },
          },
        },
      },
    });
    const inventory = this.summarizeInventory(channelSlots);
    const bookedPlacements = placements.filter((placement) =>
      ACTIVE_TELEGRAM_AD_PLACEMENT_STATUSES.includes(placement.status),
    );
    const publishedPlacements = placements.filter((placement) =>
      placement.status === TelegramAdPlacementStatus.PUBLISHED ||
      placement.status === TelegramAdPlacementStatus.COMPLETED,
    );
    const cancelledPlacements = placements.filter(
      (placement) => placement.status === TelegramAdPlacementStatus.CANCELLED,
    );
    const agreedRevenue = publishedPlacements.reduce(
      (sum, placement) => sum.add(decimal(placement.agreedPrice)),
      decimal(0),
    );
    const paidRevenue = publishedPlacements.reduce(
      (sum, placement) =>
        sum.add(
          placement.paymentAllocations.reduce(
            (inner, allocation) =>
              allocation.payment.status === TelegramAdSalePaymentStatus.VOIDED
                ? inner
                : inner.add(decimal(allocation.amount)),
            decimal(0),
          ),
        ),
      decimal(0),
    );
    const underpricingLoss = bookedPlacements.reduce((sum, placement) => {
      const recommended = decimal(placement.recommendedPrice);
      const agreed = decimal(placement.agreedPrice);
      return sum.add(recommended.gt(agreed) ? recommended.sub(agreed) : decimal(0));
    }, decimal(0));
    const recommendedInventoryRevenue = channelSlots.reduce(
      (sum, slot) =>
        slot.state === 'MANUAL_ONLY' ? sum : sum.add(decimal(slot.recommendedPrice)),
      decimal(0),
    );
    const minimumInventoryRevenue = channelSlots.reduce(
      (sum, slot) =>
        slot.state === 'MANUAL_ONLY' ? sum : sum.add(decimal(slot.minimumPrice)),
      decimal(0),
    );
    const unsoldInventoryOpportunity = channelSlots.reduce((sum, slot) => {
      if (slot.state === 'AVAILABLE' || slot.state === 'PAST') {
        return sum.add(decimal(slot.recommendedPrice));
      }
      return sum;
    }, decimal(0));
    const expectedViews = bookedPlacements.reduce(
      (sum, placement) => sum + placement.expectedViews,
      0,
    );
    const actualViews = publishedPlacements.reduce(
      (sum, placement) => sum + (placement.actualViewsFinal ?? 0),
      0,
    );

    return {
      workspaceId: params.workspaceId,
      telegramChannelId: params.channelId,
      date: dayStart,
      timezone: policy.timezone,
      eligibleSlots: inventory.eligibleSlots,
      bookedSlots: bookedPlacements.length,
      publishedSlots: publishedPlacements.length,
      cancelledSlots: cancelledPlacements.length,
      missedSlots: inventory.pastUnusedSlots,
      blockedSlots: inventory.blockedSlots,
      recommendedInventoryRevenue,
      minimumInventoryRevenue,
      agreedRevenue,
      paidRevenue,
      outstandingRevenue: agreedRevenue.sub(paidRevenue),
      underpricingLoss,
      unsoldInventoryOpportunity,
      expectedViews,
      actualViews,
      policySnapshot: {
        timezone: policy.timezone,
        maxAdsPerDay: policy.maxAdsPerDay,
        minHoursBetweenAds: policy.minHoursBetweenAds,
        minDaysBetweenAds: policy.minDaysBetweenAds,
        slotStrategy: policy.slotStrategy,
        fallbackSlotTimes: policy.fallbackSlotTimes,
      },
      productSnapshot: products.map((product) => ({
        id: product.id,
        name: product.name,
        isActive: product.isActive,
        currency: product.currency,
      })),
      pricingSnapshot: {
        eligibleSlots: channelSlots.map((slot) => ({
          scheduledAt: slot.scheduledAt.toISOString(),
          recommendedPrice: slot.recommendedPrice,
          minimumPrice: slot.minimumPrice,
        })),
      },
      calculationVersion: 'inventory-v1',
      calculatedAt: new Date(),
    };
  }

  private async saveInventorySnapshot(snapshot: Awaited<ReturnType<TelegramAdSalesService['buildInventorySnapshotForDate']>>, options?: { force?: boolean }) {
    const recalculationCutoff = this.startOfUtcDay(new Date());
    recalculationCutoff.setUTCDate(recalculationCutoff.getUTCDate() - 7);
    const canOverwrite = options?.force || snapshot.date >= recalculationCutoff;
    const existing = await this.prisma.telegramAdInventoryDailySnapshot.findFirst({
      where: {
        workspaceId: snapshot.workspaceId,
        telegramChannelId: snapshot.telegramChannelId,
        date: snapshot.date,
      },
      select: { id: true },
    });
    if (existing && !canOverwrite) {
      return { status: 'skipped' as const, snapshotId: existing.id };
    }
    const saved = existing
      ? await this.prisma.telegramAdInventoryDailySnapshot.update({
          where: { id: existing.id },
          data: snapshot,
        })
      : await this.prisma.telegramAdInventoryDailySnapshot.create({
          data: snapshot,
        });
    return { status: existing ? ('updated' as const) : ('created' as const), snapshotId: saved.id };
  }

  private async loadInventorySnapshots(params: {
    workspaceId: string;
    channelIds: string[];
    from: Date;
    to: Date;
  }) {
    return this.prisma.telegramAdInventoryDailySnapshot.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: { in: params.channelIds },
        date: { gte: this.startOfUtcDay(params.from), lte: this.startOfUtcDay(params.to) },
      },
      orderBy: [{ date: 'asc' }, { telegramChannelId: 'asc' }],
    });
  }

  private aggregateInventorySnapshots(items: Array<any>) {
    const zero = decimal(0);
    const total = items.reduce(
      (acc, item) => ({
        eligibleSlots: acc.eligibleSlots + item.eligibleSlots,
        bookedSlots: acc.bookedSlots + item.bookedSlots,
        publishedSlots: acc.publishedSlots + item.publishedSlots,
        cancelledSlots: acc.cancelledSlots + item.cancelledSlots,
        missedSlots: acc.missedSlots + item.missedSlots,
        blockedSlots: acc.blockedSlots + item.blockedSlots,
        recommendedInventoryRevenue: acc.recommendedInventoryRevenue.add(item.recommendedInventoryRevenue),
        minimumInventoryRevenue: acc.minimumInventoryRevenue.add(item.minimumInventoryRevenue),
        agreedRevenue: acc.agreedRevenue.add(item.agreedRevenue),
        paidRevenue: acc.paidRevenue.add(item.paidRevenue),
        outstandingRevenue: acc.outstandingRevenue.add(item.outstandingRevenue),
        underpricingLoss: acc.underpricingLoss.add(item.underpricingLoss),
        unsoldInventoryOpportunity: acc.unsoldInventoryOpportunity.add(item.unsoldInventoryOpportunity),
        expectedViews: acc.expectedViews + item.expectedViews,
        actualViews: acc.actualViews + item.actualViews,
      }),
      {
        eligibleSlots: 0,
        bookedSlots: 0,
        publishedSlots: 0,
        cancelledSlots: 0,
        missedSlots: 0,
        blockedSlots: 0,
        recommendedInventoryRevenue: zero,
        minimumInventoryRevenue: zero,
        agreedRevenue: zero,
        paidRevenue: zero,
        outstandingRevenue: zero,
        underpricingLoss: zero,
        unsoldInventoryOpportunity: zero,
        expectedViews: 0,
        actualViews: 0,
      },
    );
    const averageAgreedPrice =
      total.bookedSlots > 0 ? total.agreedRevenue.div(total.bookedSlots) : zero;
    const averageRecommendedPrice =
      total.eligibleSlots > 0
        ? total.recommendedInventoryRevenue.div(total.eligibleSlots)
        : zero;
    const averageMinimumPrice =
      total.eligibleSlots > 0 ? total.minimumInventoryRevenue.div(total.eligibleSlots) : zero;
    return {
      ...total,
      bookingFillRate: total.eligibleSlots ? (total.bookedSlots / total.eligibleSlots) * 100 : 0,
      publishedFillRate: total.eligibleSlots ? (total.publishedSlots / total.eligibleSlots) * 100 : 0,
      cancellationRate: total.bookedSlots ? (total.cancelledSlots / total.bookedSlots) * 100 : 0,
      averageAgreedPrice,
      medianAgreedPrice: averageAgreedPrice,
      averageRecommendedPrice,
      averageMinimumPrice,
      revenuePerEligibleSlot:
        total.eligibleSlots > 0 ? total.agreedRevenue.div(total.eligibleSlots) : zero,
      revenuePerPublishedSlot:
        total.publishedSlots > 0 ? total.agreedRevenue.div(total.publishedSlots) : zero,
      inventoryRevenueEfficiency:
        total.recommendedInventoryRevenue.gt(0)
          ? Number(total.agreedRevenue.div(total.recommendedInventoryRevenue).mul(100).toFixed(2))
          : 0,
      totalMonetizationGap: total.unsoldInventoryOpportunity.add(total.underpricingLoss),
      expectedCpm:
        total.expectedViews > 0 ? total.agreedRevenue.div(total.expectedViews).mul(1000) : zero,
      effectiveCpm:
        total.actualViews > 0 ? total.agreedRevenue.div(total.actualViews).mul(1000) : zero,
    };
  }

  async listProducts(userId: string, query: TelegramAdProductsQueryDto) {
    const workspaceId = await this.workspace(userId);
    const pagination = normalizePagination(query);
    const where: Prisma.TelegramAdProductWhereInput = {
      workspaceId,
      ...(query.telegramChannelId ? { telegramChannelId: query.telegramChannelId } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramAdProduct.findMany({
        where,
        orderBy: [{ telegramChannelId: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramAdProduct.count({ where }),
    ]);
    return createPaginatedResponse(items.map((item) => this.mapProduct(item)), totalItems, pagination);
  }

  async listChannelProducts(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.findWorkspaceChannel(workspaceId, channelId);
    await this.ensureDefaultProductsForChannel({
      workspaceId,
      channelId,
      currency: channel.adBaseCurrency || 'USD',
    });
    const products = await this.prisma.telegramAdProduct.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: [{ isActive: 'desc' }, { position: 'asc' }, { createdAt: 'asc' }],
    });
    return Promise.all(
      products.map(async (product) => {
        const preview = await this.buildProductPricingPreview(workspaceId, channel, product);
        return this.mapProduct({
          ...product,
          pricingWindowHours: preview.pricingWindowHours,
          pricingWindowLabel: preview.pricingWindowLabel,
          estimatedViews: preview.expectedViews,
          estimatedPrice: decimal(preview.recommendedPrice),
        });
      }),
    );
  }

  async createProduct(userId: string, channelId: string, dto: CreateTelegramAdProductDto) {
    const workspaceId = await this.workspace(userId);
    await this.findWorkspaceChannel(workspaceId, channelId);
    const product = await this.prisma.telegramAdProduct.create({
      data: {
        workspaceId,
        telegramChannelId: channelId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        topDurationMinutes: dto.topDurationMinutes ?? null,
        feedDurationHours: dto.feedDurationHours ?? null,
        deleteAfterHours: dto.deleteAfterHours ?? null,
        isPermanent: dto.isPermanent ?? false,
        defaultPricingMode: dto.defaultPricingMode,
        defaultCpm: decimalOrNull(dto.defaultCpm),
        defaultFixedPrice: decimalOrNull(dto.defaultFixedPrice),
        minimumPrice: decimalOrNull(dto.minimumPrice),
        currency: dto.currency,
        isActive: dto.isActive ?? true,
        position: dto.position ?? 0,
      },
    });
    this.invalidateAvailabilityCache(workspaceId);
    return this.mapProduct(product);
  }

  async updateProduct(userId: string, id: string, dto: UpdateTelegramAdProductDto) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramAdProduct.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Telegram ad product not found');
    const product = await this.prisma.telegramAdProduct.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.description === undefined ? {} : { description: dto.description?.trim() || null }),
        ...(dto.topDurationMinutes === undefined ? {} : { topDurationMinutes: dto.topDurationMinutes }),
        ...(dto.feedDurationHours === undefined ? {} : { feedDurationHours: dto.feedDurationHours }),
        ...(dto.deleteAfterHours === undefined ? {} : { deleteAfterHours: dto.deleteAfterHours }),
        ...(dto.isPermanent === undefined ? {} : { isPermanent: dto.isPermanent }),
        ...(dto.defaultPricingMode === undefined ? {} : { defaultPricingMode: dto.defaultPricingMode }),
        ...(dto.defaultCpm === undefined ? {} : { defaultCpm: decimalOrNull(dto.defaultCpm) }),
        ...(dto.defaultFixedPrice === undefined ? {} : { defaultFixedPrice: decimalOrNull(dto.defaultFixedPrice) }),
        ...(dto.minimumPrice === undefined ? {} : { minimumPrice: decimalOrNull(dto.minimumPrice) }),
        ...(dto.currency === undefined ? {} : { currency: dto.currency }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        ...(dto.position === undefined ? {} : { position: dto.position }),
      },
    });
    this.invalidateAvailabilityCache(workspaceId);
    return this.mapProduct(product);
  }

  async deactivateProduct(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramAdProduct.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Telegram ad product not found');
    const normalizedName = this.normalizeDefaultProductName(existing.name);
    const isDefaultFormat = this.defaultProductTemplates().some(
      (template) => this.normalizeDefaultProductName(template.name) === normalizedName,
    );
    if (isDefaultFormat) {
      throw new BadRequestException('Default placement formats cannot be removed');
    }
    await this.prisma.telegramAdProduct.delete({
      where: { id },
    });
    this.invalidateAvailabilityCache(workspaceId);
    return { success: true };
  }

  async getAdSalesWorkspaceSettings(userId: string) {
    const workspaceId = await this.workspace(userId);
    return this.mapAdSalesWorkspaceSettings(
      await this.resolveAdSalesWorkspaceSettings(workspaceId),
    );
  }

  async updateAdSalesWorkspaceSettings(
    userId: string,
    dto: UpdateTelegramAdSalesWorkspaceSettingsDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const settings = await this.prisma.telegramAdSalesWorkspaceSettings.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        defaultOrganicPostsPerAdSlot: dto.defaultOrganicPostsPerAdSlot ?? 3,
      },
      update: {
        ...(dto.defaultOrganicPostsPerAdSlot === undefined
          ? {}
          : { defaultOrganicPostsPerAdSlot: dto.defaultOrganicPostsPerAdSlot }),
      },
    });
    this.invalidateAvailabilityCache(workspaceId);
    return this.mapAdSalesWorkspaceSettings(settings);
  }

  async getAdSalesMemberPreferences(userId: string) {
    const membership = await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const existing = await this.prisma.telegramAdSalesMemberPreferences.findUnique({
      where: { workspaceMemberId: membership.id },
    });
    if (existing) return this.mapAdSalesMemberPreferences(existing);
    const preferences = await this.prisma.telegramAdSalesMemberPreferences.create({
      data: {
        workspaceId: membership.workspaceId,
        workspaceMemberId: membership.id,
        selectedChannelIds: [],
        selectedNetworkId: null,
        calendarView: 'week',
        initialized: false,
      },
    });
    return this.mapAdSalesMemberPreferences(preferences);
  }

  async updateAdSalesMemberPreferences(
    userId: string,
    dto: UpdateTelegramAdSalesMemberPreferencesDto,
  ) {
    const membership = await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const update: Prisma.TelegramAdSalesMemberPreferencesUpdateInput = {};
    const create: Prisma.TelegramAdSalesMemberPreferencesCreateInput = {
      workspace: { connect: { id: membership.workspaceId } },
      workspaceMember: { connect: { id: membership.id } },
      selectedChannelIds: [],
      selectedNetworkId: null,
      calendarView: 'week',
      initialized: false,
    };
    if (dto.selectedChannelIds !== undefined) {
      const uniqueIds = Array.from(new Set(dto.selectedChannelIds));
      if (uniqueIds.length) {
        const count = await this.prisma.telegramChannel.count({
          where: { workspaceId: membership.workspaceId, id: { in: uniqueIds } },
        });
        if (count !== uniqueIds.length) {
          throw new BadRequestException('Some selected channels do not belong to workspace');
        }
      }
      update.selectedChannelIds = uniqueIds;
      create.selectedChannelIds = uniqueIds;
    }
    if (dto.selectedNetworkId !== undefined) {
      if (dto.selectedNetworkId) {
        await this.findWorkspaceNetwork(membership.workspaceId, dto.selectedNetworkId);
      }
      update.selectedNetworkId = dto.selectedNetworkId;
      create.selectedNetworkId = dto.selectedNetworkId;
    }
    if (dto.calendarView !== undefined) {
      update.calendarView = dto.calendarView;
      create.calendarView = dto.calendarView;
    }
    if (dto.initialized !== undefined) {
      update.initialized = dto.initialized;
      create.initialized = dto.initialized;
    }
    const preferences = await this.prisma.telegramAdSalesMemberPreferences.upsert({
      where: { workspaceMemberId: membership.id },
      create,
      update,
    });
    return this.mapAdSalesMemberPreferences(preferences);
  }

  async getPolicy(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    await this.findWorkspaceChannel(workspaceId, channelId);
    const workspaceTimezone = await this.resolveWorkspaceTimezone(workspaceId);
    return this.mapPolicy(await this.resolvePolicy(workspaceId, channelId, workspaceTimezone));
  }

  async upsertPolicy(userId: string, channelId: string, dto: UpdateTelegramAdPolicyDto) {
    const workspaceId = await this.workspace(userId);
    await this.findWorkspaceChannel(workspaceId, channelId);
    const workspaceTimezone = await this.resolveWorkspaceTimezone(workspaceId);
    const defaults = this.policyDefaults(workspaceTimezone);
    const useWorkspaceDefault = dto.useWorkspaceDefault ?? false;
    const organicPostsPerAdSlot = dto.organicPostsPerAdSlot ?? defaults.organicPostsPerAdSlot;
    const policy = await this.prisma.telegramAdSchedulePolicy.upsert({
      where: { telegramChannelId: channelId },
      create: {
        workspaceId,
        telegramChannelId: channelId,
        timezone: dto.timezone ?? workspaceTimezone,
        autoFrequencyEnabled: dto.autoFrequencyEnabled ?? true,
        expectedOrganicPostsPerDay: decimalOrNull(dto.expectedOrganicPostsPerDay),
        useWorkspaceDefault,
        organicPostsPerAdSlot,
        maxAdsPerDay: dto.maxAdsPerDay ?? defaults.maxAdsPerDay,
        minHoursBetweenAds: dto.minHoursBetweenAds ?? defaults.minHoursBetweenAds,
        minDaysBetweenAds: dto.minDaysBetweenAds ?? defaults.minDaysBetweenAds,
        slotStrategy: dto.slotStrategy ?? defaults.slotStrategy,
        fallbackSlotTimes: dto.fallbackSlotTimes ?? [],
        allowManualSlots: dto.allowManualSlots ?? false,
      },
      update: {
        timezone: dto.timezone ?? workspaceTimezone,
        ...(dto.autoFrequencyEnabled === undefined ? {} : { autoFrequencyEnabled: dto.autoFrequencyEnabled }),
        ...(dto.expectedOrganicPostsPerDay === undefined
          ? {}
          : { expectedOrganicPostsPerDay: decimalOrNull(dto.expectedOrganicPostsPerDay) }),
        ...(dto.useWorkspaceDefault === undefined ? {} : { useWorkspaceDefault }),
        ...(dto.organicPostsPerAdSlot === undefined ? {} : { organicPostsPerAdSlot }),
        ...(dto.maxAdsPerDay === undefined ? {} : { maxAdsPerDay: dto.maxAdsPerDay }),
        ...(dto.minHoursBetweenAds === undefined ? {} : { minHoursBetweenAds: dto.minHoursBetweenAds }),
        ...(dto.minDaysBetweenAds === undefined ? {} : { minDaysBetweenAds: dto.minDaysBetweenAds }),
        ...(dto.slotStrategy === undefined ? {} : { slotStrategy: dto.slotStrategy }),
        ...(dto.fallbackSlotTimes === undefined ? {} : { fallbackSlotTimes: dto.fallbackSlotTimes }),
        ...(dto.allowManualSlots === undefined ? {} : { allowManualSlots: dto.allowManualSlots }),
      },
    });
    this.invalidateAvailabilityCache(workspaceId);
    return this.mapPolicy(await this.resolvePolicy(workspaceId, channelId, workspaceTimezone));
  }

  async recommendPolicy(userId: string, channelId: string, dto: RecommendTelegramAdPolicyDto) {
    const workspaceId = await this.workspace(userId);
    await this.findWorkspaceChannel(workspaceId, channelId);
    const statisticsWindowDays = dto.statisticsWindowDays ?? 30;
    const from = new Date(Date.now() - statisticsWindowDays * 24 * 60 * 60 * 1000);
    const organicPosts = await this.prisma.telegramPost.count({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        postDate: { gte: from },
      },
    });
    const expectedOrganicPostsPerDay = organicPosts / statisticsWindowDays;
    return recommendPolicyFromOrganicPosts(expectedOrganicPostsPerDay);
  }

  async createQuote(userId: string, dto: CreateTelegramAdQuoteDto) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.findWorkspaceChannel(workspaceId, dto.telegramChannelId);
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const product = dto.telegramAdProductId
      ? await this.prisma.telegramAdProduct.findFirst({
          where: {
            id: dto.telegramAdProductId,
            workspaceId,
            telegramChannelId: dto.telegramChannelId,
          },
        })
      : null;
    if (dto.telegramAdProductId && !product) {
      throw new NotFoundException('Telegram ad product not found');
    }

    const pricingMode = dto.pricingMode ?? product?.defaultPricingMode ?? TelegramAdPricingMode.CPM;
    const quoteOverrides = {
      pricingMode,
      targetCpm: dto.targetCpm ?? channel.adBaseCpm ?? product?.defaultCpm ?? 0,
      minimumCpm: dto.minimumCpm ?? dto.targetCpm ?? channel.adBaseCpm ?? product?.defaultCpm ?? 0,
      fixedPrice: dto.fixedPrice ?? product?.defaultFixedPrice ?? 0,
      asOf: scheduledAt,
    };
    let preview = await this.buildProductPricingPreview(workspaceId, channel, product, quoteOverrides);
    if (scheduledAt && scheduledAt > new Date() && preview.expectedViews == null) {
      preview = await this.buildProductPricingPreview(workspaceId, channel, product, {
        ...quoteOverrides,
        asOf: null,
      });
    }
    if (preview.expectedViews == null) {
      return {
        snapshotId: null,
        expectedViews: null,
        targetCpm: preview.targetCpm,
        recommendedPrice: '0.00',
        minimumPrice: '0.00',
        currency: dto.currency ?? preview.currency,
        dataQuality: preview.dataQuality,
        warnings: preview.warnings.map((code) => ({
          code,
          message: code,
        })),
        sample: preview.sample.map((item) => ({
          ...item,
          date: item.date.toISOString(),
        })),
      };
    }

    const snapshot = await this.prisma.telegramAdPriceSnapshot.create({
      data: {
        workspaceId,
        telegramChannelId: channel.id,
        telegramAdProductId: product?.id ?? null,
        source: dto.source ?? 'quote',
        methodVersion: preview.methodVersion,
        statisticsWindowDays: 30,
        postsSampleCount: preview.postsSampleCount,
        expectedViews: preview.expectedViews,
        averageViews: decimalOrNull(preview.averageViews),
        medianViews: decimalOrNull(preview.medianViews),
        adjustedViews: decimalOrNull(preview.adjustedViews),
        targetCpm: decimal(preview.targetCpm),
        minimumCpm: decimal(preview.targetCpm),
        recommendedPrice: decimal(preview.recommendedPrice),
        minimumPrice: decimal(preview.minimumPrice),
        currency: dto.currency ?? preview.currency,
        metadata: {
          dataQuality: preview.dataQuality,
          warnings: preview.warnings,
          fallbackSource: preview.fallbackSource,
          pricingWindowHours: preview.pricingWindowHours,
          pricingWindowLabel: preview.pricingWindowLabel,
          pricedAt: scheduledAt?.toISOString() ?? null,
        },
      },
    });

    this.logger.info({
      event: 'telegram_ad_sales.quote_created',
      message: `Created price quote for channel ${channel.id}`,
      metadata: {
        channelId: channel.id,
        productId: product?.id ?? null,
        snapshotId: snapshot.id,
        pricedAt: scheduledAt?.toISOString() ?? null,
      },
    });

    return {
      snapshotId: snapshot.id,
      expectedViews: snapshot.expectedViews,
      targetCpm: decimalToString(snapshot.targetCpm),
      recommendedPrice: decimalToString(snapshot.recommendedPrice),
      minimumPrice: decimalToString(snapshot.minimumPrice),
      currency: snapshot.currency,
      dataQuality: preview.dataQuality,
      warnings: [...preview.warnings].map((code) => ({
        code,
        message: code,
      })),
    };
  }

  async priceHistory(userId: string, channelId: string, query: TelegramAdPriceHistoryQueryDto) {
    const workspaceId = await this.workspace(userId);
    await this.findWorkspaceChannel(workspaceId, channelId);
    const history = await this.prisma.telegramAdPriceSnapshot.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        ...(query.telegramAdProductId ? { telegramAdProductId: query.telegramAdProductId } : {}),
      },
      orderBy: { calculatedAt: 'desc' },
      take: query.limit ?? 50,
    });
    return history.map((item) => this.mapSnapshot(item));
  }

  async availability(userId: string, dto: TelegramAdAvailabilityQueryDto) {
    const workspaceId = await this.workspace(userId);
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    const days = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (days > 93) throw new BadRequestException('Availability range cannot exceed 93 days');
    if (!dto.channelIds?.length && !dto.networkId) {
      throw new BadRequestException('Provide channelIds or networkId');
    }
    let channelIds = dto.channelIds ?? [];
    if (dto.networkId) {
      const network = await this.findWorkspaceNetwork(workspaceId, dto.networkId);
      channelIds = network.channels.map((item) => item.telegramChannelId);
    }
    if (channelIds.length > 50) {
      throw new BadRequestException('Availability request cannot exceed 50 channels');
    }

    const cacheKey = this.availabilityCacheKey({
      workspaceId,
      channelIds,
      networkId: dto.networkId ?? null,
      productIds: dto.productIds,
      from: dto.from,
      to: dto.to,
      cacheBust: dto.cacheBust,
    });

    return this.responseCache.getOrSet(cacheKey, 30_000, async () => {

    const channels = await this.prisma.telegramChannel.findMany({
      where: { workspaceId, id: { in: channelIds } },
      include: { timePosts: { orderBy: [{ position: 'asc' }, { time: 'asc' }] } },
    });
    if (channels.length !== channelIds.length) {
      throw new BadRequestException('Some channels do not belong to selected workspace');
    }
    await Promise.all(
      channels.map((channel) =>
        this.ensureDefaultProductsForChannel({
          workspaceId,
          channelId: channel.id,
          currency: channel.adBaseCurrency || 'USD',
        }),
      ),
    );

    const historyWindowDays = 30;
    const historyFrom = new Date(
      from.getTime() - historyWindowDays * 24 * 60 * 60 * 1000,
    );
    const [products, placements, telegramPosts, managedOrganicPosts] = await Promise.all([
      this.prisma.telegramAdProduct.findMany({
        where: {
          workspaceId,
          telegramChannelId: { in: channelIds },
          isActive: true,
          ...(dto.productIds?.length ? { id: { in: dto.productIds } } : {}),
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.telegramAdSalePlacement.findMany({
        where: {
          workspaceId,
          telegramChannelId: { in: channelIds },
          status: { in: ACTIVE_TELEGRAM_AD_PLACEMENT_STATUSES },
          OR: [
            {
              scheduledAt: {
                gte: new Date(from.getTime() - 7 * 24 * 60 * 60 * 1000),
                lte: new Date(to.getTime() + 24 * 60 * 60 * 1000),
              },
            },
            { inventoryOpportunityKey: { not: null } },
          ],
        },
        include: { sale: { select: { id: true, title: true, status: true, settlementCurrency: true } } },
      }),
      this.prisma.telegramPost.findMany({
        where: {
          workspaceId,
          telegramChannelId: { in: channelIds },
          postDate: {
            gte: historyFrom,
            lte: new Date(to.getTime() + 24 * 60 * 60 * 1000),
          },
          excludeFromAnalytics: false,
          adSalePlacements: { none: {} },
        },
        select: {
          id: true,
          telegramChannelId: true,
          telegramMessageId: true,
          postDate: true,
        },
      }),
      this.prisma.telegramManagedPost.findMany({
        where: {
          workspaceId,
          telegramChannelId: { in: channelIds },
          status: {
            in: [
              TelegramManagedPostStatus.SCHEDULED,
              TelegramManagedPostStatus.PUBLISHED,
            ],
          },
          adSalePlacements: { none: {} },
          OR: [
            {
              scheduledAt: {
                gte: historyFrom,
                lte: new Date(to.getTime() + 24 * 60 * 60 * 1000),
              },
            },
            {
              publishedAt: {
                gte: historyFrom,
                lte: new Date(to.getTime() + 24 * 60 * 60 * 1000),
              },
            },
          ],
        },
        select: {
          id: true,
          telegramChannelId: true,
          scheduledAt: true,
          publishedAt: true,
          telegramMessageIds: true,
        },
      }),
    ]);

    const slots: any[] = [];
    const summaries: Array<{
      channelId: string;
      date: string;
      timezone: string;
      organicPostsCountForDay: number;
      adsCountForDay: number;
    }> = [];
    const workspaceTimezone = await this.resolveWorkspaceTimezone(workspaceId);
    const now = new Date();
    for (const channel of channels) {
      const channelPolicy = await this.resolvePolicy(workspaceId, channel.id, workspaceTimezone);
      const channelProducts = products.filter((product) => product.telegramChannelId === channel.id);
      const defaultProductPreview = await this.buildProductPricingPreview(
        workspaceId,
        channel,
        channelProducts[0] ?? null,
      );
      const product =
        channelProducts[0] ??
        ({
          id: null,
          topDurationMinutes: null,
          currency: channel.adBaseCurrency || 'USD',
          expectedViews: defaultProductPreview.expectedViews ?? 0,
          recommendedPrice: defaultProductPreview.recommendedPrice,
          minimumPrice: defaultProductPreview.minimumPrice,
        } as const);
      const recommendedPrice = defaultProductPreview.recommendedPrice;
      const minimumPrice = defaultProductPreview.minimumPrice;
      const publishedMessageIds = new Set(
        telegramPosts
          .filter((post) => post.telegramChannelId === channel.id)
          .map((post) => post.telegramMessageId),
      );
      const timeline = [
        ...telegramPosts
          .filter((post) => post.telegramChannelId === channel.id)
          .map((post) => ({
            id: `post:${post.id}`,
            at: post.postDate,
          })),
        ...managedOrganicPosts
          .filter((post) => post.telegramChannelId === channel.id)
          .filter((post) => !post.telegramMessageIds.some((messageId) => publishedMessageIds.has(messageId)))
          .map((post) => ({
            id: `managed:${post.id}`,
            at: post.publishedAt ?? post.scheduledAt,
          })),
      ]
        .filter((item): item is { id: string; at: Date } => item.at instanceof Date)
        .sort((left, right) => left.at.getTime() - right.at.getTime());
      const cadence = Math.max(1, channelPolicy.organicPostsPerAdSlot);
      const timelineByDate = new Map<string, Array<{ id: string; at: Date }>>();
      for (const item of timeline) {
        const dateKey = utcDateKey(item.at, channelPolicy.timezone);
        const current = timelineByDate.get(dateKey) ?? [];
        current.push(item);
        timelineByDate.set(dateKey, current);
      }
      const historicalOrganicPosts = timeline.filter(
        (item) => item.at >= historyFrom && item.at <= now,
      ).length;
      const projectedPostsPerDay = this.projectedOrganicPostsPerDay({
        channel,
        policy: channelPolicy,
        historicalOrganicPosts,
        historyWindowDays,
      });
      const typicalSlotsPerDay = Math.max(
        1,
        Math.round(projectedPostsPerDay / cadence),
      );
      let carryoverOrganicPosts = timeline.filter((item) => item.at < from).length % cadence;
      let opportunityCounter = 0;
      for (
        let cursor = new Date(from);
        cursor <= to;
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
      ) {
        const dateKey = utcDateKey(cursor, channelPolicy.timezone);
        const actualDayTimeline = (timelineByDate.get(dateKey) ?? []).sort(
          (left, right) => left.at.getTime() - right.at.getTime(),
        );
        const useProjection =
          actualDayTimeline.length === 0 && cursor.getTime() > now.getTime();
        const dayTimeline = useProjection
          ? this.projectedOrganicTimeline({
              dateKey,
              timezone: channelPolicy.timezone,
              projectedCount: projectedPostsPerDay,
              scheduledTimes: channel.timePosts,
            })
          : actualDayTimeline;
        const totalOrganicForDay = dayTimeline.length;
        const carryIn = carryoverOrganicPosts;
        const rawSlotsForDay = Math.floor((carryIn + totalOrganicForDay) / cadence);
        const totalSlotsForDay =
          channelPolicy.maxAdsPerDay >= 0
            ? Math.min(rawSlotsForDay, channelPolicy.maxAdsPerDay, typicalSlotsPerDay)
            : Math.min(rawSlotsForDay, typicalSlotsPerDay);
        carryoverOrganicPosts = (carryIn + totalOrganicForDay) % cadence;
        const placementsForDate = placements
          .filter(
            (placement) =>
              placement.telegramChannelId === channel.id &&
              placement.status !== TelegramAdPlacementStatus.CANCELLED &&
              utcDateKey(placement.scheduledAt, channelPolicy.timezone) === dateKey,
          )
          .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime());
        const isPastCalendarDay =
          dateKey < utcDateKey(now, channelPolicy.timezone);
        const shouldOfferExtraSlot = !isPastCalendarDay || placementsForDate.length === 0;
        const displaySlotsForDay = Math.max(
          totalSlotsForDay,
          placementsForDate.length + (shouldOfferExtraSlot ? 1 : 0),
        );
        summaries.push({
          channelId: channel.id,
          date: dateKey,
          timezone: channelPolicy.timezone,
          organicPostsCountForDay: totalOrganicForDay,
          adsCountForDay: Math.max(totalSlotsForDay, placementsForDate.length),
        });
        for (let slotIndex = 0; slotIndex < displaySlotsForDay; slotIndex += 1) {
          opportunityCounter += 1;
          const triggerPostIndex = Math.min(
            dayTimeline.length - 1,
            Math.max(0, (slotIndex + 1) * cadence - carryIn - 1),
          );
          const nextOrganicPostAt =
            dayTimeline[triggerPostIndex]?.at ?? dayTimeline.at(-1)?.at ?? null;
          const defaultScheduledAt = nextOrganicPostAt
            ? nextOrganicPostAt
            : zonedDateTimeToUtc(dateKey, '12:00', channelPolicy.timezone);
          const opportunityKey = `cadence:${channel.id}:${opportunityCounter}:${dateKey}`;
          const existingPlacement =
            placements.find(
              (placement) =>
                placement.telegramChannelId === channel.id &&
                placement.status !== TelegramAdPlacementStatus.CANCELLED &&
                placement.inventoryOpportunityKey === opportunityKey,
            ) ?? placementsForDate[slotIndex] ?? null;
          const scheduledAt = existingPlacement?.scheduledAt ?? defaultScheduledAt;
          if (scheduledAt < from) continue;
          const state = existingPlacement
            ? existingPlacement.status === TelegramAdPlacementStatus.RESERVED
              ? 'RESERVED'
              : 'SOLD'
            : isPastCalendarDay
              ? 'PAST'
              : 'AVAILABLE';
          slots.push({
            channelId: channel.id,
            date: dateKey,
            inventoryOpportunityKey: opportunityKey,
            scheduledAt: scheduledAt.toISOString(),
            timezone: channelPolicy.timezone,
            source: 'cadence',
            state,
            blockingReason: null,
            nextOrganicPostAt: nextOrganicPostAt?.toISOString() ?? null,
            productId: product.id,
            expectedViews: defaultProductPreview.expectedViews ?? 0,
            recommendedPrice,
            minimumPrice,
            currency: defaultProductPreview.currency,
            existingPlacement: existingPlacement
              ? {
                  id: existingPlacement.id,
                  saleId: existingPlacement.telegramAdSaleId,
                  status: existingPlacement.status,
                  scheduledAt: existingPlacement.scheduledAt.toISOString(),
                  title: existingPlacement.sale?.title ?? null,
                  saleStatus: existingPlacement.sale?.status ?? null,
                  paymentStatus: null,
                  agreedPrice: decimalToString(existingPlacement.agreedPrice),
                  currency: existingPlacement.currency,
                }
              : null,
            organicPostsCountForDay: totalOrganicForDay,
            adsCountForDay: placementsForDate.length,
          });
        }
      }
    }

      return {
        from: dto.from,
        to: dto.to,
        slots,
        summaries,
        warnings: [],
      };
    });
  }

  async analyticsSummary(userId: string, query: TelegramAdAnalyticsQueryDto) {
    const workspaceId = await this.workspace(userId);
    const { from, to, timezone } = this.analyticsRange(query);
    const now = new Date();
    const periodMs = Math.max(1, to.getTime() - from.getTime());
    const dataset = await this.adAnalyticsDataset({
      workspaceId,
      from,
      to,
      channelIds: this.analyticsChannelIds(query),
      networkId: query.networkId ?? null,
    });
    const nextSevenDays = await this.inventorySlotsForChannels({
      workspaceId,
      channelIds: dataset.channels.map((channel) => channel.id),
      from: now,
      to: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
    const inventory = this.summarizeInventory(nextSevenDays);
    const channelRollup = dataset.channels.map((channel) => {
      const placements = dataset.placements.filter(
        (placement) => placement.telegramChannelId === channel.id,
      );
      const revenue = placements.reduce(
        (sum, placement) => sum.add(decimal(placement.agreedPrice)),
        decimal(0),
      );
      const actualViews = placements.reduce(
        (sum, placement) => sum + (placement.actualViewsFinal ?? 0),
        0,
      );
      const actualCpm =
        actualViews > 0
          ? revenue.div(actualViews).mul(1000)
          : decimal(0);
      return {
        channel,
        revenue,
        actualCpm,
        unusedSlots: nextSevenDays.filter(
          (slot) => slot.channelId === channel.id && slot.state === 'PAST',
        ).length,
      };
    });
    const paidRevenue = this.sumPaidAllocations(dataset.placements);
    const totalRevenue = dataset.placements.reduce(
      (sum, placement) => sum.add(decimal(placement.agreedPrice)),
      decimal(0),
    );
    const outstanding = dataset.placements.reduce((sum, placement) => {
      const allocated = placement.paymentAllocations
        .filter((allocation) => allocation.payment?.status !== TelegramAdSalePaymentStatus.VOIDED)
        .reduce(
          (inner, allocation) => inner.add(decimal(allocation.amount)),
          decimal(0),
        );
      return sum.add(decimal(placement.agreedPrice).sub(allocated));
    }, decimal(0));
    const actualViews = dataset.placements.reduce(
      (sum, placement) => sum + (placement.actualViewsFinal ?? 0),
      0,
    );
    const averageCpm =
      actualViews > 0 ? totalRevenue.div(actualViews).mul(1000) : decimal(0);
    const underpricingLoss = dataset.placements.reduce((sum, placement) => {
      const minimum = decimal(placement.minimumPrice);
      const agreed = decimal(placement.agreedPrice);
      return sum.add(minimum.gt(agreed) ? minimum.sub(agreed) : decimal(0));
    }, decimal(0));
    const overdueCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const paymentOverdueCount = dataset.placements.filter((placement) => {
      const paid = placement.paymentAllocations.reduce(
        (sum, allocation) =>
          allocation.payment?.status === TelegramAdSalePaymentStatus.VOIDED
            ? sum
            : sum.add(decimal(allocation.amount)),
        decimal(0),
      );
      return (
        placement.sale.createdAt < overdueCutoff &&
        paid.lt(decimal(placement.agreedPrice))
      );
    }).length;
    const deletionFailuresCount = dataset.placements.filter((placement) =>
      Boolean(placement.lastDeletionError),
    ).length;

    const previousPeriodStart = new Date(from.getTime() - periodMs);
    const previousPeriodEnd = new Date(from.getTime() - 1);
    const currentMonthRevenue = dataset.placements
      .reduce((sum, placement) => sum.add(decimal(placement.agreedPrice)), decimal(0));
    const previousMonthRevenue = (
      await this.adAnalyticsDataset({
        workspaceId,
        from: previousPeriodStart,
        to: previousPeriodEnd,
        channelIds: this.analyticsChannelIds(query),
        networkId: query.networkId ?? null,
      })
    ).placements.reduce(
      (sum, placement) => sum.add(decimal(placement.agreedPrice)),
      decimal(0),
    );

    return {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      timezone,
      currency: this.commonCurrency(dataset.placements),
      revenueThisMonth: decimalToString(currentMonthRevenue),
      revenuePreviousMonth: decimalToString(previousMonthRevenue),
      monthOverMonthChangePercent: previousMonthRevenue.gt(0)
        ? Number(
            currentMonthRevenue
              .sub(previousMonthRevenue)
              .div(previousMonthRevenue)
              .mul(100)
              .toFixed(2),
          )
        : null,
      paidRevenue: decimalToString(paidRevenue),
      accountsReceivable: decimalToString(outstanding),
      upcomingPlacements: dataset.placements.filter(
        (placement) => placement.scheduledAt > now,
      ).length,
      availableSlotsNext7Days: inventory.availableSlots,
      slotFillRate: Number((inventory.bookingFillRate * 100).toFixed(2)),
      averageCpm: decimalToString(averageCpm),
      underpricingLoss: decimalToString(underpricingLoss),
      bestChannelByRevenue: channelRollup.length
        ? {
            channelId: [...channelRollup].sort((left, right) =>
              right.revenue.comparedTo(left.revenue),
            )[0].channel.id,
            title: [...channelRollup].sort((left, right) =>
              right.revenue.comparedTo(left.revenue),
            )[0].channel.title,
            value: decimalToString(
              [...channelRollup].sort((left, right) =>
                right.revenue.comparedTo(left.revenue),
              )[0].revenue,
            ),
          }
        : null,
      bestChannelByActualCpm: channelRollup.length
        ? {
            channelId: [...channelRollup].sort((left, right) =>
              right.actualCpm.comparedTo(left.actualCpm),
            )[0].channel.id,
            title: [...channelRollup].sort((left, right) =>
              right.actualCpm.comparedTo(left.actualCpm),
            )[0].channel.title,
            value: decimalToString(
              [...channelRollup].sort((left, right) =>
                right.actualCpm.comparedTo(left.actualCpm),
              )[0].actualCpm,
            ),
          }
        : null,
      channelWithMostUnusedInventory: channelRollup.length
        ? {
            channelId: [...channelRollup].sort(
              (left, right) => right.unusedSlots - left.unusedSlots,
            )[0].channel.id,
            title: [...channelRollup].sort(
              (left, right) => right.unusedSlots - left.unusedSlots,
            )[0].channel.title,
            unusedSlots: [...channelRollup].sort(
              (left, right) => right.unusedSlots - left.unusedSlots,
            )[0].unusedSlots,
          }
        : null,
      paymentOverdueCount,
      deletionFailuresCount,
    };
  }

  async channelAnalytics(
    userId: string,
    channelId: string,
    query: TelegramAdAnalyticsQueryDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.findWorkspaceChannel(workspaceId, channelId);
    const { from, to, timezone } = this.analyticsRange(query);
    const now = new Date();
    const overdueCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dataset = await this.adAnalyticsDataset({
      workspaceId,
      from,
      to,
      channelIds: [channelId],
    });
    const placements = dataset.placements;
    const inventorySlots = await this.inventorySlotsForChannels({
      workspaceId,
      channelIds: [channelId],
      from,
      to,
    });
    const inventory = this.summarizeInventory(inventorySlots);
    const priceHistory = await this.prisma.telegramAdPriceSnapshot.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
      },
      orderBy: { calculatedAt: 'desc' },
      take: 1,
    });
    const latestPrice = priceHistory[0];
    const totalAgreed = placements.reduce(
      (sum, placement) => sum.add(decimal(placement.agreedPrice)),
      decimal(0),
    );
    const totalPaid = placements.reduce(
      (sum, placement) =>
        sum.add(
          placement.paymentAllocations.reduce((inner, allocation) => {
            if (allocation.payment?.status === TelegramAdSalePaymentStatus.VOIDED) {
              return inner;
            }
            return inner.add(decimal(allocation.amount));
          }, decimal(0)),
        ),
      decimal(0),
    );
    const totalPrimary = placements.reduce(
      (sum, placement) =>
        sum.add(
          placement.paymentAllocations.reduce((inner, allocation) => {
            if (allocation.payment?.status === TelegramAdSalePaymentStatus.VOIDED) {
              return inner;
            }
            return inner.add(decimal(allocation.amountInPrimaryCurrency));
          }, decimal(0)),
        ),
      decimal(0),
    );
    const underpricingAmount = placements.reduce((sum, placement) => {
      const recommended = decimal(placement.recommendedPrice);
      const agreed = decimal(placement.agreedPrice);
      return sum.add(recommended.gt(agreed) ? recommended.sub(agreed) : decimal(0));
    }, decimal(0));
    const agreedPrices = placements.map((placement) => decimal(placement.agreedPrice));
    const expectedViews = placements.reduce(
      (sum, placement) => sum + placement.expectedViews,
      0,
    );
    const actualViews24h = placements.reduce(
      (sum, placement) => sum + (placement.actualViews24h ?? 0),
      0,
    );
    const actualViews48h = placements.reduce(
      (sum, placement) => sum + (placement.actualViews48h ?? 0),
      0,
    );
    const actualViewsFinal = placements.reduce(
      (sum, placement) => sum + (placement.actualViewsFinal ?? 0),
      0,
    );
    const expectedCpm =
      expectedViews > 0 ? totalAgreed.div(expectedViews).mul(1000) : decimal(0);
    const actualCpm =
      actualViewsFinal > 0 ? totalAgreed.div(actualViewsFinal).mul(1000) : decimal(0);
    const activePlacementStatuses = new Set<TelegramAdPlacementStatus>([
      TelegramAdPlacementStatus.RESERVED,
      TelegramAdPlacementStatus.SCHEDULED,
      TelegramAdPlacementStatus.PUBLISHED,
      TelegramAdPlacementStatus.COMPLETED,
    ]);
    const elapsedPeriodEnd = to < now ? to : now;
    const elapsedPlacements = placements.filter(
      (placement) =>
        activePlacementStatuses.has(placement.status) &&
        placement.scheduledAt >= from &&
        placement.scheduledAt <= elapsedPeriodEnd,
    );
    const elapsedEligibleSlots = inventorySlots.filter(
      (slot) =>
        slot.state !== 'MANUAL_ONLY' &&
        slot.scheduledAt >= from &&
        slot.scheduledAt <= elapsedPeriodEnd,
    );
    const elapsedMinimumRevenue = elapsedEligibleSlots.reduce(
      (sum, slot) => sum.add(decimal(slot.minimumPrice)),
      decimal(0),
    );
    const elapsedSoldRevenue = elapsedPlacements.reduce(
      (sum, placement) => sum.add(decimal(placement.agreedPrice)),
      decimal(0),
    );
    const elapsedRevenueGap = elapsedMinimumRevenue.gt(elapsedSoldRevenue)
      ? elapsedMinimumRevenue.sub(elapsedSoldRevenue)
      : decimal(0);
    const revenueCurrency =
      this.commonCurrency(placements) ?? this.commonCurrency(inventorySlots);

    return {
      channelId: channel.id,
      title: channel.title,
      iconPresentation: channel.photoUrl
        ? {
            type: 'image' as const,
            id: channel.id,
            url: channel.photoUrl,
            name: channel.title,
          }
        : null,
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      timezone,
      dateRules: this.analyticsDateRules(),
      revenue: {
        currency: revenueCurrency,
        totalAgreedRevenue: decimalToString(totalAgreed),
        totalPaidRevenue: decimalToString(totalPaid),
        totalRevenueInPrimaryCurrency: decimalToString(totalPrimary),
        periodRevenue: decimalToString(totalAgreed),
        outstandingRevenue: decimalToString(totalAgreed.sub(totalPaid)),
        refundedRevenue: '0',
        averageSalePrice: decimalToString(
          placements.length ? totalAgreed.div(placements.length) : decimal(0),
        ),
        medianSalePrice: decimalToString(this.medianDecimal(agreedPrices)),
        elapsedMinimumRevenue: decimalToString(elapsedMinimumRevenue),
        elapsedSoldRevenue: decimalToString(elapsedSoldRevenue),
        elapsedRevenueGap: decimalToString(elapsedRevenueGap),
      },
      placements: {
        sold: placements.filter((placement) =>
          activePlacementStatuses.has(placement.status),
        ).length,
        published: placements.filter(
          (placement) => placement.status === TelegramAdPlacementStatus.PUBLISHED,
        ).length,
        completed: placements.filter(
          (placement) => placement.status === TelegramAdPlacementStatus.COMPLETED,
        ).length,
        cancelled: placements.filter(
          (placement) => placement.status === TelegramAdPlacementStatus.CANCELLED,
        ).length,
        slotsEligible: inventory.eligibleSlots,
        slotsAvailable: inventory.availableSlots,
        slotsReserved: inventory.reservedSlots,
        slotFillRate: Number((inventory.bookingFillRate * 100).toFixed(2)),
        bookingFillRate: Number((inventory.bookingFillRate * 100).toFixed(2)),
        publishedFillRate: Number((inventory.publishedFillRate * 100).toFixed(2)),
        cancellationRate: placements.length
          ? Number(
              (
                (placements.filter(
                  (placement) =>
                    placement.status === TelegramAdPlacementStatus.CANCELLED,
                ).length /
                  placements.length) *
                100
              ).toFixed(2),
            )
          : 0,
      },
      pricing: {
        currentExpectedViews: latestPrice?.expectedViews ?? 0,
        currentRecommendedPrice: decimalToString(latestPrice?.recommendedPrice ?? decimal(0)),
        currentMinimumPrice: decimalToString(latestPrice?.minimumPrice ?? decimal(0)),
        averageAgreedPrice: decimalToString(
          placements.length ? totalAgreed.div(placements.length) : decimal(0),
        ),
        averageDiscountFromRecommendedPercent:
          placements.length && underpricingAmount.gt(0) && totalAgreed.gt(0)
            ? Number(underpricingAmount.div(totalAgreed).mul(100).toFixed(2))
            : 0,
        underpricingAmount: decimalToString(underpricingAmount),
        underpricingPercent:
          totalAgreed.gt(0)
            ? Number(underpricingAmount.div(totalAgreed).mul(100).toFixed(2))
            : 0,
        lostPotentialRevenue: decimalToString(underpricingAmount),
      },
      performance: {
        expectedViews,
        actualViews24h,
        actualViews48h,
        actualViewsFinal,
        expectedCpm: decimalToString(expectedCpm),
        actualCpm: decimalToString(actualCpm),
        varianceExpectedVsActualPercent:
          expectedViews > 0
            ? Number((((actualViewsFinal - expectedViews) / expectedViews) * 100).toFixed(2))
            : 0,
      },
      operations: {
        upcomingPlacements: placements.filter(
          (placement) => placement.scheduledAt > now,
        ).length,
        upcomingDeletions: placements.filter(
          (placement) =>
            placement.plannedDeleteAt &&
            placement.plannedDeleteAt > now &&
            !placement.deletedAt,
        ).length,
        overdueUnpaidSales: [
          ...new Set(
            placements
              .filter((placement) => {
                const allocated = placement.paymentAllocations.reduce(
                  (sum, allocation) =>
                    allocation.payment?.status === TelegramAdSalePaymentStatus.VOIDED
                      ? sum
                      : sum.add(decimal(allocation.amount)),
                  decimal(0),
                );
                return (
                  placement.sale.createdAt < overdueCutoff &&
                  allocated.lt(decimal(placement.agreedPrice))
                );
              })
              .map((placement) => placement.telegramAdSaleId),
          ),
        ].length,
        missedPlacements: placements.filter(
          (placement) => placement.status === TelegramAdPlacementStatus.MISSED,
        ).length,
        deletionFailures: placements.filter((placement) => placement.lastDeletionError).length,
      },
      recentSales: placements
        .slice(-5)
        .reverse()
        .map((placement) => ({
          saleId: placement.telegramAdSaleId,
          placementId: placement.id,
          advertiserName: placement.sale.advertiserName,
          scheduledAt: placement.scheduledAt.toISOString(),
          agreedPrice: decimalToString(decimal(placement.agreedPrice)),
          paidAllocatedAmount: decimalToString(
            placement.paymentAllocations.reduce(
              (sum, allocation) =>
                allocation.payment?.status === TelegramAdSalePaymentStatus.VOIDED
                  ? sum
                  : sum.add(decimal(allocation.amount)),
              decimal(0),
            ),
          ),
          status: placement.status,
          currency: placement.currency,
        })),
    };
  }

  async analyticsOverview(
    userId: string,
    query: TelegramAdAnalyticsSeriesQueryDto,
  ) {
    const channelIds = query.channelIds?.slice(0, 6) ?? [];
    const [summary, revenueSeries, inventory, alerts, channels] =
      await Promise.all([
        this.analyticsSummary(userId, query),
        this.revenueSeries(userId, query),
        this.inventoryAnalytics(userId, query),
        this.analyticsAlerts(userId, query),
        Promise.all(
          channelIds.map((channelId) =>
            this.channelAnalytics(userId, channelId, query),
          ),
        ),
      ]);
    return { summary, revenueSeries, inventory, alerts, channels };
  }

  async networkAnalytics(
    userId: string,
    networkId: string,
    query: TelegramAdNetworkAnalyticsQueryDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const network = await this.findWorkspaceNetwork(workspaceId, networkId);
    const { from, to, timezone } = this.analyticsRange(query);
    const mode = query.mode ?? 'SALE_CONTEXT';
    const dataset = await this.adAnalyticsDataset({
      workspaceId,
      from,
      to,
      networkId,
      networkMode: mode,
      channelIds:
        mode === 'CURRENT_CHANNELS'
          ? network.channels.map((channel) => channel.telegramChannelId)
          : undefined,
    });
    const inventorySlots = await this.inventorySlotsForChannels({
      workspaceId,
      channelIds: network.channels.map((channel) => channel.telegramChannelId),
      from,
      to,
    });
    const inventory = this.summarizeInventory(inventorySlots);
    const totalRevenue = dataset.placements.reduce(
      (sum, placement) => sum.add(decimal(placement.agreedPrice)),
      decimal(0),
    );
    const paidRevenue = this.sumPaidAllocations(dataset.placements);
    const actualViews = dataset.placements.reduce(
      (sum, placement) => sum + (placement.actualViewsFinal ?? 0),
      0,
    );
    const expectedViews = dataset.placements.reduce(
      (sum, placement) => sum + placement.expectedViews,
      0,
    );

    const channels = await Promise.all(
      dataset.channels.map(async (channel) => {
        const channelPlacements = dataset.placements.filter(
          (placement) => placement.telegramChannelId === channel.id,
        );
        const channelRevenue = channelPlacements.reduce(
          (sum, placement) => sum.add(decimal(placement.agreedPrice)),
          decimal(0),
        );
        const nextAvailable = inventorySlots
          .filter((slot) => slot.channelId === channel.id && slot.state === 'AVAILABLE')
          .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime())[0];
        return {
          channelId: channel.id,
          title: channel.title,
          revenue: decimalToString(channelRevenue),
          revenueSharePercent:
            totalRevenue.gt(0)
              ? Number(channelRevenue.div(totalRevenue).mul(100).toFixed(2))
              : 0,
          placementsCount: channelPlacements.length,
          fillRate: inventory.eligibleSlots
            ? Number(
                (
                  (inventorySlots.filter(
                    (slot) => slot.channelId === channel.id && slot.state === 'SOLD',
                  ).length /
                    Math.max(
                      1,
                      inventorySlots.filter((slot) => slot.channelId === channel.id).length,
                    )) *
                  100
                ).toFixed(2),
              )
            : 0,
          nextAvailableSlotAt: nextAvailable?.scheduledAt.toISOString() ?? null,
        };
      }),
    );

    return {
      networkId: network.id,
      name: network.name,
      mode,
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      timezone,
      totalRevenue: decimalToString(totalRevenue),
      paidRevenue: decimalToString(paidRevenue),
      outstandingRevenue: decimalToString(totalRevenue.sub(paidRevenue)),
      placementsCount: dataset.placements.length,
      fillRate: Number((inventory.bookingFillRate * 100).toFixed(2)),
      expectedViews,
      actualViews,
      blendedExpectedCpm:
        expectedViews > 0 ? decimalToString(totalRevenue.div(expectedViews).mul(1000)) : '0',
      blendedActualCpm:
        actualViews > 0 ? decimalToString(totalRevenue.div(actualViews).mul(1000)) : '0',
      underpricingLoss: decimalToString(
        dataset.placements.reduce((sum, placement) => {
          const recommended = decimal(placement.recommendedPrice);
          const agreed = decimal(placement.agreedPrice);
          return sum.add(recommended.gt(agreed) ? recommended.sub(agreed) : decimal(0));
        }, decimal(0)),
      ),
      channels,
    };
  }

  async revenueSeries(userId: string, query: TelegramAdAnalyticsSeriesQueryDto) {
    const workspaceId = await this.workspace(userId);
    const { from, to, timezone } = this.analyticsRange(query);
    const overdueCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const granularity = query.granularity ?? 'day';
    const channelIds = query.channelId
      ? [query.channelId]
      : this.analyticsChannelIds(query);
    const dataset = await this.adAnalyticsDataset({
      workspaceId,
      from,
      to,
      channelIds,
      networkId: query.networkId ?? null,
    });
    const points = new Map<string, any>();
    for (const placement of dataset.placements) {
      const key = this.bucketDate(placement.scheduledAt, granularity);
      const current =
        points.get(key) ??
        {
          date: key,
          agreedRevenue: decimal(0),
          paidRevenue: decimal(0),
          outstandingRevenue: decimal(0),
          placements: 0,
          expectedViews: 0,
          actualViews: 0,
        };
      const allocated = placement.paymentAllocations.reduce(
        (sum, allocation) =>
          allocation.payment?.status === TelegramAdSalePaymentStatus.VOIDED
            ? sum
            : sum.add(decimal(allocation.amount)),
        decimal(0),
      );
      current.agreedRevenue = current.agreedRevenue.add(decimal(placement.agreedPrice));
      current.paidRevenue = current.paidRevenue.add(allocated);
      current.outstandingRevenue = current.outstandingRevenue.add(
        decimal(placement.agreedPrice).sub(allocated),
      );
      current.placements += 1;
      current.expectedViews += placement.expectedViews;
      current.actualViews += placement.actualViewsFinal ?? 0;
      points.set(key, current);
    }
    return {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      timezone,
      granularity,
      points: [...points.values()]
        .sort((left, right) => left.date.localeCompare(right.date))
        .map((point) => ({
          ...point,
          agreedRevenue: decimalToString(point.agreedRevenue),
          paidRevenue: decimalToString(point.paidRevenue),
          outstandingRevenue: decimalToString(point.outstandingRevenue),
        })),
    };
  }

  async pricingSeries(userId: string, query: TelegramAdAnalyticsSeriesQueryDto) {
    const workspaceId = await this.workspace(userId);
    const { from, to, timezone } = this.analyticsRange(query);
    const granularity = query.granularity ?? 'day';
    const history = await this.prisma.telegramAdPriceSnapshot.findMany({
      where: {
        workspaceId,
        calculatedAt: { gte: from, lte: to },
        ...(query.channelId ? { telegramChannelId: query.channelId } : {}),
        ...(query.telegramAdProductId
          ? { telegramAdProductId: query.telegramAdProductId }
          : {}),
      },
      orderBy: [{ calculatedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        telegramChannelId: true,
        telegramAdProductId: true,
        calculatedAt: true,
        expectedViews: true,
        recommendedPrice: true,
        minimumPrice: true,
        targetCpm: true,
        minimumCpm: true,
        postsSampleCount: true,
        methodVersion: true,
      },
    });
    const deduped = new Map<string, any>();
    for (const point of history) {
      const key = `${this.bucketDate(point.calculatedAt, granularity)}:${point.telegramChannelId}:${point.telegramAdProductId ?? 'default'}`;
      deduped.set(key, point);
    }
    return {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      timezone,
      granularity,
      points: [...deduped.values()].map((point) => ({
        date: this.bucketDate(point.calculatedAt, granularity),
        channelId: point.telegramChannelId,
        productId: point.telegramAdProductId,
        expectedViews: point.expectedViews,
        recommendedPrice: decimalToString(point.recommendedPrice),
        minimumPrice: decimalToString(point.minimumPrice),
        targetCpm: decimalToString(point.targetCpm),
        minimumCpm: decimalToString(point.minimumCpm),
        sampleCount: point.postsSampleCount,
        methodVersion: point.methodVersion,
      })),
    };
  }

  async inventoryAnalytics(userId: string, query: TelegramAdAnalyticsSeriesQueryDto) {
    const workspaceId = await this.workspace(userId);
    const { from, to, timezone } = this.analyticsRange(query);
    const channelIds = query.channelIds?.length
      ? query.channelIds
      : await this.resolveAnalyticsChannelIds({
          workspaceId,
          channelId: query.channelId,
          networkId: query.networkId,
        });
    const snapshots = await this.loadInventorySnapshots({
      workspaceId,
      channelIds,
      from,
      to,
    });
    return {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      timezone,
      points: snapshots.map((snapshot) => ({
        date: snapshot.date.toISOString().slice(0, 10),
        channelId: snapshot.telegramChannelId,
        eligibleSlots: snapshot.eligibleSlots,
        availableSlots: Math.max(0, snapshot.eligibleSlots - snapshot.bookedSlots),
        reservedSlots: Math.max(0, snapshot.bookedSlots - snapshot.publishedSlots),
        soldSlots: snapshot.bookedSlots,
        publishedSlots: snapshot.publishedSlots,
        blockedSlots: snapshot.blockedSlots,
        pastUnusedSlots: snapshot.missedSlots,
        bookingFillRate: snapshot.eligibleSlots
          ? Number(((snapshot.bookedSlots / snapshot.eligibleSlots) * 100).toFixed(2))
          : 0,
        publishedFillRate: snapshot.eligibleSlots
          ? Number(((snapshot.publishedSlots / snapshot.eligibleSlots) * 100).toFixed(2))
          : 0,
      })),
      dataQuality: {
        level:
          snapshots.length >= this.listDatesInRange(from, to).length
            ? 'GOOD'
            : snapshots.length > 0
              ? 'PARTIAL'
              : 'LOW',
        missingSnapshotDays:
          this.listDatesInRange(from, to).length -
          new Set(
            snapshots.map((snapshot) => snapshot.date.toISOString().slice(0, 10)),
          ).size,
        missingPriceDays: 0,
        missingActualViewsPlacements: 0,
        incompletePaymentAllocations: 0,
        coveragePercent: this.listDatesInRange(from, to).length
          ? Number(
              (
                (new Set(
                  snapshots.map((snapshot) => snapshot.date.toISOString().slice(0, 10)),
                ).size /
                  this.listDatesInRange(from, to).length) *
                100
              ).toFixed(2),
            )
          : 100,
        warnings:
          snapshots.length >= this.listDatesInRange(from, to).length
            ? []
            : ['Some daily inventory snapshots are missing for the selected period.'],
      },
    };
  }

  async analyticsAlerts(userId: string, query: TelegramAdAlertsQueryDto) {
    const workspaceId = await this.workspace(userId);
    const { from, to, timezone } = this.analyticsRange(query);
    const overdueCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dataset = await this.adAnalyticsDataset({
      workspaceId,
      from,
      to,
      channelIds: this.analyticsChannelIds(query),
      networkId: query.networkId ?? null,
    });
    const inventory = await this.inventoryAnalytics(userId, query);
    const items = [
      ...dataset.placements
        .filter((placement) => {
          const paid = placement.paymentAllocations.reduce(
            (sum, allocation) =>
              allocation.payment?.status === TelegramAdSalePaymentStatus.VOIDED
                ? sum
                : sum.add(decimal(allocation.amount)),
            decimal(0),
          );
          return (
            placement.sale.createdAt < overdueCutoff &&
            paid.lt(decimal(placement.agreedPrice))
          );
        })
        .map((placement) => ({
          kind: 'OVERDUE_PAYMENT' as const,
          severity: 'warn' as const,
          channelId: placement.telegramChannelId,
          saleId: placement.telegramAdSaleId,
          placementId: placement.id,
          title: 'Overdue unpaid sale',
          details: `${placement.sale.advertiserName} still has unpaid balance`,
          scheduledAt: placement.scheduledAt.toISOString(),
          amount: decimalToString(decimal(placement.agreedPrice)),
          currency: placement.currency,
        })),
      ...dataset.placements
        .filter((placement) => placement.status === TelegramAdPlacementStatus.MISSED)
        .map((placement) => ({
          kind: 'MISSED_PLACEMENT' as const,
          severity: 'error' as const,
          channelId: placement.telegramChannelId,
          saleId: placement.telegramAdSaleId,
          placementId: placement.id,
          title: 'Missed placement',
          details: `${placement.sale.advertiserName} missed scheduled publication`,
          scheduledAt: placement.scheduledAt.toISOString(),
          amount: decimalToString(decimal(placement.agreedPrice)),
          currency: placement.currency,
        })),
      ...dataset.placements
        .filter((placement) => placement.lastDeletionError)
        .map((placement) => ({
          kind: 'DELETION_FAILURE' as const,
          severity: 'error' as const,
          channelId: placement.telegramChannelId,
          saleId: placement.telegramAdSaleId,
          placementId: placement.id,
          title: 'Deletion failed',
          details: placement.lastDeletionError || 'Deletion failed',
          scheduledAt: placement.plannedDeleteAt?.toISOString() ?? null,
          amount: decimalToString(decimal(placement.agreedPrice)),
          currency: placement.currency,
        })),
      ...dataset.placements
        .filter((placement) => decimal(placement.agreedPrice).lt(decimal(placement.minimumPrice)))
        .map((placement) => ({
          kind: 'UNDERPRICED_PLACEMENT' as const,
          severity: 'warn' as const,
          channelId: placement.telegramChannelId,
          saleId: placement.telegramAdSaleId,
          placementId: placement.id,
          title: 'Placement sold below minimum',
          details: `${placement.sale.advertiserName} booked below minimum price`,
          scheduledAt: placement.scheduledAt.toISOString(),
          amount: decimalToString(decimal(placement.minimumPrice).sub(decimal(placement.agreedPrice))),
          currency: placement.currency,
        })),
      ...inventory.points
        .filter((point) => point.pastUnusedSlots > 0)
        .map((point) => ({
          kind: 'UNUSED_INVENTORY' as const,
          severity: 'info' as const,
          channelId: point.channelId,
          saleId: null,
          placementId: null,
          title: 'Unused inventory',
          details: `${point.pastUnusedSlots} slot(s) passed unused on ${point.date}`,
          scheduledAt: point.date,
          amount: null,
          currency: null,
        })),
    ].filter((item) => (query.kinds?.length ? query.kinds.includes(item.kind) : true));
    return {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      timezone,
      items,
    };
  }

  async listAdvertisers(userId: string, query: TelegramAdvertisersQueryDto) {
    const workspaceId = await this.workspace(userId);
    const pagination = normalizePagination(query);
    const search = query.search?.trim();
    const where: Prisma.TelegramAdvertiserWhereInput = {
      workspaceId,
      ...(query.archived ? {} : { archivedAt: null }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.lifecycleStage ? { lifecycleStage: query.lifecycleStage } : {}),
      ...(query.ownerMemberId ? { ownerMemberId: query.ownerMemberId } : {}),
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: 'insensitive' } },
              { companyName: { contains: search, mode: 'insensitive' } },
              { telegramUsername: { contains: this.normalizeTelegramUsername(search) ?? search, mode: 'insensitive' } },
              { phone: { contains: this.normalizePhone(search) ?? search, mode: 'insensitive' } },
              { email: { contains: this.normalizeEmail(search) ?? search, mode: 'insensitive' } },
              {
                contacts: {
                  some: { normalizedValue: { contains: search.toLowerCase(), mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramAdvertiser.findMany({
        where,
        include: this.advertiserInclude(),
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramAdvertiser.count({ where }),
    ]);
    return createPaginatedResponse(items.map((item) => this.mapAdvertiser(item)), totalItems, pagination);
  }

  async advertiserSearch(userId: string, query: TelegramAdvertiserSearchDto) {
    const workspaceId = await this.workspace(userId);
    const search = query.q.trim();
    const normalizedVariants = [
      search.toLowerCase(),
      this.normalizeTelegramUsername(search),
      this.normalizePhone(search),
      this.normalizeEmail(search),
    ].filter(Boolean) as string[];
    const items = await this.prisma.telegramAdvertiser.findMany({
      where: {
        workspaceId,
        archivedAt: null,
        OR: [
          { displayName: { contains: search, mode: 'insensitive' } },
          { companyName: { contains: search, mode: 'insensitive' } },
          ...normalizedVariants.map((value) => ({ telegramUsername: { contains: value, mode: 'insensitive' as const } })),
          ...normalizedVariants.map((value) => ({ phone: { contains: value, mode: 'insensitive' as const } })),
          ...normalizedVariants.map((value) => ({ email: { contains: value, mode: 'insensitive' as const } })),
          ...normalizedVariants.map((value) => ({
            contacts: { some: { normalizedValue: { contains: value, mode: 'insensitive' as const } } },
          })),
        ],
      },
      include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
      orderBy: [{ totalRevenueInPrimaryCurrency: 'desc' }, { updatedAt: 'desc' }],
      take: Math.max(1, Math.min(20, query.limit ?? 10)),
    });
    return items.map((item) => this.mapAdvertiser(item));
  }

  async getAdvertiserDetails(userId: string, advertiserId: string) {
    const workspaceId = await this.workspace(userId);
    return this.mapAdvertiser(await this.getAdvertiser(workspaceId, advertiserId));
  }

  async createAdvertiser(userId: string, dto: CreateTelegramAdvertiserDto) {
    const workspaceId = await this.workspace(userId);
    const advertiser = await this.prisma.telegramAdvertiser.create({
      data: {
        workspaceId,
        displayName: dto.displayName.trim(),
        companyName: dto.companyName?.trim() || null,
        telegramUsername: this.normalizeTelegramUsername(dto.telegramUsername),
        telegramUserId: dto.telegramUserId?.trim() || null,
        phone: this.normalizePhone(dto.phone),
        email: this.normalizeEmail(dto.email),
        website: this.normalizeWebsite(dto.website),
        description: dto.description?.trim() || null,
        source: dto.source?.trim() || null,
        status: dto.status ?? TelegramAdvertiserStatus.LEAD,
        lifecycleStage: dto.lifecycleStage ?? TelegramAdvertiserLifecycleStage.NEW,
        ownerMemberId: dto.ownerMemberId ?? null,
        createdByUserId: userId,
        nextContactAt: dto.nextContactAt ? new Date(dto.nextContactAt) : null,
        defaultFollowUpDays: dto.defaultFollowUpDays ?? null,
        preferredCurrency: dto.preferredCurrency ?? null,
        preferredContactMethod: dto.preferredContactMethod ?? null,
      },
      include: this.advertiserInclude(),
    });
    await this.createAdvertiserActivity(workspaceId, advertiser.id, {
      type: TelegramAdvertiserActivityType.ADVERTISER_CREATED,
      title: 'Advertiser created',
      actorUserId: userId,
    });
    return this.mapAdvertiser(advertiser);
  }

  async updateAdvertiser(userId: string, advertiserId: string, dto: UpdateTelegramAdvertiserDto) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const advertiser = await this.prisma.telegramAdvertiser.update({
      where: { id: advertiserId },
      data: {
        ...(dto.displayName === undefined ? {} : { displayName: dto.displayName.trim() }),
        ...(dto.companyName === undefined ? {} : { companyName: dto.companyName?.trim() || null }),
        ...(dto.telegramUsername === undefined ? {} : { telegramUsername: this.normalizeTelegramUsername(dto.telegramUsername) }),
        ...(dto.telegramUserId === undefined ? {} : { telegramUserId: dto.telegramUserId?.trim() || null }),
        ...(dto.phone === undefined ? {} : { phone: this.normalizePhone(dto.phone) }),
        ...(dto.email === undefined ? {} : { email: this.normalizeEmail(dto.email) }),
        ...(dto.website === undefined ? {} : { website: this.normalizeWebsite(dto.website) }),
        ...(dto.description === undefined ? {} : { description: dto.description?.trim() || null }),
        ...(dto.source === undefined ? {} : { source: dto.source?.trim() || null }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.lifecycleStage === undefined ? {} : { lifecycleStage: dto.lifecycleStage }),
        ...(dto.ownerMemberId === undefined ? {} : { ownerMemberId: dto.ownerMemberId }),
        ...(dto.nextContactAt === undefined ? {} : { nextContactAt: dto.nextContactAt ? new Date(dto.nextContactAt) : null }),
        ...(dto.defaultFollowUpDays === undefined ? {} : { defaultFollowUpDays: dto.defaultFollowUpDays }),
        ...(dto.preferredCurrency === undefined ? {} : { preferredCurrency: dto.preferredCurrency }),
        ...(dto.preferredContactMethod === undefined ? {} : { preferredContactMethod: dto.preferredContactMethod }),
      },
      include: this.advertiserInclude(),
    });
    return this.mapAdvertiser(advertiser);
  }

  async archiveAdvertiser(userId: string, advertiserId: string) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const advertiser = await this.prisma.telegramAdvertiser.update({
      where: { id: advertiserId },
      data: { archivedAt: new Date(), status: TelegramAdvertiserStatus.ARCHIVED },
      include: this.advertiserInclude(),
    });
    return this.mapAdvertiser(advertiser);
  }

  async restoreAdvertiser(userId: string, advertiserId: string) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const advertiser = await this.prisma.telegramAdvertiser.update({
      where: { id: advertiserId },
      data: { archivedAt: null, status: TelegramAdvertiserStatus.ACTIVE },
      include: this.advertiserInclude(),
    });
    return this.mapAdvertiser(advertiser);
  }

  async addAdvertiserContact(userId: string, advertiserId: string, dto: CreateTelegramAdvertiserContactDto) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const normalizedValue = this.normalizeContactValue(dto.type, dto.value);
    if (!normalizedValue) throw new BadRequestException('Contact value is required');
    const contact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.telegramAdvertiserContact.updateMany({
          where: { workspaceId, advertiserId },
          data: { isPrimary: false },
        });
      }
      return tx.telegramAdvertiserContact.create({
        data: {
          workspaceId,
          advertiserId,
          type: dto.type,
          value: dto.value.trim(),
          normalizedValue,
          label: dto.label?.trim() || null,
          isPrimary: dto.isPrimary ?? false,
          isVerified: dto.isVerified ?? false,
        },
      });
    });
    await this.createAdvertiserActivity(workspaceId, advertiserId, {
      type: TelegramAdvertiserActivityType.CONTACT_ADDED,
      title: `Contact added: ${dto.type}`,
      actorUserId: userId,
      metadata: { contactId: contact.id, type: dto.type } as Prisma.InputJsonValue,
    });
    return this.mapAdvertiserContact(contact);
  }

  async updateAdvertiserContact(userId: string, advertiserId: string, contactId: string, dto: UpdateTelegramAdvertiserContactDto) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const existing = await this.prisma.telegramAdvertiserContact.findFirst({
      where: { id: contactId, workspaceId, advertiserId },
    });
    if (!existing) throw new NotFoundException('Telegram advertiser contact not found');
    const nextType = dto.type ?? existing.type;
    const nextValue = dto.value ?? existing.value;
    const normalizedValue = this.normalizeContactValue(nextType, nextValue);
    if (!normalizedValue) throw new BadRequestException('Contact value is required');
    const contact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.telegramAdvertiserContact.updateMany({
          where: { workspaceId, advertiserId },
          data: { isPrimary: false },
        });
      }
      return tx.telegramAdvertiserContact.update({
        where: { id: contactId },
        data: {
          type: nextType,
          value: nextValue.trim(),
          normalizedValue,
          ...(dto.label === undefined ? {} : { label: dto.label?.trim() || null }),
          ...(dto.isPrimary === undefined ? {} : { isPrimary: dto.isPrimary }),
          ...(dto.isVerified === undefined ? {} : { isVerified: dto.isVerified }),
        },
      });
    });
    return this.mapAdvertiserContact(contact);
  }

  async deleteAdvertiserContact(userId: string, advertiserId: string, contactId: string) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    await this.prisma.telegramAdvertiserContact.deleteMany({ where: { id: contactId, workspaceId, advertiserId } });
    return { success: true };
  }

  async setPrimaryAdvertiserContact(userId: string, advertiserId: string, contactId: string) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const [_, contact] = await this.prisma.$transaction([
      this.prisma.telegramAdvertiserContact.updateMany({
        where: { workspaceId, advertiserId },
        data: { isPrimary: false },
      }),
      this.prisma.telegramAdvertiserContact.update({ where: { id: contactId }, data: { isPrimary: true } }),
    ]);
    return this.mapAdvertiserContact(contact);
  }

  async listAdvertiserActivities(userId: string, advertiserId: string, query: TelegramAdvertiserActivitiesQueryDto) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const pagination = normalizePagination(query);
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramAdvertiserActivity.findMany({
        where: { workspaceId, advertiserId },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramAdvertiserActivity.count({ where: { workspaceId, advertiserId } }),
    ]);
    return createPaginatedResponse(items.map((item) => this.mapAdvertiserActivity(item)), totalItems, pagination);
  }

  async createAdvertiserActivityEntry(userId: string, advertiserId: string, dto: CreateTelegramAdvertiserActivityDto) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const activity = await this.createAdvertiserActivity(workspaceId, advertiserId, {
      type: dto.type,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      actorUserId: userId,
      metadata: (dto.metadata as Prisma.InputJsonValue | undefined) ?? null,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
    });
    return this.mapAdvertiserActivity(activity);
  }

  async createAdvertiserNote(userId: string, advertiserId: string, dto: CreateTelegramAdvertiserActivityDto) {
    return this.createAdvertiserActivityEntry(userId, advertiserId, {
      ...dto,
      type: TelegramAdvertiserActivityType.NOTE_ADDED,
    });
  }

  async listCrmTasks(userId: string, query: TelegramAdvertiserTasksQueryDto) {
    const workspaceId = await this.workspace(userId);
    const pagination = normalizePagination(query);
    const where: Prisma.TelegramAdvertiserTaskWhereInput = {
      workspaceId,
      ...(query.advertiserId ? { advertiserId: query.advertiserId } : {}),
      ...(query.assignedMemberId ? { assignedMemberId: query.assignedMemberId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramAdvertiserTask.findMany({
        where,
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramAdvertiserTask.count({ where }),
    ]);
    return createPaginatedResponse(items.map((item) => this.mapAdvertiserTask(item)), totalItems, pagination);
  }

  async createAdvertiserTask(userId: string, advertiserId: string, dto: CreateTelegramAdvertiserTaskDto) {
    const workspaceId = await this.workspace(userId);
    await this.getAdvertiser(workspaceId, advertiserId);
    const task = await this.prisma.telegramAdvertiserTask.create({
      data: {
        workspaceId,
        advertiserId,
        saleId: dto.saleId ?? null,
        placementId: dto.placementId ?? null,
        assignedMemberId: dto.assignedMemberId,
        createdByUserId: userId,
        type: dto.type,
        priority: dto.priority ?? TelegramAdvertiserTaskPriority.NORMAL,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        dueAt: new Date(dto.dueAt),
        remindAt: dto.remindAt ? new Date(dto.remindAt) : null,
        metadata: (dto.metadata as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      },
    });
    await this.createAdvertiserActivity(workspaceId, advertiserId, {
      type: TelegramAdvertiserActivityType.FOLLOW_UP_CREATED,
      title: task.title,
      taskId: task.id,
      saleId: task.saleId,
      placementId: task.placementId,
      actorUserId: userId,
    });
    return this.mapAdvertiserTask(task);
  }

  async updateCrmTask(userId: string, taskId: string, dto: UpdateTelegramAdvertiserTaskDto) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramAdvertiserTask.findFirst({ where: { id: taskId, workspaceId } });
    if (!existing) throw new NotFoundException('Telegram advertiser task not found');
    const task = await this.prisma.telegramAdvertiserTask.update({
      where: { id: taskId },
      data: {
        ...(dto.assignedMemberId === undefined ? {} : { assignedMemberId: dto.assignedMemberId }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.priority === undefined ? {} : { priority: dto.priority }),
        ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
        ...(dto.description === undefined ? {} : { description: dto.description?.trim() || null }),
        ...(dto.dueAt === undefined ? {} : { dueAt: dto.dueAt ? new Date(dto.dueAt) : existing.dueAt }),
        ...(dto.remindAt === undefined ? {} : { remindAt: dto.remindAt ? new Date(dto.remindAt) : null }),
        ...(dto.snoozedUntil === undefined ? {} : { snoozedUntil: dto.snoozedUntil ? new Date(dto.snoozedUntil) : null }),
      },
    });
    return this.mapAdvertiserTask(task);
  }

  async completeCrmTask(userId: string, taskId: string, dto: CompleteTelegramAdvertiserTaskDto) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramAdvertiserTask.findFirst({ where: { id: taskId, workspaceId } });
    if (!existing) throw new NotFoundException('Telegram advertiser task not found');
    const task = await this.prisma.telegramAdvertiserTask.update({
      where: { id: taskId },
      data: {
        status: TelegramAdvertiserTaskStatus.COMPLETED,
        completedAt: existing.completedAt ?? new Date(),
        completionNote: dto.completionNote?.trim() || null,
      },
    });
    const activityExists = await this.prisma.telegramAdvertiserActivity.findFirst({
      where: {
        workspaceId,
        advertiserId: task.advertiserId,
        taskId,
        type: TelegramAdvertiserActivityType.FOLLOW_UP_COMPLETED,
      },
    });
    if (!activityExists) {
      await this.createAdvertiserActivity(workspaceId, task.advertiserId, {
        type: TelegramAdvertiserActivityType.FOLLOW_UP_COMPLETED,
        title: task.title,
        taskId: task.id,
        saleId: task.saleId,
        placementId: task.placementId,
        actorUserId: userId,
        description: dto.completionNote?.trim() || null,
      });
    }
    return this.mapAdvertiserTask(task);
  }

  async snoozeCrmTask(userId: string, taskId: string, dto: UpdateTelegramAdvertiserTaskDto) {
    return this.updateCrmTask(userId, taskId, dto);
  }

  async skipCrmTask(userId: string, taskId: string, dto: SkipTelegramAdvertiserTaskDto) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramAdvertiserTask.findFirst({ where: { id: taskId, workspaceId } });
    if (!existing) throw new NotFoundException('Telegram advertiser task not found');
    const task = await this.prisma.telegramAdvertiserTask.update({
      where: { id: taskId },
      data: { status: TelegramAdvertiserTaskStatus.SKIPPED, skippedAt: new Date(), completionNote: dto.reason?.trim() || null },
    });
    await this.createAdvertiserActivity(workspaceId, task.advertiserId, {
      type: TelegramAdvertiserActivityType.FOLLOW_UP_SKIPPED,
      title: task.title,
      taskId: task.id,
      actorUserId: userId,
      description: dto.reason?.trim() || null,
    });
    return this.mapAdvertiserTask(task);
  }

  async rebuildInventorySnapshots(userId: string, dto: TelegramAdInventoryRebuildDto) {
    const membership = await this.workspaceService.requireWorkspaceRole(userId, [
      WorkspaceRole.owner,
      WorkspaceRole.admin,
    ]);
    const workspaceId = membership.workspaceId;
    const from = this.startOfUtcDay(new Date(dto.dateFrom));
    const to = this.endOfUtcDay(new Date(dto.dateTo));
    const days = this.listDatesInRange(from, to);
    if (days.length > 366) {
      throw new BadRequestException('Rebuild range cannot exceed 366 days');
    }
    const channelIds = dto.channelIds?.length
      ? dto.channelIds
      : dto.networkId
        ? (await this.findWorkspaceNetwork(workspaceId, dto.networkId)).channels.map(
            (item) => item.telegramChannelId,
          )
        : [];
    if (channelIds.length > 50) {
      throw new BadRequestException('Rebuild cannot exceed 50 channels');
    }
    const uniqueChannelIds = [...new Set(channelIds)];
    const jobRunId = `inventory-rebuild:${Date.now()}`;
    if (dto.dryRun) {
      const existing = await this.prisma.telegramAdInventoryDailySnapshot.count({
        where: {
          workspaceId,
          telegramChannelId: { in: uniqueChannelIds },
          date: { gte: from, lte: this.startOfUtcDay(to) },
        },
      });
      return {
        dryRun: true,
        force: dto.force,
        jobRunId,
        channels: uniqueChannelIds.length,
        days: days.length,
        estimatedChanges: uniqueChannelIds.length * days.length,
        existingSnapshots: existing,
      };
    }
    if (dto.force !== true) {
      throw new BadRequestException('force must be explicitly true for a rebuild run');
    }
    let processed = 0;
    let success = 0;
    let failed = 0;
    let skipped = 0;
    for (const channelId of uniqueChannelIds) {
      for (const date of days) {
        processed += 1;
        try {
          const snapshot = await this.buildInventorySnapshotForDate({
            workspaceId,
            channelId,
            date,
            force: dto.force,
          });
          const result = await this.saveInventorySnapshot(snapshot, { force: dto.force });
          if (result.status === 'skipped') skipped += 1;
          else success += 1;
        } catch (error) {
          failed += 1;
        }
      }
    }
    this.logger.info({
      event: 'telegram_ad_sales.inventory_rebuild',
      message: `Inventory rebuild finished: ${jobRunId}`,
      metadata: {
        jobRunId,
        workspaceId,
        processed,
        success,
        failed,
        skipped,
        channelIds: uniqueChannelIds,
        dateFrom: from.toISOString(),
        dateTo: to.toISOString(),
      },
    });
    return { dryRun: false, force: dto.force, jobRunId, processed, success, failed, skipped };
  }

  async priceFillCorrelation(userId: string, query: TelegramAdPriceFillCorrelationQueryDto) {
    const workspaceId = await this.workspace(userId);
    const { from, to, timezone } = this.analyticsRange(query);
    const bucketMap = { DAY: 'day', WEEK: 'week', MONTH: 'month' } as const;
    const granularity = bucketMap[query.bucket ?? 'DAY'];
    const channelIds = await this.resolveAnalyticsChannelIds({
      workspaceId,
      channelId: query.channelId,
      networkId: query.networkId,
      networkMode: query.networkMode,
    });
    const snapshots = await this.loadInventorySnapshots({ workspaceId, channelIds, from, to });
    const grouped = new Map<string, any[]>();
    for (const snapshot of snapshots) {
      const key = this.bucketDate(snapshot.date, granularity);
      grouped.set(key, [...(grouped.get(key) ?? []), snapshot]);
    }
    const points = [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, items]) => {
        const metrics = this.aggregateInventorySnapshots(items);
        return {
          periodStart: key,
          periodEnd: key,
          eligibleSlots: metrics.eligibleSlots,
          bookedSlots: metrics.bookedSlots,
          publishedSlots: metrics.publishedSlots,
          fillRate: Number(metrics.bookingFillRate.toFixed(2)),
          averageAgreedPrice: decimalToString(metrics.averageAgreedPrice),
          medianAgreedPrice: decimalToString(metrics.medianAgreedPrice),
          averageRecommendedPrice: decimalToString(metrics.averageRecommendedPrice),
          agreedRevenue: decimalToString(metrics.agreedRevenue),
          paidRevenue: decimalToString(metrics.paidRevenue),
          revenuePerEligibleSlot: decimalToString(metrics.revenuePerEligibleSlot),
          revenuePerPublishedSlot: decimalToString(metrics.revenuePerPublishedSlot),
          unsoldInventoryOpportunity: decimalToString(metrics.unsoldInventoryOpportunity),
          underpricingLoss: decimalToString(metrics.underpricingLoss),
        };
      });
    const correlation = (pairs: Array<{ x: number; y: number }>) => {
      if (pairs.length < 2) return null;
      const xMean = pairs.reduce((sum, pair) => sum + pair.x, 0) / pairs.length;
      const yMean = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length;
      const numerator = pairs.reduce((sum, pair) => sum + (pair.x - xMean) * (pair.y - yMean), 0);
      const xDenominator = Math.sqrt(
        pairs.reduce((sum, pair) => sum + (pair.x - xMean) ** 2, 0),
      );
      const yDenominator = Math.sqrt(
        pairs.reduce((sum, pair) => sum + (pair.y - yMean) ** 2, 0),
      );
      if (xDenominator === 0 || yDenominator === 0) return null;
      return Number((numerator / (xDenominator * yDenominator)).toFixed(4));
    };
    const priceFillPairs = points.map((point) => ({
      x: Number(point.averageAgreedPrice ?? 0),
      y: point.fillRate,
    }));
    const priceRevenuePairs = points.map((point) => ({
      x: Number(point.averageAgreedPrice ?? 0),
      y: Number(point.agreedRevenue ?? 0),
    }));
    const fillRevenuePairs = points.map((point) => ({
      x: point.fillRate,
      y: Number(point.agreedRevenue ?? 0),
    }));
    const sampleSize = points.length;
    return {
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      timezone,
      sampleSize,
      confidence:
        sampleSize < 6 ? 'INSUFFICIENT_DATA' : sampleSize < 12 ? 'LOW' : 'NORMAL',
      warnings:
        sampleSize < 6
          ? ['Observed correlation is unavailable because fewer than 6 buckets were found.']
          : sampleSize < 12
            ? ['Observed correlation is based on a small sample and has low confidence.']
            : ['Observed correlation does not prove causation.'],
      priceFillCorrelation: correlation(priceFillPairs),
      priceRevenueCorrelation: correlation(priceRevenuePairs),
      fillRevenueCorrelation: correlation(fillRevenuePairs),
      points,
    };
  }

  async revenueScenario(userId: string, dto: TelegramAdRevenueScenarioDto) {
    const workspaceId = await this.workspace(userId);
    const from = this.startOfUtcDay(new Date(dto.dateFrom));
    const to = this.endOfUtcDay(new Date(dto.dateTo));
    const channelIds = await this.resolveAnalyticsChannelIds({
      workspaceId,
      channelId: dto.channelId,
      networkId: dto.networkId,
      networkMode: dto.networkMode,
    });
    const snapshots = await this.loadInventorySnapshots({ workspaceId, channelIds, from, to });
    const metrics = this.aggregateInventorySnapshots(snapshots);
    const currentAveragePrice = Number(decimalToString(metrics.averageAgreedPrice) ?? 0);
    const currentFillRate = metrics.bookingFillRate;
    const proposedAveragePrice =
      dto.proposedFixedPrice ??
      Number(
        (
          currentAveragePrice *
          (1 + (dto.proposedPriceChangePercent ?? 0) / 100)
        ).toFixed(2),
      );
    const assumedFillRate =
      dto.assumedFillRate ??
      (dto.useHistoricalElasticity && snapshots.length >= 12
        ? Math.max(0, Math.min(100, currentFillRate))
        : currentFillRate);
    const projectedBookedSlots = Math.round(
      metrics.eligibleSlots * (assumedFillRate / 100),
    );
    const projectedRevenue = decimal(proposedAveragePrice).mul(projectedBookedSlots);
    return {
      currentAveragePrice: currentAveragePrice.toFixed(2),
      currentFillRate: Number(currentFillRate.toFixed(2)),
      currentEligibleSlots: metrics.eligibleSlots,
      currentRevenue: decimalToString(metrics.agreedRevenue),
      proposedAveragePrice: proposedAveragePrice.toFixed(2),
      assumedFillRate: Number(assumedFillRate.toFixed(2)),
      projectedBookedSlots,
      projectedRevenue: decimalToString(projectedRevenue),
      projectedRevenuePerEligibleSlot:
        metrics.eligibleSlots > 0
          ? decimalToString(projectedRevenue.div(metrics.eligibleSlots))
          : '0',
      difference: decimalToString(projectedRevenue.sub(metrics.agreedRevenue)),
      differencePercent:
        metrics.agreedRevenue.gt(0)
          ? Number(
              projectedRevenue
                .sub(metrics.agreedRevenue)
                .div(metrics.agreedRevenue)
                .mul(100)
                .toFixed(2),
            )
          : null,
      warnings:
        dto.useHistoricalElasticity && snapshots.length < 12
          ? ['Historical elasticity was not applied because the sample is too small.']
          : ['Scenario analysis is a projection, not a forecast.'],
      methodology: dto.useHistoricalElasticity && snapshots.length >= 12
        ? 'Historical fill rate was used as an observed reference. Correlation does not imply causation.'
        : 'Projection uses the provided or current fill rate assumption with transparent arithmetic.',
    };
  }

  async inventoryDetails(userId: string, query: TelegramAdInventoryDetailsQueryDto) {
    const workspaceId = await this.workspace(userId);
    const pagination = normalizePagination(query);
    const from = query.dateFrom ? this.startOfUtcDay(new Date(query.dateFrom)) : undefined;
    const to = query.dateTo ? this.endOfUtcDay(new Date(query.dateTo)) : undefined;
    const channelIds = await this.resolveAnalyticsChannelIds({
      workspaceId,
      channelId: query.channelId,
      networkId: query.networkId,
    });
    const where: Prisma.TelegramAdSalePlacementWhereInput = {
      workspaceId,
      telegramChannelId: { in: channelIds },
      ...(from || to
        ? {
            scheduledAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramAdSalePlacement.findMany({
        where,
        orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          telegramAdSaleId: true,
          telegramChannelId: true,
          status: true,
          scheduledAt: true,
          agreedPrice: true,
          recommendedPrice: true,
          expectedViews: true,
          actualViewsFinal: true,
          actualCpm: true,
          currency: true,
          sale: {
            select: {
              advertiserName: true,
            },
          },
          paymentAllocations: {
            select: {
              amount: true,
              payment: { select: { status: true } },
            },
          },
        },
      }),
      this.prisma.telegramAdSalePlacement.count({ where }),
    ]);
    return createPaginatedResponse(
      items.map((item) => ({
        placementId: item.id,
        saleId: item.telegramAdSaleId,
        channelId: item.telegramChannelId,
        advertiserName: item.sale.advertiserName,
        agreedPrice: decimalToString(item.agreedPrice),
        recommendedPrice: decimalToString(item.recommendedPrice),
        status: item.status,
        scheduledAt: item.scheduledAt.toISOString(),
        paidAmount: decimalToString(
          item.paymentAllocations.reduce(
            (sum, allocation) =>
              allocation.payment.status === TelegramAdSalePaymentStatus.VOIDED
                ? sum
                : sum.add(decimal(allocation.amount)),
            decimal(0),
          ),
        ),
        expectedViews: item.expectedViews,
        actualViews: item.actualViewsFinal,
        cpm: decimalToString(item.actualCpm),
        currency: item.currency,
      })),
      totalItems,
      pagination,
    );
  }

  async listSales(userId: string, query: TelegramAdSalesQueryDto) {
    const workspaceId = await this.workspace(userId);
    const pagination = normalizePagination(query);
    const where: Prisma.TelegramAdSaleWhereInput = {
      workspaceId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramAdSale.findMany({
        where,
        include: this.includeSaleRelations(),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramAdSale.count({ where }),
    ]);
    return createPaginatedResponse(items.map((sale) => this.mapSale(sale)), totalItems, pagination);
  }

  async getSale(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    return this.mapSale(await this.getSaleDetails(workspaceId, id));
  }

  async createSale(userId: string, dto: CreateTelegramAdSaleDto) {
    const { workspaceId, assignedMemberId } = await this.workspaceService.resolveAssignedMemberId(
      userId,
      dto.assignedMemberId,
    );
    const advertiser = await this.resolveAdvertiserForSale(workspaceId, userId, dto, assignedMemberId);
    const sale = await this.prisma.telegramAdSale.create({
      data: {
        workspaceId,
        advertiserId: advertiser?.id ?? dto.advertiserId ?? null,
        advertiserName: dto.advertiserName.trim(),
        advertiserTelegram: dto.advertiserTelegram?.trim() || null,
        advertiserContact: dto.advertiserContact?.trim() || null,
        advertiserNameSnapshot: advertiser?.displayName ?? dto.advertiserName.trim(),
        advertiserTelegramSnapshot:
          advertiser?.telegramUsername ?? this.normalizeTelegramUsername(dto.advertiserTelegram),
        advertiserCompanySnapshot: advertiser?.companyName ?? (dto.advertiserCompanyName?.trim() || null),
        title: dto.title?.trim() || null,
        notes: dto.notes?.trim() || null,
        crmDealStage: dto.crmDealStage ?? TelegramAdCrmDealStage.NEW_LEAD,
        expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : null,
        lostReason: dto.lostReason?.trim() || null,
        nextActionAt: dto.nextActionAt ? new Date(dto.nextActionAt) : null,
        settlementCurrency: dto.settlementCurrency,
        reservedUntil: dto.reservedUntil ? new Date(dto.reservedUntil) : null,
        sourceTaskId: dto.sourceTaskId ?? null,
        sourceAdvertiserActivityId: dto.sourceAdvertiserActivityId ?? null,
        createdByUserId: userId,
        assignedMemberId,
      },
      include: this.includeSaleRelations(),
    });
    if (sale.advertiserId) {
      await this.recalculateAdvertiserStats(workspaceId, sale.advertiserId);
      await this.createAdvertiserActivity(workspaceId, sale.advertiserId, {
        type: TelegramAdvertiserActivityType.SALE_CREATED,
        title: sale.title?.trim() || sale.advertiserName,
        saleId: sale.id,
        actorUserId: userId,
      });
    }
    return this.mapSale(sale);
  }

  async updateSale(userId: string, id: string, dto: UpdateTelegramAdSaleDto) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.getSaleDetails(workspaceId, id);
    const assignedMemberId =
      dto.assignedMemberId === undefined
        ? undefined
        : (await this.workspaceService.resolveAssignedMemberId(userId, dto.assignedMemberId)).assignedMemberId;
    if (dto.status) {
      this.assertSaleTransition(existing.status, dto.status);
      if (dto.status === TelegramAdSaleStatus.CONFIRMED && !existing.placements.length) {
        throw new BadRequestException('Cannot confirm sale without placements');
      }
      if (dto.status === TelegramAdSaleStatus.CANCELLED) {
        const activePaidPayments = (existing.payments ?? []).some(
          (payment: any) => payment.status !== TelegramAdSalePaymentStatus.VOIDED,
        );
        if (activePaidPayments) {
          throw new BadRequestException('Cannot cancel paid sale without voiding payments');
        }
      }
    }
    const linkedAdvertiser =
      dto.advertiserId === undefined
        ? existing.advertiser
        : dto.advertiserId
          ? await this.getAdvertiser(workspaceId, dto.advertiserId)
          : null;
    if (dto.crmDealStage === TelegramAdCrmDealStage.LOST && !dto.lostReason && !existing.lostReason) {
      throw new BadRequestException('lostReason is required when crmDealStage is LOST');
    }
    const sale = await this.prisma.telegramAdSale.update({
      where: { id },
      data: {
        ...(dto.advertiserId === undefined ? {} : { advertiserId: dto.advertiserId }),
        ...(dto.advertiserName === undefined ? {} : { advertiserName: dto.advertiserName.trim() }),
        ...(dto.advertiserTelegram === undefined ? {} : { advertiserTelegram: dto.advertiserTelegram?.trim() || null }),
        ...(dto.advertiserContact === undefined ? {} : { advertiserContact: dto.advertiserContact?.trim() || null }),
        ...(dto.advertiserCompanyName === undefined
          ? {}
          : { advertiserCompanySnapshot: dto.advertiserCompanyName?.trim() || null }),
        ...(dto.title === undefined ? {} : { title: dto.title?.trim() || null }),
        ...(dto.notes === undefined ? {} : { notes: dto.notes?.trim() || null }),
        ...(dto.settlementCurrency === undefined ? {} : { settlementCurrency: dto.settlementCurrency }),
        ...(dto.reservedUntil === undefined
          ? {}
          : { reservedUntil: dto.reservedUntil ? new Date(dto.reservedUntil) : null }),
        ...(assignedMemberId === undefined ? {} : { assignedMemberId }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.crmDealStage === undefined ? {} : { crmDealStage: dto.crmDealStage }),
        ...(dto.expectedCloseAt === undefined
          ? {}
          : { expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : null }),
        ...(dto.lostReason === undefined ? {} : { lostReason: dto.lostReason?.trim() || null }),
        ...(dto.nextActionAt === undefined
          ? {}
          : { nextActionAt: dto.nextActionAt ? new Date(dto.nextActionAt) : null }),
        ...(dto.sourceTaskId === undefined ? {} : { sourceTaskId: dto.sourceTaskId }),
        ...(dto.sourceAdvertiserActivityId === undefined
          ? {}
          : { sourceAdvertiserActivityId: dto.sourceAdvertiserActivityId }),
        ...(dto.advertiserId === undefined
          ? {}
          : {
              advertiserNameSnapshot:
                existing.advertiserNameSnapshot ?? linkedAdvertiser?.displayName ?? existing.advertiserName,
              advertiserTelegramSnapshot:
                existing.advertiserTelegramSnapshot ??
                linkedAdvertiser?.telegramUsername ??
                existing.advertiserTelegram,
              advertiserCompanySnapshot:
                existing.advertiserCompanySnapshot ?? linkedAdvertiser?.companyName ?? null,
            }),
      },
      include: this.includeSaleRelations(),
    });
    this.invalidateAvailabilityCache(workspaceId);
    if (sale.advertiserId) {
      await this.recalculateAdvertiserStats(workspaceId, sale.advertiserId);
    }
    if (dto.crmDealStage && sale.advertiserId) {
      await this.createAdvertiserActivity(workspaceId, sale.advertiserId, {
        type: TelegramAdvertiserActivityType.SALE_STAGE_CHANGED,
        title: `Sale stage changed to ${dto.crmDealStage}`,
        saleId: sale.id,
        actorUserId: userId,
      });
    }
    return this.mapSale(sale);
  }

  async addPlacement(userId: string, saleId: string, dto: CreateTelegramAdSalePlacementDto) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const channel = await this.findWorkspaceChannel(workspaceId, dto.telegramChannelId);
    if (dto.telegramChannelNetworkId) {
      const network = await this.findWorkspaceNetwork(workspaceId, dto.telegramChannelNetworkId);
      if (!network.channels.some((item) => item.telegramChannelId === channel.id)) {
        throw new BadRequestException('Selected network does not contain chosen channel');
      }
    }
    const product = dto.telegramAdProductId
      ? await this.prisma.telegramAdProduct.findFirst({
          where: { id: dto.telegramAdProductId, workspaceId, telegramChannelId: channel.id },
        })
      : null;
    if (dto.telegramAdProductId && !product) {
      throw new NotFoundException('Telegram ad product not found');
    }
    const snapshot = dto.pricingSnapshotId
      ? await this.prisma.telegramAdPriceSnapshot.findFirst({
          where: {
            id: dto.pricingSnapshotId,
            workspaceId,
            telegramChannelId: channel.id,
            ...(product ? { telegramAdProductId: product.id } : {}),
          },
        })
      : null;
    if (dto.pricingSnapshotId && !snapshot) {
      throw new NotFoundException('Pricing snapshot not found');
    }
    const expectedViewsResult = snapshot
      ? {
          expectedViews: snapshot.expectedViews,
          recommendedPrice: snapshot.recommendedPrice,
          minimumPrice: snapshot.minimumPrice,
          targetCpm: snapshot.targetCpm,
        }
      : null;
    let placement;
    try {
      placement = await this.prisma.telegramAdSalePlacement.create({
        data: {
          workspaceId,
          telegramAdSaleId: sale.id,
          telegramChannelId: channel.id,
          telegramChannelNetworkId: dto.telegramChannelNetworkId ?? null,
          telegramAdProductId: product?.id ?? null,
          inventoryOpportunityKey: dto.inventoryOpportunityKey?.trim() || null,
          pricingSnapshotId: snapshot?.id ?? null,
          status: TelegramAdPlacementStatus.DRAFT,
          scheduledAt: new Date(dto.scheduledAt),
          timezone: dto.timezone,
          pricingMode: dto.pricingMode ?? product?.defaultPricingMode ?? TelegramAdPricingMode.CPM,
          expectedViews: dto.expectedViews ?? expectedViewsResult?.expectedViews ?? 0,
          quotedCpm: decimalOrNull(dto.quotedCpm),
          recommendedPrice: decimalOrNull(dto.recommendedPrice) ?? expectedViewsResult?.recommendedPrice ?? decimal(0),
          minimumPrice: decimalOrNull(dto.minimumPrice) ?? expectedViewsResult?.minimumPrice ?? decimal(0),
          agreedPrice:
            decimalOrNull(dto.agreedPrice) ??
            expectedViewsResult?.recommendedPrice ??
            decimalOrNull(product?.defaultFixedPrice) ??
            decimal(0),
          currency: dto.currency ?? snapshot?.currency ?? product?.currency ?? sale.settlementCurrency,
          topDurationMinutesSnapshot: product?.topDurationMinutes ?? null,
          feedDurationHoursSnapshot: product?.feedDurationHours ?? null,
          deleteAfterHoursSnapshot: product?.deleteAfterHours ?? null,
          isPermanentSnapshot: product?.isPermanent ?? false,
          manualPriceReason: dto.manualPriceReason?.trim() || null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This ad opportunity is already booked');
      }
      throw error;
    }
    this.invalidateAvailabilityCache(workspaceId);
    return this.mapPlacement(placement);
  }

  async updatePlacement(
    userId: string,
    saleId: string,
    placementId: string,
    dto: UpdateTelegramAdSalePlacementDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const placement = await this.ensurePlacementBelongsToSale(workspaceId, saleId, placementId);
    const agreedPrice =
      dto.agreedPrice === undefined ? placement.agreedPrice : decimal(dto.agreedPrice);
    const minimumPrice =
      dto.minimumPrice === undefined ? placement.minimumPrice : decimal(dto.minimumPrice);
    if (agreedPrice.lt(minimumPrice) && !(dto.manualPriceReason ?? placement.manualPriceReason)) {
      this.logger.info({
        level: 'warn',
        event: 'telegram_ad_sales.price_below_minimum',
        message: `Placement ${placementId} price below minimum`,
        metadata: {
          placementId,
          saleId,
        },
      });
      throw new BadRequestException({
        code: 'UNDER_MINIMUM_PRICE',
        message: 'manualPriceReason is required when agreedPrice is below minimumPrice',
      });
    }
    const updated = await this.prisma.telegramAdSalePlacement.update({
      where: { id: placementId },
      data: {
        ...(dto.scheduledAt === undefined ? {} : { scheduledAt: new Date(dto.scheduledAt) }),
        ...(dto.timezone === undefined ? {} : { timezone: dto.timezone }),
        ...(dto.pricingMode === undefined ? {} : { pricingMode: dto.pricingMode }),
        ...(dto.expectedViews === undefined ? {} : { expectedViews: dto.expectedViews }),
        ...(dto.recommendedPrice === undefined ? {} : { recommendedPrice: decimal(dto.recommendedPrice) }),
        ...(dto.minimumPrice === undefined ? {} : { minimumPrice: decimal(dto.minimumPrice) }),
        ...(dto.agreedPrice === undefined ? {} : { agreedPrice: decimal(dto.agreedPrice) }),
        ...(dto.quotedCpm === undefined ? {} : { quotedCpm: decimalOrNull(dto.quotedCpm) }),
        ...(dto.currency === undefined ? {} : { currency: dto.currency }),
        ...(dto.manualPriceReason === undefined
          ? {}
          : { manualPriceReason: dto.manualPriceReason?.trim() || null }),
        ...(dto.managedPostId === undefined ? {} : { managedPostId: dto.managedPostId || null }),
        ...(dto.telegramPostId === undefined ? {} : { telegramPostId: dto.telegramPostId || null }),
      },
    });
    this.invalidateAvailabilityCache(workspaceId);
    return {
      ...this.mapPlacement(updated),
      warnings:
        updated.agreedPrice.lt(updated.minimumPrice)
          ? [{ code: 'UNDER_MINIMUM_PRICE', message: 'Placement price is below minimum' }]
          : [],
    };
  }

  async createPayment(
    userId: string,
    saleId: string,
    dto: CreateTelegramAdSalePaymentDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, workspaceId, isActive: true },
    });
    if (!account) throw new NotFoundException('Account not found');
    const paidAt = new Date(dto.paidAt);
    const { primaryCurrency, rate } = await this.resolveRateToPrimary(
      workspaceId,
      dto.currency,
      paidAt,
    );
    const category = await this.resolveSystemCategory(workspaceId, 'channel_advertising_revenue');
    const allocationPlacementIds = dto.allocations.map((item) => item.placementId);
    const placements = sale.placements.filter((placement: any) =>
      allocationPlacementIds.includes(placement.id),
    );
    if (placements.length !== dto.allocations.length) {
      throw new BadRequestException('One or more allocations refer to invalid placements');
    }
    const allocationTotal = dto.allocations.reduce((sum, item) => sum + item.amount, 0);
    if (allocationTotal - dto.amount > 0.000001) {
      throw new BadRequestException('Allocation total cannot exceed payment amount');
    }
    for (const placement of placements) {
      const requestedAllocation = dto.allocations.find((item) => item.placementId === placement.id)!;
      const paidAlready = (placement.paymentAllocations ?? [])
        .filter((allocation: any) => allocation.payment?.status !== TelegramAdSalePaymentStatus.VOIDED)
        .reduce((sum: number, allocation: any) => sum + Number(allocation.amount), 0);
      if (paidAlready + requestedAllocation.amount - Number(placement.agreedPrice) > 0.000001) {
        throw new BadRequestException('Allocation exceeds placement agreedPrice');
      }
    }

    if (dto.idempotencyKey) {
      const existing = await this.prisma.telegramAdSalePayment.findFirst({
        where: { workspaceId, idempotencyKey: dto.idempotencyKey },
        include: { allocations: true, account: true, transaction: true, reversalTransaction: true },
      });
      if (existing) return this.mapPayment(existing);
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          workspaceId,
          accountId: account.id,
          telegramChannelId: placements.length === 1 ? placements[0].telegramChannelId : null,
          type: TransactionType.income,
          amount: decimal(dto.amount),
          currency: account.currency,
          amountInPrimaryCurrency: decimal(dto.amount * rate),
          exchangeRateToPrimary: decimal(rate),
          category: category.name,
          categoryId: category.id,
          description: dto.notes?.trim() || `Telegram ad sale payment ${sale.id}`,
          date: paidAt,
          assignedMemberId: sale.assignedMemberId ?? null,
          createdByUserId: userId,
        },
      });
      const createdPayment = await tx.telegramAdSalePayment.create({
        data: {
          workspaceId,
          telegramAdSaleId: sale.id,
          accountId: account.id,
          transactionId: transaction.id,
          amount: decimal(dto.amount),
          currency: dto.currency,
          amountInPrimaryCurrency: decimal(dto.amount * rate),
          exchangeRateToPrimary: decimal(rate),
          paidAt,
          notes: dto.notes?.trim() || null,
          idempotencyKey: dto.idempotencyKey?.trim() || null,
          createdByUserId: userId,
          allocations: {
            create: dto.allocations.map((allocation) => ({
              workspaceId,
              telegramAdSalePlacementId: allocation.placementId,
              amount: decimal(allocation.amount),
              currency: dto.currency,
              amountInPrimaryCurrency: decimal(allocation.amount * rate),
            })),
          },
        },
        include: {
          allocations: true,
          account: true,
          transaction: true,
          reversalTransaction: true,
        },
      });
      return createdPayment;
    });
    if (sale.advertiserId) {
      await this.recalculateAdvertiserStats(workspaceId, sale.advertiserId);
    }
    return this.mapPayment(payment);
  }

  async listPayments(userId: string, saleId: string) {
    const workspaceId = await this.workspace(userId);
    await this.getSaleDetails(workspaceId, saleId);
    const payments = await this.prisma.telegramAdSalePayment.findMany({
      where: { workspaceId, telegramAdSaleId: saleId },
      orderBy: { paidAt: 'asc' },
      include: {
        allocations: true,
        account: true,
        transaction: true,
        reversalTransaction: true,
      },
    });
    return payments.map((payment) => this.mapPayment(payment));
  }

  async updatePayment(
    userId: string,
    saleId: string,
    paymentId: string,
    dto: UpdateTelegramAdSalePaymentDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const payment = await this.prisma.telegramAdSalePayment.findFirst({
      where: { id: paymentId, workspaceId, telegramAdSaleId: saleId },
      include: {
        allocations: true,
        account: true,
        transaction: true,
        reversalTransaction: true,
      },
    });
    if (!payment) throw new NotFoundException('Telegram ad sale payment not found');
    if (payment.status === TelegramAdSalePaymentStatus.VOIDED) {
      throw new BadRequestException('Cannot update a voided payment');
    }
    const accountId = dto.accountId ?? payment.accountId;
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, workspaceId, isActive: true },
    });
    if (!account) throw new NotFoundException('Account not found');

    const amount = dto.amount ?? Number(payment.amount);
    const currency = dto.currency ?? payment.currency;
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : payment.paidAt;
    const allocations = dto.allocations ?? payment.allocations.map((allocation: any) => ({
      placementId: allocation.telegramAdSalePlacementId,
      amount: Number(allocation.amount),
    }));
    const allocationPlacementIds = allocations.map((item) => item.placementId);
    const placements = sale.placements.filter((placement: any) =>
      allocationPlacementIds.includes(placement.id),
    );
    if (placements.length !== allocations.length) {
      throw new BadRequestException('One or more allocations refer to invalid placements');
    }
    const allocationTotal = allocations.reduce((sum, item) => sum + item.amount, 0);
    if (allocationTotal - amount > 0.000001) {
      throw new BadRequestException('Allocation total cannot exceed payment amount');
    }
    for (const placement of placements) {
      const requestedAllocation = allocations.find((item) => item.placementId === placement.id)!;
      const paidAlready = (placement.paymentAllocations ?? [])
        .filter(
          (allocation: any) =>
            allocation.telegramAdSalePaymentId !== paymentId &&
            allocation.payment?.status !== TelegramAdSalePaymentStatus.VOIDED,
        )
        .reduce((sum: number, allocation: any) => sum + Number(allocation.amount), 0);
      if (paidAlready + requestedAllocation.amount - Number(placement.agreedPrice) > 0.000001) {
        throw new BadRequestException('Allocation exceeds placement agreedPrice');
      }
    }

    const { rate } = await this.resolveRateToPrimary(workspaceId, currency, paidAt);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (payment.transactionId) {
        await tx.transaction.update({
          where: { id: payment.transactionId },
          data: {
            accountId: account.id,
            telegramChannelId: placements.length === 1 ? placements[0].telegramChannelId : null,
            amount: decimal(amount),
            currency: account.currency,
            amountInPrimaryCurrency: decimal(amount * rate),
            exchangeRateToPrimary: decimal(rate),
            date: paidAt,
            ...(dto.notes === undefined
              ? {}
              : { description: dto.notes?.trim() || `Telegram ad sale payment ${sale.id}` }),
            assignedMemberId: sale.assignedMemberId ?? null,
          },
        });
      }
      await tx.telegramAdSalePaymentAllocation.deleteMany({
        where: { telegramAdSalePaymentId: paymentId },
      });
      return tx.telegramAdSalePayment.update({
        where: { id: paymentId },
        data: {
          accountId: account.id,
          amount: decimal(amount),
          currency,
          amountInPrimaryCurrency: decimal(amount * rate),
          exchangeRateToPrimary: decimal(rate),
          paidAt,
          ...(dto.notes === undefined ? {} : { notes: dto.notes?.trim() || null }),
          allocations: {
            create: allocations.map((allocation) => ({
              workspaceId,
              telegramAdSalePlacementId: allocation.placementId,
              amount: decimal(allocation.amount),
              currency,
              amountInPrimaryCurrency: decimal(allocation.amount * rate),
            })),
          },
        },
        include: {
          allocations: true,
          account: true,
          transaction: true,
          reversalTransaction: true,
        },
      });
    });
    if (sale.advertiserId) {
      await this.recalculateAdvertiserStats(workspaceId, sale.advertiserId);
    }
    return this.mapPayment(updated);
  }

  async voidPayment(
    userId: string,
    saleId: string,
    paymentId: string,
    dto: VoidTelegramAdSalePaymentDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const payment = await this.prisma.telegramAdSalePayment.findFirst({
      where: { id: paymentId, workspaceId, telegramAdSaleId: saleId },
      include: {
        allocations: true,
        account: true,
        transaction: true,
      },
    });
    if (!payment) throw new NotFoundException('Telegram ad sale payment not found');
    if (payment.status === TelegramAdSalePaymentStatus.VOIDED) {
      return this.mapPayment(payment);
    }
    const category = await this.resolveSystemCategory(
      workspaceId,
      'telegram_ad_sales_reversal',
    );
    const reversed = await this.prisma.$transaction(async (tx) => {
      const reversalTransaction = await tx.transaction.create({
        data: {
          workspaceId,
          accountId: payment.accountId,
          telegramChannelId: null,
          type: TransactionType.expense,
          amount: payment.amount,
          currency: payment.account.currency,
          amountInPrimaryCurrency: payment.amountInPrimaryCurrency,
          exchangeRateToPrimary: payment.exchangeRateToPrimary,
          category: category.name,
          categoryId: category.id,
          description: `Void telegram ad sale payment ${payment.id}: ${dto.reason.trim()}`,
          date: new Date(),
          createdByUserId: userId,
        },
      });
      return tx.telegramAdSalePayment.update({
        where: { id: payment.id },
        data: {
          status: TelegramAdSalePaymentStatus.VOIDED,
          voidedAt: new Date(),
          voidReason: dto.reason.trim(),
          reversalTransactionId: reversalTransaction.id,
        },
        include: {
          allocations: true,
          account: true,
          transaction: true,
          reversalTransaction: true,
        },
      });
    });
    const sale = await this.prisma.telegramAdSale.findFirst({
      where: { id: saleId, workspaceId },
      select: { advertiserId: true },
    });
    if (sale?.advertiserId) {
      await this.recalculateAdvertiserStats(workspaceId, sale.advertiserId);
    }
    return this.mapPayment(reversed);
  }

  async createManagedPostFromPlacement(
    userId: string,
    saleId: string,
    placementId: string,
    dto: CreatePlacementManagedPostDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const placement = sale.placements.find((item: any) => item.id === placementId);
    if (!placement) throw new NotFoundException('Telegram ad sale placement not found');
    const managedPost = await this.telegramChannelsService.createManagedPost(
      userId,
      placement.telegramChannelId,
      {
        title:
          dto.title?.trim() ||
          `[AD] ${sale.title?.trim() || sale.advertiserName} / ${sale.id}`,
        text: dto.text ?? undefined,
        imageUrls: dto.imageUrls ?? [],
        assignedMemberId:
          dto.assignedMemberId ?? sale.assignedMemberId ?? undefined,
        icon: dto.icon ?? null,
      },
    );
    await this.prisma.telegramAdSalePlacement.update({
      where: { id: placementId },
      data: { managedPostId: managedPost.id },
    });
    return managedPost;
  }

  async attachManagedPost(
    userId: string,
    saleId: string,
    placementId: string,
    dto: AttachPlacementManagedPostDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const placement = await this.ensurePlacementBelongsToSale(workspaceId, saleId, placementId);
    if (
      placement.status === TelegramAdPlacementStatus.CANCELLED ||
      placement.status === TelegramAdPlacementStatus.COMPLETED
    ) {
      throw new BadRequestException('Placement cannot accept a managed post in its current status');
    }
    if (!dto.managedPostId && !dto.telegramPostId) {
      throw new BadRequestException('managedPostId or telegramPostId is required');
    }
    if (dto.telegramPostId) {
      const telegramPost = await this.prisma.telegramPost.findFirst({
        where: {
          id: dto.telegramPostId,
          workspaceId,
          telegramChannelId: placement.telegramChannelId,
        },
      });
      if (!telegramPost) throw new NotFoundException('Telegram post not found');
      const updated = await this.prisma.telegramAdSalePlacement.update({
        where: { id: placementId },
        data: {
          telegramPostId: telegramPost.id,
          status: TelegramAdPlacementStatus.PUBLISHED,
          publishedAt: telegramPost.postDate,
        },
      });
      return this.mapPlacement(this.appendPlacementFinancials(updated));
    }
    const managedPost = await this.prisma.telegramManagedPost.findFirst({
      where: {
        id: dto.managedPostId,
        workspaceId,
        telegramChannelId: placement.telegramChannelId,
      },
    });
    if (!managedPost) throw new NotFoundException('Managed post not found');
    let telegramPostId: string | null = null;
    if (
      managedPost.status === TelegramManagedPostStatus.PUBLISHED &&
      managedPost.telegramMessageIds.length
    ) {
      const telegramPost = await this.prisma.telegramPost.findFirst({
        where: {
          workspaceId,
          telegramChannelId: placement.telegramChannelId,
          telegramMessageId: { in: managedPost.telegramMessageIds },
        },
        orderBy: { postDate: 'desc' },
      });
      telegramPostId = telegramPost?.id ?? null;
    }
    const updated = await this.prisma.telegramAdSalePlacement.update({
      where: { id: placementId },
      data: {
        managedPostId: managedPost.id,
        ...(managedPost.status === TelegramManagedPostStatus.PUBLISHED
          ? {
              status: TelegramAdPlacementStatus.PUBLISHED,
              publishedAt: managedPost.publishedAt ?? placement.scheduledAt,
              telegramPostId,
            }
          : {}),
      },
    });
    return this.mapPlacement(this.appendPlacementFinancials(updated));
  }

  async detachManagedPost(userId: string, saleId: string, placementId: string) {
    const workspaceId = await this.workspace(userId);
    const placement = await this.prisma.telegramAdSalePlacement.findFirst({
      where: { id: placementId, workspaceId, telegramAdSaleId: saleId },
      include: { managedPost: true, paymentAllocations: { include: { payment: true } } },
    });
    if (!placement) throw new NotFoundException('Telegram ad sale placement not found');
    if (
      placement.managedPost &&
      placement.managedPost.status === TelegramManagedPostStatus.PUBLISHED
    ) {
      throw new BadRequestException('Published managed post cannot be detached');
    }
    const updated = await this.prisma.telegramAdSalePlacement.update({
      where: { id: placementId },
      data: { managedPostId: null },
    });
    return this.mapPlacement(this.appendPlacementFinancials(updated));
  }

  private assertSaleTransition(
    from: TelegramAdSaleStatus,
    to: TelegramAdSaleStatus,
  ) {
    const transitions: Record<TelegramAdSaleStatus, TelegramAdSaleStatus[]> = {
      DRAFT: [TelegramAdSaleStatus.RESERVED, TelegramAdSaleStatus.CANCELLED],
      RESERVED: [TelegramAdSaleStatus.CONFIRMED, TelegramAdSaleStatus.CANCELLED],
      CONFIRMED: [TelegramAdSaleStatus.IN_PROGRESS, TelegramAdSaleStatus.CANCELLED],
      IN_PROGRESS: [TelegramAdSaleStatus.COMPLETED, TelegramAdSaleStatus.CANCELLED],
      COMPLETED: [],
      CANCELLED: [],
    };
    if (!transitions[from].includes(to)) {
      throw new BadRequestException({
        code: 'INVALID_SALE_STATUS_TRANSITION',
        message: `Cannot move sale from ${from} to ${to}`,
      });
    }
  }

  private assertPlacementTransition(
    from: TelegramAdPlacementStatus,
    to: TelegramAdPlacementStatus,
  ) {
    const transitions: Record<TelegramAdPlacementStatus, TelegramAdPlacementStatus[]> = {
      DRAFT: [TelegramAdPlacementStatus.RESERVED, TelegramAdPlacementStatus.CANCELLED],
      RESERVED: [TelegramAdPlacementStatus.SCHEDULED, TelegramAdPlacementStatus.CANCELLED, TelegramAdPlacementStatus.MISSED],
      SCHEDULED: [TelegramAdPlacementStatus.PUBLISHED, TelegramAdPlacementStatus.CANCELLED, TelegramAdPlacementStatus.MISSED],
      PUBLISHED: [TelegramAdPlacementStatus.COMPLETED],
      COMPLETED: [],
      CANCELLED: [],
      MISSED: [],
    };
    if (!transitions[from].includes(to)) {
      throw new BadRequestException({
        code: 'INVALID_PLACEMENT_STATUS_TRANSITION',
        message: `Cannot move placement from ${from} to ${to}`,
      });
    }
  }

  private plannedDeleteAtForPlacement(placement: any) {
    if (placement.isPermanentSnapshot || !placement.deleteAfterHoursSnapshot) {
      return null;
    }
    const publishedAt = placement.scheduledAt instanceof Date
      ? placement.scheduledAt
      : new Date(placement.scheduledAt);
    return new Date(
      publishedAt.getTime() + placement.deleteAfterHoursSnapshot * 60 * 60 * 1000,
    );
  }

  async schedulePlacement(
    userId: string,
    saleId: string,
    placementId: string,
    dto: SchedulePlacementDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const placement = sale.placements.find((item: any) => item.id === placementId);
    if (!placement) throw new NotFoundException('Telegram ad sale placement not found');
    if (!placement.managedPostId) {
      throw new BadRequestException('Managed post is required before scheduling');
    }
    if (sale.status === TelegramAdSaleStatus.DRAFT) {
      throw new BadRequestException('Confirm sale before scheduling');
    }
    this.assertPlacementTransition(placement.status, TelegramAdPlacementStatus.SCHEDULED);
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : placement.scheduledAt;
    await this.assertPlacementConflictFree(
      this.prisma,
      workspaceId,
      placement.id,
      placement.telegramChannelId,
      scheduledAt,
    );
    await this.telegramChannelsService.scheduleManagedPost(
      userId,
      placement.telegramChannelId,
      placement.managedPostId,
      {
        scheduledAt: scheduledAt.toISOString(),
        longTextMode: dto.longTextMode,
      },
    );
    const updated = await this.prisma.telegramAdSalePlacement.update({
      where: { id: placementId },
      data: {
        scheduledAt,
        scheduledManagedAt: scheduledAt,
        status: TelegramAdPlacementStatus.SCHEDULED,
        plannedDeleteAt: this.plannedDeleteAtForPlacement({
          ...placement,
          scheduledAt,
        }),
      },
      include: { paymentAllocations: { include: { payment: true } } },
    });
    if (sale.status === TelegramAdSaleStatus.CONFIRMED) {
      await this.prisma.telegramAdSale.update({
        where: { id: sale.id },
        data: { status: TelegramAdSaleStatus.IN_PROGRESS },
      });
    }
    return this.mapPlacement(this.appendPlacementFinancials(updated));
  }

  async scheduleSale(userId: string, saleId: string, dto: ScheduleSaleDto) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const targets = dto.placements?.length
      ? sale.placements.filter((placement: any) =>
          dto.placements?.some((item) => item.placementId === placement.id),
        )
      : sale.placements.filter((placement: any) => Boolean(placement.managedPostId));
    const results: Array<Record<string, unknown>> = [];
    for (const placement of targets) {
      try {
        const override = dto.placements?.find((item) => item.placementId === placement.id);
        const scheduled = await this.schedulePlacement(userId, saleId, placement.id, {
          scheduledAt: override?.scheduledAt,
          longTextMode: override?.longTextMode,
        });
        results.push({
          placementId: placement.id,
          success: true,
          status: scheduled.status,
          scheduledAt: scheduled.scheduledAt,
        });
      } catch (error) {
        results.push({
          placementId: placement.id,
          success: false,
          error: error instanceof Error ? error.message : 'Could not schedule placement',
        });
      }
    }
    return { saleId, results };
  }

  async publishPlacement(
    userId: string,
    saleId: string,
    placementId: string,
    dto: PublishPlacementDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const placement = await this.prisma.telegramAdSalePlacement.findFirst({
      where: { id: placementId, workspaceId, telegramAdSaleId: saleId },
      include: { managedPost: true, paymentAllocations: { include: { payment: true } } },
    });
    if (!placement) throw new NotFoundException('Telegram ad sale placement not found');
    if (!placement.managedPostId) throw new BadRequestException('Managed post is required');
    await this.telegramChannelsService.publishManagedPostNow(
      userId,
      placement.telegramChannelId,
      placement.managedPostId,
      { longTextMode: dto.longTextMode },
    );
    const updated = await this.prisma.telegramAdSalePlacement.update({
      where: { id: placementId },
      data: {
        status: TelegramAdPlacementStatus.PUBLISHED,
        publishedAt: new Date(),
        plannedDeleteAt:
          placement.isPermanentSnapshot || !placement.deleteAfterHoursSnapshot
            ? null
            : new Date(
                Date.now() + placement.deleteAfterHoursSnapshot * 60 * 60 * 1000,
              ),
      },
      include: { paymentAllocations: { include: { payment: true } } },
    });
    return this.mapPlacement(this.appendPlacementFinancials(updated));
  }

  async reschedulePlacement(
    userId: string,
    saleId: string,
    placementId: string,
    dto: ReschedulePlacementDto,
  ) {
    return this.schedulePlacement(userId, saleId, placementId, dto);
  }

  async cancelPlacement(
    userId: string,
    saleId: string,
    placementId: string,
    _dto: CancelPlacementDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const placement = await this.prisma.telegramAdSalePlacement.findFirst({
      where: { id: placementId, workspaceId, telegramAdSaleId: saleId },
      include: { paymentAllocations: { include: { payment: true } }, managedPost: true },
    });
    if (!placement) throw new NotFoundException('Telegram ad sale placement not found');
    if (placement.status === TelegramAdPlacementStatus.PUBLISHED) {
      throw new BadRequestException('Published placement requires a separate completion/deletion flow');
    }
    const hasPaidAllocation = (placement.paymentAllocations ?? []).some(
      (allocation: any) => allocation.payment?.status !== TelegramAdSalePaymentStatus.VOIDED,
    );
    if (hasPaidAllocation) {
      throw new BadRequestException('Paid placement cannot be cancelled without payment reversal');
    }
    const updated = await this.prisma.telegramAdSalePlacement.update({
      where: { id: placementId },
      data: { status: TelegramAdPlacementStatus.CANCELLED },
      include: { paymentAllocations: { include: { payment: true } } },
    });
    return this.mapPlacement(this.appendPlacementFinancials(updated));
  }

  async completePermanentPlacement(
    userId: string,
    saleId: string,
    placementId: string,
    _dto: CompletePermanentPlacementDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const placement = await this.ensurePlacementBelongsToSale(workspaceId, saleId, placementId);
    if (!placement.isPermanentSnapshot) {
      throw new BadRequestException('Only permanent placements can be completed manually');
    }
    if (placement.status !== TelegramAdPlacementStatus.PUBLISHED) {
      throw new BadRequestException('Only published permanent placements can be completed');
    }
    const metrics = await this.reconcilePlacementMetrics(workspaceId, placement.id);
    const updated = await this.prisma.telegramAdSalePlacement.update({
      where: { id: placement.id },
      data: {
        status: TelegramAdPlacementStatus.COMPLETED,
        completedAt: new Date(),
        actualViewsFinal: metrics.actualViewsFinal ?? placement.actualViewsFinal,
        actualCpm: metrics.actualCpm ?? placement.actualCpm,
      },
      include: { paymentAllocations: { include: { payment: true } } },
    });
    return this.mapPlacement(this.appendPlacementFinancials(updated));
  }

  private async reconcilePlacementMetrics(workspaceId: string, placementId: string) {
    const placement = await this.prisma.telegramAdSalePlacement.findFirst({
      where: { id: placementId, workspaceId },
      include: {
        managedPost: true,
        telegramPost: true,
      },
    });
    if (!placement) throw new NotFoundException('Telegram ad sale placement not found');

    let telegramPost = placement.telegramPost;
    if (!telegramPost && placement.managedPost?.telegramMessageIds?.length) {
      telegramPost = await this.prisma.telegramPost.findFirst({
        where: {
          workspaceId,
          telegramChannelId: placement.telegramChannelId,
          telegramMessageId: {
            in: placement.managedPost.telegramMessageIds,
          },
        },
        orderBy: { postDate: 'desc' },
      });
      if (telegramPost) {
        await this.prisma.telegramAdSalePlacement.update({
          where: { id: placement.id },
          data: { telegramPostId: telegramPost.id },
        });
      }
    }

    if (!telegramPost) {
      return {
        actualViews24h: null,
        actualViews48h: null,
        actualViewsFinal: null,
        actualCpm: null,
      };
    }

    const snapshots = await this.prisma.telegramPostMetricSnapshot.findMany({
      where: { telegramPostId: telegramPost.id },
      orderBy: { collectedAt: 'asc' },
    });
    const publishedAt = placement.publishedAt ?? telegramPost.postDate;
    const withinHours = (hours: number) =>
      snapshots
        .filter(
          (snapshot) =>
            Math.abs(snapshot.collectedAt.getTime() - publishedAt.getTime()) <=
            hours * 60 * 60 * 1000,
        )
        .sort((left, right) => right.collectedAt.getTime() - left.collectedAt.getTime())[0] ?? null;
    const around24 = withinHours(26);
    const around48 = withinHours(50);
    const finalViews =
      telegramPost.viewsCount ??
      (snapshots.length
        ? snapshots[snapshots.length - 1].viewsCount ?? null
        : null);
    const actualViewsFinal = finalViews == null ? null : Math.max(0, finalViews);
    const actualCpm =
      actualViewsFinal && actualViewsFinal > 0
        ? decimal(placement.agreedPrice)
            .div(decimal(actualViewsFinal))
            .mul(1000)
            .toDecimalPlaces(2)
        : null;
    return {
      actualViews24h: around24?.viewsCount ?? null,
      actualViews48h: around48?.viewsCount ?? null,
      actualViewsFinal,
      actualCpm,
    };
  }

  private async deletePublishedPlacement(workspaceId: string, placementId: string) {
    const placement = await this.prisma.telegramAdSalePlacement.findFirst({
      where: { id: placementId, workspaceId },
      include: {
        managedPost: true,
        telegramChannel: true,
      },
    });
    if (!placement) throw new NotFoundException('Telegram ad sale placement not found');
    if (!placement.managedPost) {
      throw new BadRequestException('Managed post is required for deletion');
    }
    if (!placement.managedPost.telegramMessageIds.length) {
      throw new BadRequestException('Managed post has no published telegram messages');
    }
    const sources = await this.sourceAccessService.sourcesForChannel(
      workspaceId,
      placement.telegramChannelId,
    );
    const selectedSource = sources.find(
      (source) =>
        source.sourceType === placement.managedPost?.sourceType &&
        source.sourceId === placement.managedPost?.sourceId &&
        source.permissions.canDeleteMessages,
    );
    if (!selectedSource) {
      throw new BadRequestException('No connected source can delete this placement');
    }

    if (selectedSource.sourceType === TelegramSourceType.MTPROTO) {
      const account = await this.prisma.telegramUserAccountIntegration.findFirst({
        where: {
          id: selectedSource.sourceId,
          workspaceId,
          isActive: true,
        },
      });
      if (!account?.sessionEncrypted) {
        throw new BadRequestException('MTProto source is not connected');
      }
      const apiHash = this.encryptionService.decrypt({
        encrypted: account.apiHashEncrypted,
        iv: account.apiHashIv,
        authTag: account.apiHashAuthTag,
      });
      const session = this.encryptionService.decrypt({
        encrypted: account.sessionEncrypted,
        iv: account.sessionIv ?? '',
        authTag: account.sessionAuthTag ?? '',
      });
      await this.mtprotoClient.deletePublishedMessages({
        apiId: account.apiId,
        apiHash,
        session,
        channel: {
          telegramChatId: placement.telegramChannel.telegramChatId,
          username: placement.telegramChannel.username,
          telegramAccessHash: placement.telegramChannel.telegramAccessHash,
        },
        messageIds: placement.managedPost.telegramMessageIds,
      });
    } else {
      const bot = await this.prisma.telegramBotIntegration.findFirst({
        where: { id: selectedSource.sourceId, workspaceId, isActive: true },
      });
      if (!bot) throw new BadRequestException('Telegram bot is not connected');
      const token = this.encryptionService.decrypt({
        encrypted: bot.botTokenEncrypted,
        iv: bot.botTokenIv,
        authTag: bot.botTokenAuthTag,
      });
      if (!placement.telegramChannel.telegramChatId) {
        throw new BadRequestException('Channel has no Telegram chat id');
      }
      for (const messageId of placement.managedPost.telegramMessageIds) {
        const response = await fetch(
          `https://api.telegram.org/bot${token}/deleteMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: placement.telegramChannel.telegramChatId,
              message_id: Number(messageId),
            }),
          },
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          description?: string;
        };
        if (!response.ok || !payload.ok) {
          throw new BadRequestException(
            payload.description || 'Telegram Bot API deletion failed',
          );
        }
      }
    }

    const metrics = await this.reconcilePlacementMetrics(workspaceId, placement.id);
    await this.prisma.$transaction([
      this.prisma.telegramManagedPost.update({
        where: { id: placement.managedPost.id },
        data: {
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.MISSING,
          lastTelegramSyncedAt: new Date(),
          lastTelegramSyncNote: 'Placement deleted after ad format expiry.',
        },
      }),
      this.prisma.telegramAdSalePlacement.update({
        where: { id: placement.id },
        data: {
          deletedAt: new Date(),
          status: TelegramAdPlacementStatus.COMPLETED,
          completedAt: new Date(),
          lastDeletionAttemptAt: new Date(),
          lastDeletionError: null,
          actualViews24h: metrics.actualViews24h,
          actualViews48h: metrics.actualViews48h,
          actualViewsFinal: metrics.actualViewsFinal,
          actualCpm: metrics.actualCpm,
        },
      }),
    ]);
    return this.getSaleDetails(workspaceId, placement.telegramAdSaleId);
  }

  async retryDeletion(
    userId: string,
    saleId: string,
    placementId: string,
    _dto: RetryPlacementDeletionDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const placement = await this.ensurePlacementBelongsToSale(workspaceId, saleId, placementId);
    if (placement.isPermanentSnapshot) {
      throw new BadRequestException('Permanent placement cannot use automatic deletion retry');
    }
    try {
      await this.deletePublishedPlacement(workspaceId, placement.id);
    } catch (error) {
      await this.prisma.telegramAdSalePlacement.update({
        where: { id: placement.id },
        data: {
          lastDeletionAttemptAt: new Date(),
          lastDeletionError: error instanceof Error ? error.message : 'Deletion failed',
        },
      });
      throw error;
    }
    return this.getSale(userId, saleId);
  }

  async reconcileSale(userId: string, saleId: string) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const channelIds = [...new Set(sale.placements.map((placement: any) => placement.telegramChannelId))];
    for (const channelId of channelIds) {
      await this.telegramChannelsService.syncManagedPosts(userId, channelId);
    }

    const refreshed = await this.getSaleDetails(workspaceId, saleId);
    for (const placement of refreshed.placements) {
      const metrics = await this.reconcilePlacementMetrics(workspaceId, placement.id);
      const managedPost = await this.prisma.telegramManagedPost.findFirst({
        where: { id: placement.managedPostId ?? undefined, workspaceId },
      });
      const updateData: Prisma.TelegramAdSalePlacementUpdateInput = {
        actualViews24h: metrics.actualViews24h,
        actualViews48h: metrics.actualViews48h,
        actualViewsFinal: metrics.actualViewsFinal,
        actualCpm: metrics.actualCpm,
      };
      if (managedPost?.status === TelegramManagedPostStatus.PUBLISHED) {
        updateData.status = TelegramAdPlacementStatus.PUBLISHED;
        updateData.publishedAt = managedPost.publishedAt ?? new Date();
      }
      if (
        managedPost?.status === TelegramManagedPostStatus.PUBLISHED &&
        placement.telegramPostId == null &&
        managedPost.telegramMessageIds.length
      ) {
        const telegramPost = await this.prisma.telegramPost.findFirst({
          where: {
            workspaceId,
            telegramChannelId: placement.telegramChannelId,
            telegramMessageId: { in: managedPost.telegramMessageIds },
          },
          orderBy: { postDate: 'desc' },
        });
        if (telegramPost) {
          updateData.telegramPost = { connect: { id: telegramPost.id } };
        }
      }
      await this.prisma.telegramAdSalePlacement.update({
        where: { id: placement.id },
        data: updateData,
      });
    }
    return this.getSale(userId, saleId);
  }

  async saleMetrics(userId: string, saleId: string) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const updated: Array<Record<string, unknown>> = [];
    for (const placement of sale.placements) {
      const metrics = await this.reconcilePlacementMetrics(workspaceId, placement.id);
      updated.push({
        placementId: placement.id,
        ...metrics,
        actualCpm: decimalToString(metrics.actualCpm),
      });
      await this.prisma.telegramAdSalePlacement.update({
        where: { id: placement.id },
        data: {
          actualViews24h: metrics.actualViews24h,
          actualViews48h: metrics.actualViews48h,
          actualViewsFinal: metrics.actualViewsFinal,
          actualCpm: metrics.actualCpm,
        },
      });
    }
    return { saleId, placements: updated };
  }

  async processDueDeletionBatch(limit = 20) {
    const items = await this.prisma.telegramAdSalePlacement.findMany({
      where: {
        status: TelegramAdPlacementStatus.PUBLISHED,
        plannedDeleteAt: { lte: new Date() },
        deletedAt: null,
        isPermanentSnapshot: false,
      },
      orderBy: { plannedDeleteAt: 'asc' },
      take: Math.max(1, Math.min(100, limit)),
      select: {
        id: true,
        workspaceId: true,
      },
    });
    let processed = 0;
    let failed = 0;
    for (const item of items) {
      try {
        await this.deletePublishedPlacement(item.workspaceId, item.id);
        processed += 1;
      } catch (error) {
        failed += 1;
        await this.prisma.telegramAdSalePlacement.update({
          where: { id: item.id },
          data: {
            lastDeletionAttemptAt: new Date(),
            lastDeletionError: error instanceof Error ? error.message : 'Deletion failed',
          },
        });
      }
    }
    return { processed, failed };
  }

  private advisoryLockKey(channelId: string, dateKey: string) {
    return telegramAdSalesAdvisoryLockKey(channelId, dateKey);
  }

  private async assertPlacementConflictFree(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    placementId: string,
    channelId: string,
    scheduledAt: Date,
  ) {
    await assertTelegramAdPlacementConflictFree(tx, {
      workspaceId,
      placementId,
      channelId,
      scheduledAt,
      logger: this.logger,
    });
  }

  async reserveSale(userId: string, saleId: string, dto: ReserveTelegramAdSaleDto) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    const targetPlacements = dto.placements?.length
      ? sale.placements.filter((placement) =>
          dto.placements?.some((item) => item.placementId === placement.id),
        )
      : sale.placements;
    if (!targetPlacements.length) {
      throw new BadRequestException('No placements selected for reservation');
    }

    const reserved = await this.prisma.$transaction(async (tx) => {
      this.assertSaleTransition(sale.status, TelegramAdSaleStatus.RESERVED);
      for (const placement of targetPlacements) {
        const override = dto.placements?.find((item) => item.placementId === placement.id);
        const scheduledAt = override?.scheduledAt
          ? new Date(override.scheduledAt)
          : placement.scheduledAt;
        const dateKey = utcDateKey(scheduledAt, placement.timezone);
        const key = this.advisoryLockKey(placement.telegramChannelId, dateKey);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
        await this.assertPlacementConflictFree(
          tx,
          workspaceId,
          placement.id,
          placement.telegramChannelId,
          scheduledAt,
        );
        await tx.telegramAdSalePlacement.update({
          where: { id: placement.id },
          data: {
            scheduledAt,
            status: TelegramAdPlacementStatus.RESERVED,
          },
        });
      }
      await tx.telegramAdSale.update({
        where: { id: saleId },
        data: { status: TelegramAdSaleStatus.RESERVED },
      });
      return tx.telegramAdSale.findUniqueOrThrow({
        where: { id: saleId },
        include: this.includeSaleRelations(),
      });
    });

    this.logger.info({
      event: 'telegram_ad_sales.slot_reserved',
      message: `Reserved sale ${saleId}`,
      metadata: {
        saleId,
        placements: targetPlacements.map((placement) => placement.id),
      },
    });

    return this.mapSale(reserved);
  }

  async confirmSale(userId: string, saleId: string) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    this.assertSaleTransition(sale.status, TelegramAdSaleStatus.CONFIRMED);
    if (!sale.placements.length) {
      throw new BadRequestException('Cannot confirm sale without placements');
    }
    const confirmedSale = await this.prisma.$transaction(async (tx) => {
      await tx.telegramAdSalePlacement.updateMany({
        where: {
          workspaceId,
          telegramAdSaleId: saleId,
          status: TelegramAdPlacementStatus.RESERVED,
        },
        data: { status: TelegramAdPlacementStatus.RESERVED },
      });
      await tx.telegramAdSale.update({
        where: { id: saleId },
        data: { status: TelegramAdSaleStatus.CONFIRMED },
      });
      return tx.telegramAdSale.findUniqueOrThrow({
        where: { id: saleId },
        include: this.includeSaleRelations(),
      });
    });
    this.logger.info({
      event: 'telegram_ad_sales.sale_confirmed',
      message: `Confirmed sale ${saleId}`,
      metadata: { saleId },
    });
    return this.mapSale(confirmedSale);
  }

  async cancelSale(userId: string, saleId: string) {
    const workspaceId = await this.workspace(userId);
    const sale = await this.getSaleDetails(workspaceId, saleId);
    this.assertSaleTransition(sale.status, TelegramAdSaleStatus.CANCELLED);
    const activePaidPayments = (sale.payments ?? []).some(
      (payment: any) => payment.status !== TelegramAdSalePaymentStatus.VOIDED,
    );
    if (activePaidPayments) {
      throw new BadRequestException('Cannot cancel paid sale without voiding payments');
    }
    const cancelledSale = await this.prisma.$transaction(async (tx) => {
      await tx.telegramAdSalePlacement.updateMany({
        where: {
          workspaceId,
          telegramAdSaleId: saleId,
          status: { not: TelegramAdPlacementStatus.COMPLETED },
        },
        data: { status: TelegramAdPlacementStatus.CANCELLED },
      });
      await tx.telegramAdSale.update({
        where: { id: saleId },
        data: { status: TelegramAdSaleStatus.CANCELLED },
      });
      return tx.telegramAdSale.findUniqueOrThrow({
        where: { id: saleId },
        include: this.includeSaleRelations(),
      });
    });
    this.logger.info({
      event: 'telegram_ad_sales.sale_cancelled',
      message: `Cancelled sale ${saleId}`,
      metadata: { saleId },
    });
    return this.mapSale(cancelledSale);
  }
}
