import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TelegramAdPlacementStatus,
  TelegramAdPricingMode,
  TelegramAdSalePaymentStatus,
  TelegramAdSaleStatus,
  TransactionType,
} from '@prisma/client';
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
      category: 'Telegram ad sales',
    },
    reversalTransaction: null,
    ...overrides,
  };
}

function createService() {
  const prisma: any = {
    workspace: { findUnique: jest.fn() },
    account: { findFirst: jest.fn() },
    transactionCategory: { findFirst: jest.fn() },
    transaction: { create: jest.fn() },
    telegramManagedPost: { findFirst: jest.fn(), update: jest.fn() },
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
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    telegramAdSchedulePolicy: { findFirst: jest.fn(), upsert: jest.fn(), findMany: jest.fn() },
    telegramAdPriceSnapshot: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
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
    telegramPost: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
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
  const logger: any = { info: jest.fn() };
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
    currencyConversionService,
    financeCategoriesService,
    telegramChannelsService,
  };
}

describe('TelegramAdSalesService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('enforces workspace isolation for channel products', async () => {
    const { service, prisma } = createService();
    prisma.telegramChannel.findFirst.mockResolvedValue(null);

    await expect(service.listChannelProducts('user-1', 'channel-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
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

  it('creates immutable price snapshots', async () => {
    const { service, prisma } = createService();
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'ws-1',
      timePosts: [],
      language: 'UTC',
    });
    prisma.telegramPost.findMany.mockResolvedValue([]);
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

    await expect(service.reserveSale('user-1', 'sale-1', {})).rejects.toBeInstanceOf(
      ConflictException,
    );
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
      name: 'Telegram ad sales',
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

    expect(financeCategoriesService.ensureSystemCategories).toHaveBeenCalledWith('ws-1');
    expect(payment.amount).toBe('120');
    expect(payment.allocations).toHaveLength(1);
    expect(payment.allocations[0].amount).toBe('120');
  });

  it('rejects payment allocations that exceed payment amount', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdSale.findFirst.mockResolvedValue(
      makeSale({
        placements: [makePlacement({ agreedPrice: decimal(300), paymentAllocations: [] })],
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
      name: 'Telegram ad sales',
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
        placements: [makePlacement({ agreedPrice: decimal(200), paymentAllocations: [] })],
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
      name: 'Telegram ad sales',
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

    jest
      .spyOn(service as any, 'adAnalyticsDataset')
      .mockResolvedValue({
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
            }),
          },
        ],
        payments: [
          {
            id: 'payment-1',
            paidAt: new Date('2026-08-01T09:00:00.000Z'),
            amount: decimal(100),
            amountInPrimaryCurrency: decimal(100),
            currency: 'USD',
            sale: { id: 'sale-1' },
          },
        ],
        channels: [{ id: 'channel-1', title: 'Channel One', username: 'one' }],
      } as any);
    jest
      .spyOn(service as any, 'inventorySlotsForChannels')
      .mockResolvedValue([
        { channelId: 'channel-1', state: 'AVAILABLE', existingPlacement: null },
        { channelId: 'channel-1', state: 'SOLD', existingPlacement: { status: TelegramAdPlacementStatus.PUBLISHED } },
        { channelId: 'channel-1', state: 'PAST', existingPlacement: null },
      ]);
    jest.spyOn(service, 'analyticsAlerts').mockResolvedValue({
      dateFrom: '2026-07-03T00:00:00.000Z',
      dateTo: '2026-08-01T00:00:00.000Z',
      timezone: 'UTC',
      items: [
        {
          kind: 'OVERDUE_PAYMENT',
          severity: 'warn',
          channelId: 'channel-1',
          saleId: 'sale-1',
          placementId: 'placement-1',
          title: 'Overdue unpaid sale',
          details: 'still unpaid',
          scheduledAt: null,
          amount: '50',
          currency: 'USD',
        },
      ],
    });

    const result = await service.analyticsSummary('user-1', { rangeDays: 30 });

    expect(result.paidRevenue).toBe('100');
    expect(result.accountsReceivable).toBe('50');
    expect(result.bestChannelByRevenue?.channelId).toBe('channel-1');
    expect(result.paymentOverdueCount).toBe(1);
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
    jest
      .spyOn(service as any, 'adAnalyticsDataset')
      .mockResolvedValue({
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
    jest
      .spyOn(service as any, 'inventorySlotsForChannels')
      .mockResolvedValue([
        { channelId: 'channel-1', state: 'AVAILABLE', existingPlacement: null },
        { channelId: 'channel-1', state: 'SOLD', existingPlacement: { status: TelegramAdPlacementStatus.PUBLISHED } },
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
        currency: 'USD',
        defaultFixedPrice: '125.50',
        minimumPrice: '100.25',
      },
    ]);
    prisma.telegramAdSalePlacement.findMany.mockResolvedValue([]);

    jest.spyOn(service as any, 'computeExpectedViews').mockResolvedValue({
      expectedViews: 1500,
      averageViews: null,
      medianViews: null,
      adjustedViews: null,
      postsSampleCount: 0,
      dataQuality: 'low',
      warnings: [],
      fallbackSource: 'none',
      methodVersion: 'test',
    });

    const result = await service.availability('user-1', {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
      channelIds: ['channel-1'],
    });

    expect(result.slots[0]).toMatchObject({
      channelId: 'channel-1',
      recommendedPrice: '125.5',
      minimumPrice: '100.25',
      currency: 'USD',
    });
  });
});
