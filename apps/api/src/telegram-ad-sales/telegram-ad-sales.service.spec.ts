import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TelegramAdPlacementStatus,
  TelegramAdPricingMode,
  TelegramAdSalePaymentStatus,
  TelegramAdSaleStatus,
  TelegramAdvertiserLifecycleStage,
  TelegramAdvertiserStatus,
  TelegramAdvertiserTaskPriority,
  TelegramAdvertiserTaskStatus,
  TransactionType,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TelegramAdAlertsQueryDto, TelegramAdAnalyticsQueryDto } from './dto';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

const decimal = (value: number | string) => new Prisma.Decimal(value);

function makePlacement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'placement-1',
    workspaceId: 'ws-1',
    telegramAdSaleId: 'sale-1',
    telegramChannelId: 'channel-1',
    telegramChannelNetworkId: null,
    pricingSnapshotId: null,
    telegramAdProductId: null,
    status: TelegramAdPlacementStatus.DRAFT,
    scheduledAt: new Date('2026-08-02T10:00:00.000Z'),
    timezone: 'UTC',
    pricingMode: TelegramAdPricingMode.CPM,
    expectedViews: 1000,
    quotedCpm: null,
    recommendedPrice: decimal(150),
    minimumPrice: decimal(120),
    agreedPrice: decimal(150),
    currency: 'USD',
    scheduledManagedAt: null,
    topDurationMinutesSnapshot: null,
    feedDurationHoursSnapshot: null,
    deleteAfterHoursSnapshot: 24,
    isPermanentSnapshot: false,
    manualPriceReason: null,
    managedPostId: null,
    telegramPostId: null,
    publishedAt: null,
    plannedDeleteAt: null,
    deletedAt: null,
    lastDeletionAttemptAt: null,
    lastDeletionError: null,
    actualViews24h: null,
    actualViews48h: null,
    actualViewsFinal: null,
    actualCpm: null,
    completedAt: null,
    createdAt: new Date('2026-07-31T00:00:00.000Z'),
    updatedAt: new Date('2026-07-31T00:00:00.000Z'),
    paymentAllocations: [],
    managedPost: null,
    telegramPost: null,
    ...overrides,
  };
}

function makeSale(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    workspaceId: 'ws-1',
    advertiserName: 'Advertiser',
    advertiserTelegram: null,
    advertiserContact: null,
    title: 'Sale',
    notes: null,
    status: TelegramAdSaleStatus.DRAFT,
    settlementCurrency: 'USD',
    reservedUntil: null,
    createdByUserId: 'user-1',
    assignedMemberId: 'member-1',
    createdAt: new Date('2026-07-31T00:00:00.000Z'),
    updatedAt: new Date('2026-07-31T00:00:00.000Z'),
    placements: [makePlacement()],
    payments: [],
    ...overrides,
  };
}

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment-1',
    workspaceId: 'ws-1',
    telegramAdSaleId: 'sale-1',
    accountId: 'account-1',
    transactionId: 'tx-1',
    amount: decimal(120),
    currency: 'USD',
    amountInPrimaryCurrency: decimal(120),
    exchangeRateToPrimary: decimal(1),
    paidAt: new Date('2026-08-01T09:00:00.000Z'),
    notes: 'First tranche',
    status: TelegramAdSalePaymentStatus.ACTIVE,
    idempotencyKey: 'idem-1',
    reversalTransactionId: null,
    voidedAt: null,
    voidReason: null,
    createdByUserId: 'user-1',
    createdAt: new Date('2026-08-01T09:00:00.000Z'),
    updatedAt: new Date('2026-08-01T09:00:00.000Z'),
    allocations: [
      {
        id: 'allocation-1',
        workspaceId: 'ws-1',
        telegramAdSalePaymentId: 'payment-1',
        telegramAdSalePlacementId: 'placement-1',
        amount: decimal(120),
        currency: 'USD',
        amountInPrimaryCurrency: decimal(120),
        createdAt: new Date('2026-08-01T09:00:00.000Z'),
        payment: null,
      },
    ],
    account: {
      id: 'account-1',
      name: 'Main account',
      currency: 'USD',
    },
    transaction: {
      id: 'tx-1',
      date: new Date('2026-08-01T09:00:00.000Z'),
      amount: decimal(120),
      type: TransactionType.income,
      category: 'Channel Advertising Revenue',
    },
    reversalTransaction: null,
    ...overrides,
  };
}

function createService() {
  const prisma: any = {
    workspace: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    account: { findFirst: jest.fn() },
    transactionCategory: { findFirst: jest.fn() },
    transaction: { create: jest.fn() },
    telegramManagedPost: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    telegramPostMetricSnapshot: { findMany: jest.fn() },
    telegramChannel: { findFirst: jest.fn(), findMany: jest.fn() },
    telegramChannelNetwork: { findFirst: jest.fn() },
    telegramAdSale: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    telegramAdProduct: {
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    telegramAdSchedulePolicy: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    telegramAdSalesWorkspaceSettings: { upsert: jest.fn() },
    telegramAdCrmWorkspaceSettings: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    telegramAdvertiser: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    telegramAdvertiserContact: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    telegramAdvertiserActivity: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    telegramAdvertiserTask: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    telegramAdPriceSnapshot: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    telegramAdSalePlacement: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    telegramAdSalePayment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    telegramPost: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    telegramChannelAudienceSnapshot: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const workspaceService: any = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-1'),
    resolveAssignedMemberId: jest.fn().mockResolvedValue({
      workspaceId: 'ws-1',
      assignedMemberId: 'member-1',
    }),
  };
  prisma.workspace.findUniqueOrThrow.mockResolvedValue({ timezone: 'UTC' });
  prisma.telegramAdSalesWorkspaceSettings.upsert.mockResolvedValue({
    workspaceId: 'ws-1',
    defaultOrganicPostsPerAdSlot: 3,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  });
  const logger: any = { info: jest.fn() };
  const responseCache: any = {
    getOrSet: jest.fn(
      async (_key: string, _ttlMs: number, load: () => Promise<unknown>) =>
        load(),
    ),
    clearByPrefix: jest.fn(),
  };
  const currencyConversionService: any = {
    getRate: jest.fn().mockResolvedValue(1),
    convertCurrency: jest.fn(),
  };
  const financeCategoriesService: any = {
    ensureSystemCategories: jest.fn().mockResolvedValue(undefined),
  };
  const telegramChannelsService: any = {
    createManagedPost: jest.fn(),
    scheduleManagedPost: jest.fn(),
    publishManagedPostNow: jest.fn(),
    syncManagedPosts: jest.fn(),
  };
  const mtprotoClient: any = { deletePublishedMessages: jest.fn() };
  const sourceAccessService: any = { sourcesForChannel: jest.fn() };
  const encryptionService: any = { decrypt: jest.fn() };
  const service = new TelegramAdSalesService(
    prisma,
    workspaceService,
    logger,
    responseCache,
    currencyConversionService,
    financeCategoriesService,
    telegramChannelsService,
    mtprotoClient,
    sourceAccessService,
    encryptionService,
  );
  return {
    service,
    prisma,
    workspaceService,
    logger,
    responseCache,
    currencyConversionService,
    financeCategoriesService,
    telegramChannelsService,
  };
}

describe('TelegramAdSalesService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('accepts analytics from/to aliases with whitelist validation and maps them into the range', async () => {
    const dto = plainToInstance(TelegramAdAnalyticsQueryDto, {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-07T23:59:59.000Z',
      timezone: 'UTC',
      networkId: 'network-1',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
    const { service } = createService();
    const range = (service as any).analyticsRange(dto);
    expect(range.from.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-08-07T23:59:59.000Z');
    expect(dto.networkId).toBe('network-1');

    const alertsDto = plainToInstance(TelegramAdAlertsQueryDto, {
      dateFrom: '2026-08-01T00:00:00.000Z',
      dateTo: '2026-08-07T23:59:59.000Z',
      networkId: 'network-1',
    });

    await expect(
      validate(alertsDto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toHaveLength(0);
  });

  it('enforces workspace isolation for channel products', async () => {
    const { service, prisma } = createService();
    prisma.telegramChannel.findFirst.mockResolvedValue(null);

    await expect(
      service.listChannelProducts('user-1', 'channel-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('requires manual reason when price is below minimum', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSalePlacement.findFirst.mockResolvedValue(
      makePlacement({
        agreedPrice: decimal(100),
        minimumPrice: decimal(120),
        manualPriceReason: null,
      }),
    );

    await expect(
      service.updatePlacement('user-1', 'sale-1', 'placement-1', {
        agreedPrice: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('attaches a published managed post to a past placement and marks it published', async () => {
    const { service, prisma } = createService();
    const placement = makePlacement({
      status: TelegramAdPlacementStatus.RESERVED,
      scheduledAt: new Date('2026-08-01T10:00:00.000Z'),
    });
    jest
      .spyOn(service as any, 'ensurePlacementBelongsToSale')
      .mockResolvedValue(placement);
    prisma.telegramManagedPost.findFirst.mockResolvedValue({
      id: 'managed-post-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-08-01T18:00:00.000Z'),
      telegramMessageIds: ['42'],
    });
    prisma.telegramPost.findFirst.mockResolvedValue({
      id: 'post-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      telegramMessageId: '42',
    });
    prisma.telegramAdSalePlacement.update.mockResolvedValue(
      makePlacement({
        status: TelegramAdPlacementStatus.PUBLISHED,
        managedPostId: 'managed-post-1',
        telegramPostId: 'post-1',
        publishedAt: new Date('2026-08-01T18:00:00.000Z'),
      }),
    );

    await service.attachManagedPost('user-1', 'sale-1', 'placement-1', {
      managedPostId: 'managed-post-1',
    });

    expect(prisma.telegramAdSalePlacement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'placement-1' },
        data: expect.objectContaining({
          managedPostId: 'managed-post-1',
          status: TelegramAdPlacementStatus.PUBLISHED,
          telegramPostId: 'post-1',
        }),
      }),
    );
  });

  it('creates immutable price snapshots', async () => {
    const { service, prisma } = createService();
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'ws-1',
      timePosts: [],
      language: 'UTC',
      adBaseCpm: decimal(10),
      adBaseCurrency: 'USD',
    });
    prisma.telegramPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        postDate: new Date('2026-08-01T00:00:00.000Z'),
        viewsCount: 900,
        manualOwnViews: 0,
        excludeFromAnalytics: false,
        adSalePlacements: [],
        metricSnapshots: [],
      },
      {
        id: 'post-2',
        postDate: new Date('2026-07-31T00:00:00.000Z'),
        viewsCount: 1000,
        manualOwnViews: 0,
        excludeFromAnalytics: false,
        adSalePlacements: [],
        metricSnapshots: [],
      },
      {
        id: 'post-3',
        postDate: new Date('2026-07-30T00:00:00.000Z'),
        viewsCount: 1100,
        manualOwnViews: 0,
        excludeFromAnalytics: false,
        adSalePlacements: [],
        metricSnapshots: [],
      },
    ]);
    prisma.telegramChannelAudienceSnapshot.findFirst.mockResolvedValue({
      avgViewsAdjusted: 1000,
      dataQuality: 'normal',
    });
    prisma.telegramAdPriceSnapshot.create
      .mockResolvedValueOnce({
        id: 'snapshot-1',
        expectedViews: 1000,
        targetCpm: decimal(10),
        recommendedPrice: decimal(10),
        minimumPrice: decimal(10),
        currency: 'USD',
        calculatedAt: new Date('2026-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'snapshot-2',
        expectedViews: 1000,
        targetCpm: decimal(10),
        recommendedPrice: decimal(10),
        minimumPrice: decimal(10),
        currency: 'USD',
        calculatedAt: new Date('2026-08-01T00:01:00.000Z'),
        createdAt: new Date('2026-08-01T00:01:00.000Z'),
      });

    const first = await service.createQuote('user-1', {
      telegramChannelId: 'channel-1',
      targetCpm: 10,
    });
    const second = await service.createQuote('user-1', {
      telegramChannelId: 'channel-1',
      targetCpm: 10,
    });

    expect(first.snapshotId).not.toBe(second.snapshotId);
    expect(prisma.telegramAdPriceSnapshot.create).toHaveBeenCalledTimes(2);
  });

  it('prices quote from post metrics available at scheduled time', async () => {
    const { service, prisma } = createService();
    const scheduledAt = new Date('2026-08-02T12:00:00.000Z');
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'ws-1',
      timePosts: [],
      adBaseCpm: decimal(10),
      adBaseCurrency: 'UAH',
      currentSubscribersCount: 10000,
      ownViewsPerPost: null,
    });
    prisma.telegramPost.findMany.mockResolvedValue([
      {
        id: 'post-future',
        postDate: new Date('2026-08-03T10:00:00.000Z'),
        viewsCount: 5000,
        manualOwnViews: null,
        excludeFromAnalytics: false,
        adSalePlacements: [],
        metricSnapshots: [
          {
            viewsCount: 5000,
            collectedAt: new Date('2026-08-03T12:00:00.000Z'),
          },
        ],
      },
      {
        id: 'post-1',
        postDate: new Date('2026-08-01T10:00:00.000Z'),
        viewsCount: 9000,
        manualOwnViews: null,
        excludeFromAnalytics: false,
        adSalePlacements: [],
        metricSnapshots: [
          {
            viewsCount: 1000,
            collectedAt: new Date('2026-08-01T12:00:00.000Z'),
          },
          {
            viewsCount: 9000,
            collectedAt: new Date('2026-08-03T12:00:00.000Z'),
          },
        ],
      },
      {
        id: 'post-2',
        postDate: new Date('2026-07-31T10:00:00.000Z'),
        viewsCount: 9100,
        manualOwnViews: null,
        excludeFromAnalytics: false,
        adSalePlacements: [],
        metricSnapshots: [
          {
            viewsCount: 1100,
            collectedAt: new Date('2026-07-31T12:00:00.000Z'),
          },
        ],
      },
      {
        id: 'post-3',
        postDate: new Date('2026-07-30T10:00:00.000Z'),
        viewsCount: 9200,
        manualOwnViews: null,
        excludeFromAnalytics: false,
        adSalePlacements: [],
        metricSnapshots: [
          {
            viewsCount: 1200,
            collectedAt: new Date('2026-07-30T12:00:00.000Z'),
          },
        ],
      },
    ]);
    prisma.telegramAdPriceSnapshot.create.mockImplementation(
      async ({ data }: any) => ({
        id: 'snapshot-historical',
        expectedViews: data.expectedViews,
        targetCpm: data.targetCpm,
        recommendedPrice: data.recommendedPrice,
        minimumPrice: data.minimumPrice,
        currency: data.currency,
        calculatedAt: new Date('2026-08-08T00:00:00.000Z'),
        createdAt: new Date('2026-08-08T00:00:00.000Z'),
      }),
    );

    const quote = await service.createQuote('user-1', {
      telegramChannelId: 'channel-1',
      targetCpm: 10,
      currency: 'UAH',
      scheduledAt: scheduledAt.toISOString(),
    });

    expect(prisma.telegramPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          postDate: { lte: scheduledAt },
        }),
        select: expect.objectContaining({
          metricSnapshots: expect.objectContaining({
            where: { collectedAt: { lte: scheduledAt } },
          }),
        }),
      }),
    );
    expect(prisma.telegramAdPriceSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expectedViews: 1100,
          recommendedPrice: decimal(11),
          currency: 'UAH',
        }),
      }),
    );
    expect(quote.expectedViews).toBe(1100);
    expect(quote.recommendedPrice).toBe('11');
  });

  it('uses latest available pricing when a future quote has no scheduled-time sample yet', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'ws-1',
      timePosts: [],
      adBaseCpm: decimal(10),
      adBaseCurrency: 'UAH',
      currentSubscribersCount: 10000,
      ownViewsPerPost: null,
    });
    prisma.telegramPost.findMany
      .mockResolvedValueOnce([
        {
          id: 'post-no-snapshot',
          postDate: new Date('2026-08-05T10:00:00.000Z'),
          viewsCount: 7750,
          manualOwnViews: null,
          excludeFromAnalytics: false,
          adSalePlacements: [],
          metricSnapshots: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'post-1',
          postDate: new Date('2026-08-05T10:00:00.000Z'),
          viewsCount: 7700,
          manualOwnViews: null,
          excludeFromAnalytics: false,
          adSalePlacements: [],
          metricSnapshots: [],
        },
        {
          id: 'post-2',
          postDate: new Date('2026-08-04T10:00:00.000Z'),
          viewsCount: 7750,
          manualOwnViews: null,
          excludeFromAnalytics: false,
          adSalePlacements: [],
          metricSnapshots: [],
        },
        {
          id: 'post-3',
          postDate: new Date('2026-08-03T10:00:00.000Z'),
          viewsCount: 7800,
          manualOwnViews: null,
          excludeFromAnalytics: false,
          adSalePlacements: [],
          metricSnapshots: [],
        },
      ]);
    prisma.telegramAdPriceSnapshot.create.mockImplementation(
      async ({ data }: any) => ({
        id: 'snapshot-future-fallback',
        expectedViews: data.expectedViews,
        targetCpm: data.targetCpm,
        recommendedPrice: data.recommendedPrice,
        minimumPrice: data.minimumPrice,
        currency: data.currency,
        calculatedAt: new Date('2026-08-08T12:00:00.000Z'),
        createdAt: new Date('2026-08-08T12:00:00.000Z'),
      }),
    );

    const quote = await service.createQuote('user-1', {
      telegramChannelId: 'channel-1',
      targetCpm: 10,
      currency: 'UAH',
      scheduledAt: '2026-08-15T12:00:00.000Z',
    });

    expect(prisma.telegramPost.findMany).toHaveBeenCalledTimes(2);
    expect(quote.expectedViews).toBe(7750);
    expect(quote.recommendedPrice).toBe('77.5');
    jest.useRealTimers();
  });

  it('detects reservation conflicts transactionally', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        status: TelegramAdSaleStatus.DRAFT,
        placements: [
          makePlacement({
            status: TelegramAdPlacementStatus.DRAFT,
          }),
        ],
      }),
    );
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        telegramAdSalePlacement: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'conflict-1',
            telegramAdSaleId: 'sale-2',
            scheduledAt: new Date('2026-08-02T10:00:00.000Z'),
            status: TelegramAdPlacementStatus.RESERVED,
          }),
          update: jest.fn(),
        },
        telegramAdSale: {
          update: jest.fn(),
          findUniqueOrThrow: jest.fn(),
        },
      }),
    );

    await expect(
      service.reserveSale('user-1', 'sale-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('supports network placements with multiple channels', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        placements: [],
      }),
    );
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'ws-1',
      timePosts: [],
    });
    prisma.telegramChannelNetwork.findFirst.mockResolvedValue({
      id: 'network-1',
      workspaceId: 'ws-1',
      channels: [
        { telegramChannelId: 'channel-1' },
        { telegramChannelId: 'channel-2' },
      ],
    });
    prisma.telegramAdSalePlacement.create.mockResolvedValue(
      makePlacement({
        telegramChannelNetworkId: 'network-1',
      }),
    );

    const result = await service.addPlacement('user-1', 'sale-1', {
      telegramChannelId: 'channel-1',
      telegramChannelNetworkId: 'network-1',
      scheduledAt: '2026-08-02T10:00:00.000Z',
      timezone: 'UTC',
    });

    expect(result.telegramChannelNetworkId).toBe('network-1');
  });

  it('creates payment transactions with allocations', async () => {
    const { service, prisma, financeCategoriesService } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        status: TelegramAdSaleStatus.CONFIRMED,
        placements: [
          makePlacement({
            agreedPrice: decimal(200),
            paymentAllocations: [],
          }),
        ],
      }),
    );
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      workspaceId: 'ws-1',
      name: 'Main account',
      currency: 'USD',
      isActive: true,
    });
    prisma.workspace.findUnique.mockResolvedValue({ primaryCurrency: 'USD' });
    prisma.transactionCategory.findFirst.mockResolvedValue({
      id: 'category-1',
      name: 'Channel Advertising Revenue',
    });
    prisma.telegramAdSalePayment.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        transaction: {
          create: jest.fn().mockResolvedValue({
            id: 'tx-1',
          }),
        },
        telegramAdSalePayment: {
          create: jest.fn().mockResolvedValue(
            makePayment({
              amount: decimal(120),
              allocations: [
                {
                  id: 'allocation-1',
                  workspaceId: 'ws-1',
                  telegramAdSalePaymentId: 'payment-1',
                  telegramAdSalePlacementId: 'placement-1',
                  amount: decimal(120),
                  currency: 'USD',
                  amountInPrimaryCurrency: decimal(120),
                  createdAt: new Date('2026-08-01T09:00:00.000Z'),
                },
              ],
            }),
          ),
        },
      }),
    );

    const payment = await service.createPayment('user-1', 'sale-1', {
      accountId: 'account-1',
      amount: 120,
      currency: 'USD',
      paidAt: '2026-08-01T09:00:00.000Z',
      notes: 'First tranche',
      allocations: [{ placementId: 'placement-1', amount: 120 }],
      idempotencyKey: 'idem-1',
    });

    expect(
      financeCategoriesService.ensureSystemCategories,
    ).toHaveBeenCalledWith('ws-1');
    expect(payment.amount).toBe('120');
    expect(payment.allocations).toHaveLength(1);
    expect(payment.allocations[0].amount).toBe('120');
  });

  it('rejects payment allocations that exceed payment amount', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        placements: [
          makePlacement({ agreedPrice: decimal(300), paymentAllocations: [] }),
        ],
      }),
    );
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      workspaceId: 'ws-1',
      name: 'Main account',
      currency: 'USD',
      isActive: true,
    });
    prisma.workspace.findUnique.mockResolvedValue({ primaryCurrency: 'USD' });
    prisma.transactionCategory.findFirst.mockResolvedValue({
      id: 'category-1',
      name: 'Channel Advertising Revenue',
    });

    await expect(
      service.createPayment('user-1', 'sale-1', {
        accountId: 'account-1',
        amount: 100,
        currency: 'USD',
        paidAt: '2026-08-01T09:00:00.000Z',
        allocations: [{ placementId: 'placement-1', amount: 120 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reuses idempotent payments instead of creating duplicates', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        placements: [
          makePlacement({ agreedPrice: decimal(200), paymentAllocations: [] }),
        ],
      }),
    );
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      workspaceId: 'ws-1',
      name: 'Main account',
      currency: 'USD',
      isActive: true,
    });
    prisma.workspace.findUnique.mockResolvedValue({ primaryCurrency: 'USD' });
    prisma.transactionCategory.findFirst.mockResolvedValue({
      id: 'category-1',
      name: 'Channel Advertising Revenue',
    });
    prisma.telegramAdSalePayment.findFirst.mockResolvedValue(makePayment());

    const existing = await service.createPayment('user-1', 'sale-1', {
      accountId: 'account-1',
      amount: 120,
      currency: 'USD',
      paidAt: '2026-08-01T09:00:00.000Z',
      allocations: [{ placementId: 'placement-1', amount: 120 }],
      idempotencyKey: 'idem-1',
    });

    expect(existing.id).toBe('payment-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates payment and its finance transaction together', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        assignedMemberId: 'member-1',
        placements: [
          makePlacement({
            agreedPrice: decimal(200),
            paymentAllocations: [
              {
                id: 'allocation-1',
                telegramAdSalePaymentId: 'payment-1',
                amount: decimal(120),
                payment: { status: TelegramAdSalePaymentStatus.ACTIVE },
              },
            ],
          }),
        ],
      }),
    );
    prisma.telegramAdSalePayment.findFirst.mockResolvedValue(makePayment());
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-2',
      workspaceId: 'ws-1',
      name: 'UAH account',
      currency: 'UAH',
      isActive: true,
    });
    prisma.workspace.findUnique.mockResolvedValue({ primaryCurrency: 'UAH' });
    const transactionUpdate = jest.fn();
    const allocationDeleteMany = jest.fn();
    const paymentUpdate = jest.fn().mockResolvedValue(
      makePayment({
        accountId: 'account-2',
        amount: decimal(150),
        currency: 'UAH',
        paidAt: new Date('2026-08-03T10:00:00.000Z'),
        allocations: [
          {
            id: 'allocation-2',
            workspaceId: 'ws-1',
            telegramAdSalePaymentId: 'payment-1',
            telegramAdSalePlacementId: 'placement-1',
            amount: decimal(150),
            currency: 'UAH',
            amountInPrimaryCurrency: decimal(150),
            createdAt: new Date('2026-08-03T10:00:00.000Z'),
          },
        ],
      }),
    );
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        transaction: { update: transactionUpdate },
        telegramAdSalePaymentAllocation: { deleteMany: allocationDeleteMany },
        telegramAdSalePayment: { update: paymentUpdate },
      }),
    );

    const updated = await service.updatePayment(
      'user-1',
      'sale-1',
      'payment-1',
      {
        accountId: 'account-2',
        amount: 150,
        currency: 'UAH',
        paidAt: '2026-08-03T10:00:00.000Z',
        notes: 'Updated payment',
        allocations: [{ placementId: 'placement-1', amount: 150 }],
      },
    );

    expect(transactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-1' },
        data: expect.objectContaining({
          accountId: 'account-2',
          amount: decimal(150),
          currency: 'UAH',
          date: new Date('2026-08-03T10:00:00.000Z'),
          description: 'Updated payment',
        }),
      }),
    );
    expect(allocationDeleteMany).toHaveBeenCalledWith({
      where: { telegramAdSalePaymentId: 'payment-1' },
    });
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'account-2',
          amount: decimal(150),
          currency: 'UAH',
          allocations: {
            create: [
              expect.objectContaining({
                telegramAdSalePlacementId: 'placement-1',
                amount: decimal(150),
                currency: 'UAH',
              }),
            ],
          },
        }),
      }),
    );
    expect(updated.amount).toBe('150');
  });

  it('voids a payment by creating a reversal transaction', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSalePayment.findFirst.mockResolvedValue(
      makePayment({
        account: {
          id: 'account-1',
          name: 'Main account',
          currency: 'USD',
        },
      }),
    );
    prisma.transactionCategory.findFirst.mockResolvedValue({
      id: 'category-2',
      name: 'Telegram ad sales reversal',
    });
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        transaction: {
          create: jest.fn().mockResolvedValue({
            id: 'reversal-tx-1',
          }),
        },
        telegramAdSalePayment: {
          update: jest.fn().mockResolvedValue(
            makePayment({
              status: TelegramAdSalePaymentStatus.VOIDED,
              voidReason: 'Refunded',
              voidedAt: new Date('2026-08-01T10:00:00.000Z'),
              reversalTransactionId: 'reversal-tx-1',
              reversalTransaction: {
                id: 'reversal-tx-1',
                date: new Date('2026-08-01T10:00:00.000Z'),
                amount: decimal(120),
                type: TransactionType.expense,
                category: 'Telegram ad sales reversal',
              },
            }),
          ),
        },
      }),
    );

    const voided = await service.voidPayment('user-1', 'sale-1', 'payment-1', {
      reason: 'Refunded',
    });

    expect(voided.status).toBe(TelegramAdSalePaymentStatus.VOIDED);
    expect(voided.reversalTransactionId).toBe('reversal-tx-1');
  });

  it('reconciles sale metrics and stores actual cpm from telegram snapshots', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        placements: [
          makePlacement({
            status: TelegramAdPlacementStatus.PUBLISHED,
            publishedAt: new Date('2026-08-01T09:00:00.000Z'),
            agreedPrice: decimal(100),
            managedPostId: 'managed-post-1',
            telegramPostId: 'post-1',
          }),
        ],
      }),
    );
    prisma.telegramAdSalePlacement.findFirst.mockResolvedValue(
      makePlacement({
        status: TelegramAdPlacementStatus.PUBLISHED,
        publishedAt: new Date('2026-08-01T09:00:00.000Z'),
        agreedPrice: decimal(100),
        managedPostId: 'managed-post-1',
        telegramPostId: 'post-1',
        telegramPost: {
          id: 'post-1',
          postDate: new Date('2026-08-01T09:00:00.000Z'),
          viewsCount: 500,
        },
      }),
    );
    prisma.telegramPostMetricSnapshot.findMany.mockResolvedValue([
      {
        id: 'metric-1',
        collectedAt: new Date('2026-08-02T08:00:00.000Z'),
        viewsCount: 480,
      },
      {
        id: 'metric-2',
        collectedAt: new Date('2026-08-03T08:00:00.000Z'),
        viewsCount: 500,
      },
    ]);
    prisma.telegramAdSalePlacement.update.mockResolvedValue(undefined);

    const metrics = await service.saleMetrics('user-1', 'sale-1');

    expect(metrics.placements[0]).toMatchObject({
      placementId: 'placement-1',
      actualViewsFinal: 500,
      actualCpm: '200',
    });
    expect(prisma.telegramAdSalePlacement.update).toHaveBeenCalled();
  });

  it('builds workspace analytics summary from aggregated placements and alerts', async () => {
    const { service } = createService();

    const datasetSpy = jest.spyOn(service as any, 'adAnalyticsDataset').mockResolvedValue({
      placements: [
        {
          ...makePlacement({
            telegramChannelId: 'channel-1',
            agreedPrice: decimal(150),
            minimumPrice: decimal(120),
            recommendedPrice: decimal(160),
            expectedViews: 1000,
            actualViewsFinal: 900,
            paymentAllocations: [
              {
                amount: decimal(100),
                amountInPrimaryCurrency: decimal(100),
                payment: { status: TelegramAdSalePaymentStatus.ACTIVE },
              },
            ],
            sale: {
              id: 'sale-1',
              advertiserName: 'Advertiser',
              status: TelegramAdSaleStatus.CONFIRMED,
              createdAt: new Date('2026-07-01T00:00:00.000Z'),
              settlementCurrency: 'USD',
            },
          }),
        },
      ],
      payments: [],
      channels: [{ id: 'channel-1', title: 'Channel One', username: 'one' }],
    } as any);
    jest.spyOn(service as any, 'inventorySlotsForChannels').mockResolvedValue([
      { channelId: 'channel-1', state: 'AVAILABLE', existingPlacement: null },
      {
        channelId: 'channel-1',
        state: 'SOLD',
        existingPlacement: { status: TelegramAdPlacementStatus.PUBLISHED },
      },
      { channelId: 'channel-1', state: 'PAST', existingPlacement: null },
    ]);
    const result = await service.analyticsSummary('user-1', {
      rangeDays: 30,
      networkId: 'network-1',
    });

    expect(result.paidRevenue).toBe('100');
    expect(result.accountsReceivable).toBe('50');
    expect(result.bestChannelByRevenue?.channelId).toBe('channel-1');
    expect(result.paymentOverdueCount).toBe(1);
    expect(datasetSpy).toHaveBeenCalledWith(expect.objectContaining({ networkId: 'network-1' }));
  });

  it('builds channel analytics with revenue, fill rate, and recent sales', async () => {
    const { service, prisma } = createService();
    prisma.telegramChannel.findFirst.mockResolvedValueOnce({
      id: 'channel-1',
      workspaceId: 'ws-1',
      title: 'Channel One',
      username: 'one',
      timePosts: [],
    });
    prisma.telegramAdPriceSnapshot.findMany.mockResolvedValue([
      {
        id: 'snapshot-1',
        expectedViews: 1800,
        recommendedPrice: decimal(180),
        minimumPrice: decimal(140),
      },
    ]);
    jest.spyOn(service as any, 'adAnalyticsDataset').mockResolvedValue({
      placements: [
        {
          ...makePlacement({
            status: TelegramAdPlacementStatus.PUBLISHED,
            telegramChannelId: 'channel-1',
            agreedPrice: decimal(150),
            recommendedPrice: decimal(180),
            minimumPrice: decimal(140),
            expectedViews: 1000,
            actualViews24h: 700,
            actualViews48h: 850,
            actualViewsFinal: 900,
            paymentAllocations: [
              {
                amount: decimal(120),
                amountInPrimaryCurrency: decimal(120),
                payment: { status: TelegramAdSalePaymentStatus.ACTIVE },
              },
            ],
            sale: {
              id: 'sale-1',
              advertiserName: 'Advertiser',
              status: TelegramAdSaleStatus.CONFIRMED,
              createdAt: new Date('2026-07-20T00:00:00.000Z'),
              settlementCurrency: 'USD',
            },
          }),
        },
      ],
      payments: [],
      channels: [{ id: 'channel-1', title: 'Channel One', username: 'one' }],
    } as any);
    jest.spyOn(service as any, 'inventorySlotsForChannels').mockResolvedValue([
      { channelId: 'channel-1', state: 'AVAILABLE', existingPlacement: null },
      {
        channelId: 'channel-1',
        state: 'SOLD',
        existingPlacement: { status: TelegramAdPlacementStatus.PUBLISHED },
      },
    ]);

    const result = await service.channelAnalytics('user-1', 'channel-1', {
      rangeDays: 30,
    });

    expect(result.revenue.totalAgreedRevenue).toBe('150');
    expect(result.revenue.totalPaidRevenue).toBe('120');
    expect(result.placements.slotFillRate).toBe(50);
    expect(result.performance.actualViewsFinal).toBe(900);
    expect(result.recentSales[0]?.advertiserName).toBe('Advertiser');
  });

  it('keeps availability stable when product prices are hydrated as strings', async () => {
    const { service, prisma } = createService();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        workspaceId: 'ws-1',
        title: 'Channel One',
        username: 'one',
        language: 'UTC',
        timePosts: [{ time: '12:00', position: 0 }],
      },
    ]);
    prisma.telegramAdSchedulePolicy.findMany.mockResolvedValue([
      {
        telegramChannelId: 'channel-1',
        timezone: 'UTC',
        slotStrategy: 'FIXED_TIMES',
        fallbackSlotTimes: ['10:00'],
        allowManualSlots: false,
        maxAdsPerDay: 3,
        minHoursBetweenAds: 0,
        minDaysBetweenAds: 0,
      },
    ]);
    prisma.telegramAdProduct.findMany.mockResolvedValue([
      {
        id: 'product-1',
        telegramChannelId: 'channel-1',
        topDurationMinutes: 60,
        defaultPricingMode: TelegramAdPricingMode.CPM,
        defaultCpm: decimal(12),
        currency: 'USD',
        defaultFixedPrice: '125.50',
        minimumPrice: '100.25',
      },
    ]);
    prisma.telegramAdSchedulePolicy.findFirst.mockResolvedValue({
      id: 'policy-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      timezone: 'UTC',
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: false,
      organicPostsPerAdSlot: 1,
      maxAdsPerDay: 3,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: 'BEFORE_ORGANIC_POST',
      fallbackSlotTimes: [],
      allowManualSlots: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.telegramPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        telegramChannelId: 'channel-1',
        telegramMessageId: '100',
        postDate: new Date('2026-08-01T08:00:00.000Z'),
      },
    ]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([]);
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);

    jest
      .spyOn(service as any, 'computeExpectedViewsForProduct')
      .mockResolvedValue({
        expectedViews: 1500,
        averageViews: null,
        medianViews: null,
        adjustedViews: null,
        postsSampleCount: 0,
        dataQuality: 'low',
        warnings: [],
        fallbackSource: 'none',
        methodVersion: 'test',
        pricingWindowHours: null,
        pricingWindowLabel: 'Post',
      });

    const result = await service.availability('user-1', {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-01T23:59:59.000Z',
      channelIds: ['channel-1'],
    });

    expect(result.slots[0]).toMatchObject({
      channelId: 'channel-1',
      recommendedPrice: '18',
      minimumPrice: '18',
      currency: 'USD',
    });
  });

  it('seeds default channel formats before listing products', async () => {
    const { service, prisma } = createService();
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'ws-1',
      title: 'Channel One',
      username: 'one',
      adBaseCurrency: 'USD',
      timePosts: [],
    });
    prisma.telegramAdProduct.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'product-1',
          workspaceId: 'ws-1',
          telegramChannelId: 'channel-1',
          name: '1/24',
          description: null,
          topDurationMinutes: 60,
          feedDurationHours: 24,
          deleteAfterHours: 24,
          isPermanent: false,
          defaultPricingMode: TelegramAdPricingMode.CPM,
          defaultCpm: null,
          defaultFixedPrice: null,
          minimumPrice: null,
          currency: 'USD',
          isActive: true,
          position: 0,
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ]);
    prisma.telegramAdProduct.createMany.mockResolvedValue({ count: 4 });

    jest.spyOn(service as any, 'buildProductPricingPreview').mockResolvedValue({
      pricingWindowHours: 24,
      pricingWindowLabel: '24h placement',
      expectedViews: 300,
      recommendedPrice: '15',
    });

    const result = await service.listChannelProducts('user-1', 'channel-1');

    expect(prisma.telegramAdProduct.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: expect.arrayContaining([
          expect.objectContaining({ name: '1/24' }),
          expect.objectContaining({ name: '2/48' }),
          expect.objectContaining({ name: '3/72' }),
          expect.objectContaining({
            name: 'No auto-delete',
            isPermanent: true,
          }),
        ]),
      }),
    );
    expect(result[0]?.name).toBe('1/24');
  });

  it('carries cadence across days but caps a busy day at the channel typical frequency', async () => {
    const { service, prisma } = createService();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        workspaceId: 'ws-1',
        title: 'Channel One',
        username: 'one',
        language: 'UTC',
        timePosts: [{ time: '12:00', position: 0 }],
      },
    ]);
    prisma.telegramAdProduct.findMany.mockResolvedValue([]);
    prisma.telegramAdSchedulePolicy.findFirst.mockResolvedValue({
      id: 'policy-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      timezone: 'UTC',
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: false,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 10,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: 'BEFORE_ORGANIC_POST',
      fallbackSlotTimes: [],
      allowManualSlots: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.telegramPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        telegramChannelId: 'channel-1',
        telegramMessageId: '101',
        postDate: new Date('2026-07-31T08:00:00.000Z'),
      },
      {
        id: 'post-2',
        telegramChannelId: 'channel-1',
        telegramMessageId: '102',
        postDate: new Date('2026-07-31T14:00:00.000Z'),
      },
      {
        id: 'post-3',
        telegramChannelId: 'channel-1',
        telegramMessageId: '103',
        postDate: new Date('2026-08-01T08:00:00.000Z'),
      },
      {
        id: 'post-4',
        telegramChannelId: 'channel-1',
        telegramMessageId: '104',
        postDate: new Date('2026-08-01T12:00:00.000Z'),
      },
      {
        id: 'post-5',
        telegramChannelId: 'channel-1',
        telegramMessageId: '105',
        postDate: new Date('2026-08-01T16:00:00.000Z'),
      },
      {
        id: 'post-6',
        telegramChannelId: 'channel-1',
        telegramMessageId: '106',
        postDate: new Date('2026-08-01T20:00:00.000Z'),
      },
    ]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([]);
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);

    jest
      .spyOn(service as any, 'computeExpectedViewsForProduct')
      .mockResolvedValue({
        expectedViews: 1500,
        averageViews: null,
        medianViews: null,
        adjustedViews: null,
        postsSampleCount: 0,
        dataQuality: 'low',
        warnings: [],
        fallbackSource: 'none',
        methodVersion: 'test',
        pricingWindowHours: null,
        pricingWindowLabel: 'Post',
      });

    const result = await service.availability('user-1', {
      from: '2026-07-31T00:00:00.000Z',
      to: '2026-08-01T23:59:59.000Z',
      channelIds: ['channel-1'],
    });

    const slotsByDate = result.slots.reduce<Record<string, number>>(
      (acc, slot) => {
        acc[slot.date] = (acc[slot.date] ?? 0) + 1;
        return acc;
      },
      {},
    );

    expect(slotsByDate['2026-07-31'] ?? 0).toBe(1);
    expect(slotsByDate['2026-08-01'] ?? 0).toBe(1);
  });

  it('keeps slots for a slower selected channel by accumulating its daily posts', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T00:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-business',
        workspaceId: 'ws-1',
        title: 'Business Patterns',
        username: 'business_patterns',
        language: 'UTC',
        adBaseCurrency: 'USD',
        timePosts: [{ time: '12:00', position: 0 }],
      },
    ]);
    prisma.telegramAdProduct.findMany.mockResolvedValue([]);
    prisma.telegramAdSchedulePolicy.findFirst.mockResolvedValue({
      id: 'policy-business',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-business',
      timezone: 'UTC',
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: false,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 10,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: 'BEFORE_ORGANIC_POST',
      fallbackSlotTimes: [],
      allowManualSlots: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.telegramPost.findMany.mockResolvedValue([]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([]);
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);

    jest
      .spyOn(service as any, 'computeExpectedViewsForProduct')
      .mockResolvedValue({
        expectedViews: 1500,
        averageViews: null,
        medianViews: null,
        adjustedViews: null,
        postsSampleCount: 0,
        dataQuality: 'low',
        warnings: [],
        fallbackSource: 'none',
        methodVersion: 'test',
        pricingWindowHours: null,
        pricingWindowLabel: 'Post',
      });

    const result = await service.availability('user-1', {
      from: '2026-08-03T00:00:00.000Z',
      to: '2026-08-08T23:59:59.000Z',
      channelIds: ['channel-business'],
    });

    expect(result.slots.map((slot) => slot.date)).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
    ]);
    jest.useRealTimers();
  });

  it('shows sold placements without adding a missed slot on past sold days', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        workspaceId: 'ws-1',
        title: 'Mentor',
        username: 'mentor',
        language: 'UTC',
        adBaseCurrency: 'USD',
        timePosts: [],
      },
    ]);
    prisma.telegramAdProduct.findMany.mockResolvedValue([]);
    prisma.telegramAdSchedulePolicy.findFirst.mockResolvedValue({
      id: 'policy-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      timezone: 'UTC',
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: false,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 1,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: 'BEFORE_ORGANIC_POST',
      fallbackSlotTimes: [],
      allowManualSlots: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.telegramPost.findMany.mockResolvedValue([]);
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([
      makePlacement({
        id: 'placement-18',
        telegramAdSaleId: 'sale-18',
        status: TelegramAdPlacementStatus.PUBLISHED,
        scheduledAt: new Date('2026-08-31T18:00:00.000Z'),
      }),
      makePlacement({
        id: 'placement-20',
        telegramAdSaleId: 'sale-20',
        status: TelegramAdPlacementStatus.PUBLISHED,
        scheduledAt: new Date('2026-08-31T20:00:00.000Z'),
      }),
    ]);
    jest
      .spyOn(service as any, 'computeExpectedViewsForProduct')
      .mockResolvedValue({
        expectedViews: 1500,
        averageViews: null,
        medianViews: null,
        adjustedViews: null,
        postsSampleCount: 0,
        dataQuality: 'low',
        warnings: [],
        fallbackSource: 'none',
        methodVersion: 'test',
        pricingWindowHours: null,
        pricingWindowLabel: 'Post',
      });

    const result = await service.availability('user-1', {
      from: '2026-08-31T00:00:00.000Z',
      to: '2026-08-31T23:59:59.000Z',
      channelIds: ['channel-1'],
    });

    const daySlots = result.slots.filter((slot) => slot.date === '2026-08-31');
    expect(daySlots.filter((slot) => slot.existingPlacement)).toHaveLength(2);
    expect(daySlots).toHaveLength(2);
    expect(daySlots.some((slot) => slot.state === 'PAST')).toBe(false);
    jest.useRealTimers();
  });

  it('offers an extra future slot even when cadence produced no slots', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        workspaceId: 'ws-1',
        title: 'Mentor',
        username: 'mentor',
        language: 'UTC',
        adBaseCurrency: 'USD',
        timePosts: [],
      },
    ]);
    prisma.telegramAdProduct.findMany.mockResolvedValue([]);
    prisma.telegramAdSchedulePolicy.findFirst.mockResolvedValue({
      id: 'policy-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      timezone: 'UTC',
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: false,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 1,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: 'BEFORE_ORGANIC_POST',
      fallbackSlotTimes: [],
      allowManualSlots: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.telegramPost.findMany.mockResolvedValue([]);
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([
      makePlacement({
        id: 'placement-18',
        telegramAdSaleId: 'sale-18',
        status: TelegramAdPlacementStatus.PUBLISHED,
        scheduledAt: new Date('2026-08-31T18:00:00.000Z'),
      }),
    ]);
    jest
      .spyOn(service as any, 'computeExpectedViewsForProduct')
      .mockResolvedValue({
        expectedViews: 1500,
        averageViews: null,
        medianViews: null,
        adjustedViews: null,
        postsSampleCount: 0,
        dataQuality: 'low',
        warnings: [],
        fallbackSource: 'none',
        methodVersion: 'test',
        pricingWindowHours: null,
        pricingWindowLabel: 'Post',
      });

    const result = await service.availability('user-1', {
      from: '2026-08-31T00:00:00.000Z',
      to: '2026-08-31T23:59:59.000Z',
      channelIds: ['channel-1'],
    });

    const daySlots = result.slots.filter((slot) => slot.date === '2026-08-31');
    expect(daySlots.filter((slot) => slot.existingPlacement)).toHaveLength(1);
    expect(daySlots.some((slot) => slot.state === 'AVAILABLE')).toBe(true);
    jest.useRealTimers();
  });

  it('projects future ad slots from posting cadence when future organic posts are not scheduled yet', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T00:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        workspaceId: 'ws-1',
        title: 'Channel One',
        username: 'one',
        language: 'UTC',
        adBaseCurrency: 'USD',
        timePosts: [
          { time: '08:00', position: 0 },
          { time: '12:00', position: 1 },
          { time: '16:00', position: 2 },
        ],
      },
    ]);
    prisma.telegramAdProduct.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'product-1',
          telegramChannelId: 'channel-1',
          topDurationMinutes: 60,
          defaultPricingMode: TelegramAdPricingMode.CPM,
          defaultCpm: decimal(12),
          currency: 'USD',
          defaultFixedPrice: null,
          minimumPrice: null,
          isActive: true,
          position: 0,
        },
      ]);
    prisma.telegramAdProduct.createMany.mockResolvedValue({ count: 3 });
    prisma.telegramAdSchedulePolicy.findFirst.mockResolvedValue({
      id: 'policy-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      timezone: 'UTC',
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: false,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 10,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: 'BEFORE_ORGANIC_POST',
      fallbackSlotTimes: [],
      allowManualSlots: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.telegramPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        telegramChannelId: 'channel-1',
        telegramMessageId: '101',
        postDate: new Date('2026-08-01T08:00:00.000Z'),
      },
      {
        id: 'post-2',
        telegramChannelId: 'channel-1',
        telegramMessageId: '102',
        postDate: new Date('2026-08-01T12:00:00.000Z'),
      },
      {
        id: 'post-3',
        telegramChannelId: 'channel-1',
        telegramMessageId: '103',
        postDate: new Date('2026-08-01T16:00:00.000Z'),
      },
    ]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([]);
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);

    jest
      .spyOn(service as any, 'computeExpectedViewsForProduct')
      .mockResolvedValue({
        expectedViews: 1500,
        averageViews: null,
        medianViews: null,
        adjustedViews: null,
        postsSampleCount: 0,
        dataQuality: 'low',
        warnings: [],
        fallbackSource: 'none',
        methodVersion: 'test',
        pricingWindowHours: null,
        pricingWindowLabel: 'Post',
      });

    const result = await service.availability('user-1', {
      from: '2026-08-03T00:00:00.000Z',
      to: '2026-08-05T23:59:59.000Z',
      channelIds: ['channel-1'],
    });

    const slotsByDate = result.slots.reduce<Record<string, number>>(
      (acc, slot) => {
        acc[slot.date] = (acc[slot.date] ?? 0) + 1;
        return acc;
      },
      {},
    );

    expect(slotsByDate['2026-08-03'] ?? 0).toBe(1);
    expect(slotsByDate['2026-08-04'] ?? 0).toBe(1);
    expect(slotsByDate['2026-08-05'] ?? 0).toBe(1);
    jest.useRealTimers();
  });

  it('keeps the final local day availability when the request to-date is midnight UTC for that local day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T20:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        workspaceId: 'ws-1',
        title: 'Channel One',
        username: 'one',
        language: 'UTC',
        timePosts: [{ time: '12:00', position: 0 }],
      },
    ]);
    prisma.telegramAdProduct.findMany.mockResolvedValue([]);
    prisma.telegramAdSchedulePolicy.findFirst.mockResolvedValue({
      id: 'policy-1',
      workspaceId: 'ws-1',
      telegramChannelId: 'channel-1',
      timezone: 'Europe/Warsaw',
      autoFrequencyEnabled: true,
      expectedOrganicPostsPerDay: null,
      useWorkspaceDefault: false,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 10,
      minHoursBetweenAds: 0,
      minDaysBetweenAds: 0,
      slotStrategy: 'BEFORE_ORGANIC_POST',
      fallbackSlotTimes: [],
      allowManualSlots: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    prisma.telegramPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        telegramChannelId: 'channel-1',
        telegramMessageId: '101',
        postDate: new Date('2026-08-02T04:15:00.000Z'),
      },
      {
        id: 'post-2',
        telegramChannelId: 'channel-1',
        telegramMessageId: '102',
        postDate: new Date('2026-08-02T08:15:00.000Z'),
      },
      {
        id: 'post-3',
        telegramChannelId: 'channel-1',
        telegramMessageId: '103',
        postDate: new Date('2026-08-02T13:15:00.000Z'),
      },
      {
        id: 'post-4',
        telegramChannelId: 'channel-1',
        telegramMessageId: '104',
        postDate: new Date('2026-08-02T15:30:00.000Z'),
      },
    ]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([]);
    prisma.telegramManagedPost.findMany.mockResolvedValue([]);

    jest
      .spyOn(service as any, 'computeExpectedViewsForProduct')
      .mockResolvedValue({
        expectedViews: 1500,
        averageViews: null,
        medianViews: null,
        adjustedViews: null,
        postsSampleCount: 0,
        dataQuality: 'low',
        warnings: [],
        fallbackSource: 'none',
        methodVersion: 'test',
        pricingWindowHours: null,
        pricingWindowLabel: 'Post',
      });

    const result = await service.availability('user-1', {
      from: '2026-08-01T22:00:00.000Z',
      to: '2026-08-01T22:00:00.000Z',
      channelIds: ['channel-1'],
    });

    expect(
      result.summaries.find(
        (summary) =>
          summary.channelId === 'channel-1' && summary.date === '2026-08-02',
      ),
    ).toMatchObject({
      organicPostsCountForDay: 4,
      adsCountForDay: 1,
    });
    expect(
      result.slots.filter(
        (slot) => slot.channelId === 'channel-1' && slot.date === '2026-08-02',
      ),
    ).toHaveLength(1);
    expect(
      result.slots.find(
        (slot) => slot.channelId === 'channel-1' && slot.date === '2026-08-02',
      )?.state,
    ).toBe('AVAILABLE');
    jest.useRealTimers();
  });
});
