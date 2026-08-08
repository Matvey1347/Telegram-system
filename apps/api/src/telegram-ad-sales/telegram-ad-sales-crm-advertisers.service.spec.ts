import 'reflect-metadata';
import {
  Prisma,
  TelegramAdvertiserContactType,
  TelegramAdvertiserLifecycleStage,
  TelegramAdvertiserStatus,
  TelegramAdvertiserTaskPriority,
  TelegramAdvertiserTaskStatus,
  TelegramAdvertiserTaskType,
  TelegramAdPlacementStatus,
  TelegramAdSaleStatus,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TelegramAdvertisersQueryDto } from './dto';
import { TelegramAdSalesCrmAdvertisersService } from './telegram-ad-sales-crm-advertisers.service';

const decimal = (value: number | string) => new Prisma.Decimal(value);

function makeCrmAdvertiser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'advertiser-1',
    displayName: 'Acme Media',
    companyName: 'Acme LLC',
    telegramUsername: 'acme',
    status: TelegramAdvertiserStatus.ACTIVE,
    lifecycleStage: TelegramAdvertiserLifecycleStage.REPEAT_CUSTOMER,
    completedSalesCount: 6,
    totalSalesCount: 7,
    totalRevenueInPrimaryCurrency: decimal(1500),
    averageOrderValueInPrimaryCurrency: decimal(250),
    firstPurchaseAt: new Date('2026-01-10T00:00:00.000Z'),
    lastPurchaseAt: new Date('2026-07-20T00:00:00.000Z'),
    lastContactAt: new Date('2026-08-01T00:00:00.000Z'),
    nextContactAt: new Date('2026-08-09T00:00:00.000Z'),
    contacts: [
      {
        id: 'contact-1',
        type: TelegramAdvertiserContactType.EMAIL,
        value: 'buyer@example.com',
        label: 'Buyer',
        isPrimary: true,
      },
    ],
    ownerMember: {
      id: 'member-1',
      avatarIcon: null,
      user: {
        name: 'Owner User',
        email: 'owner@example.com',
      },
    },
    tasks: [
      {
        id: 'task-1',
        title: 'Follow up',
        dueAt: new Date('2026-08-07T00:00:00.000Z'),
        priority: TelegramAdvertiserTaskPriority.HIGH,
        type: TelegramAdvertiserTaskType.FOLLOW_UP,
        status: TelegramAdvertiserTaskStatus.OPEN,
      },
    ],
    ...overrides,
  };
}

function createService() {
  const prisma: any = {
    telegramAdCrmWorkspaceSettings: { findUnique: jest.fn() },
    telegramAdvertiser: { findMany: jest.fn(), count: jest.fn() },
    telegramAdSale: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  const workspaceService = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-1'),
  };
  const service = new TelegramAdSalesCrmAdvertisersService(
    prisma,
    workspaceService as any,
  );
  return { service, prisma, workspaceService };
}

describe('TelegramAdSalesCrmAdvertisersService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts archived boolean query strings under whitelist validation', async () => {
    const dto = plainToInstance(TelegramAdvertisersQueryDto, {
      archived: 'false',
      page: '1',
      pageSize: '25',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
    expect(dto.archived).toBe(false);
  });

  it('lists compact CRM advertisers without heavy sale includes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramAdCrmWorkspaceSettings.findUnique.mockResolvedValue({
      highValueCustomerThreshold: decimal(1000),
    });
    prisma.telegramAdvertiser.findMany.mockReturnValue('advertisers-query');
    prisma.telegramAdvertiser.count.mockReturnValue('count-query');
    prisma.$transaction.mockResolvedValue([[makeCrmAdvertiser()], 1]);

    const result = await service.listCrmAdvertisers('user-1', {
      page: 1,
      pageSize: 10,
      search: 'Acme',
      archived: false,
    });

    const findManyArgs = prisma.telegramAdvertiser.findMany.mock.calls[0][0];
    expect(findManyArgs.include).toBeUndefined();
    expect(findManyArgs.select).toEqual(
      expect.objectContaining({
        contacts: expect.objectContaining({ take: 1 }),
        ownerMember: expect.any(Object),
        tasks: expect.objectContaining({ take: 1 }),
      }),
    );
    expect(findManyArgs.select.sales).toBeUndefined();
    expect(findManyArgs.select.activities).toBeUndefined();
    expect(findManyArgs.where).toEqual(
      expect.objectContaining({
        workspaceId: 'ws-1',
        archivedAt: null,
      }),
    );
    expect(result.pagination.totalItems).toBe(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'advertiser-1',
        displayName: 'Acme Media',
        primaryContact: {
          id: 'contact-1',
          type: TelegramAdvertiserContactType.EMAIL,
          value: 'buyer@example.com',
          label: 'Buyer',
          isPrimary: true,
        },
        ownerMember: {
          id: 'member-1',
          name: 'Owner User',
          email: 'owner@example.com',
          avatarPresentation: null,
        },
        totalRevenueInPrimaryCurrency: '1500',
        averageOrderValueInPrimaryCurrency: '250',
        monetaryValue: 1500,
        isHighValue: true,
        recencyBucket: 'RECENT',
        frequencyBucket: 'LOYAL',
        rfmSegment: 'CHAMPION',
        urgency: 'HIGH',
        nextOpenTask: {
          id: 'task-1',
          title: 'Follow up',
          dueAt: '2026-08-07T00:00:00.000Z',
          priority: TelegramAdvertiserTaskPriority.HIGH,
          type: TelegramAdvertiserTaskType.FOLLOW_UP,
          status: TelegramAdvertiserTaskStatus.OPEN,
        },
        lostReason: null,
        lostAt: null,
      }),
    );
  });

  it('filters archived-only advertisers explicitly', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdCrmWorkspaceSettings.findUnique.mockResolvedValue(null);
    prisma.telegramAdvertiser.findMany.mockReturnValue('advertisers-query');
    prisma.telegramAdvertiser.count.mockReturnValue('count-query');
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.listCrmAdvertisers('user-1', {
      page: 1,
      pageSize: 10,
      archived: true,
    });

    expect(prisma.telegramAdvertiser.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        workspaceId: 'ws-1',
        archivedAt: { not: null },
      }),
    );
  });

  it('hydrates CRM revenue from current sale payments when stored advertiser stats are stale', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramAdCrmWorkspaceSettings.findUnique.mockResolvedValue({
      highValueCustomerThreshold: decimal(100),
    });
    prisma.telegramAdvertiser.findMany.mockReturnValue('advertisers-query');
    prisma.telegramAdvertiser.count.mockReturnValue('count-query');
    prisma.$transaction.mockResolvedValue([
      [
        makeCrmAdvertiser({
          completedSalesCount: 0,
          totalSalesCount: 0,
          totalRevenueInPrimaryCurrency: decimal(0),
          averageOrderValueInPrimaryCurrency: decimal(0),
          firstPurchaseAt: null,
          lastPurchaseAt: null,
        }),
      ],
      1,
    ]);
    prisma.telegramAdSale.findMany.mockResolvedValue([
      {
        advertiserId: 'advertiser-1',
        status: TelegramAdSaleStatus.CONFIRMED,
        createdAt: new Date('2026-08-05T00:00:00.000Z'),
        placements: [
          { id: 'placement-1', status: TelegramAdPlacementStatus.PUBLISHED },
          { id: 'placement-2', status: TelegramAdPlacementStatus.SCHEDULED },
        ],
        payments: [{ amountInPrimaryCurrency: decimal(780) }],
      },
    ]);

    const result = await service.listCrmAdvertisers('user-1', {
      page: 1,
      pageSize: 10,
    });

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        completedSalesCount: 1,
        totalSalesCount: 1,
        completedPlacementsCount: 1,
        totalPlacementsCount: 2,
        totalRevenueInPrimaryCurrency: '780',
        averageOrderValueInPrimaryCurrency: '780',
        lastPurchaseAt: '2026-08-05T00:00:00.000Z',
      }),
    );
  });

  it('rolls unassigned sales into the No client fallback advertiser', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    const { service, prisma } = createService();
    prisma.telegramAdCrmWorkspaceSettings.findUnique.mockResolvedValue({
      highValueCustomerThreshold: decimal(100),
    });
    prisma.telegramAdvertiser.findMany.mockReturnValue('advertisers-query');
    prisma.telegramAdvertiser.count.mockReturnValue('count-query');
    prisma.$transaction.mockResolvedValue([
      [
        makeCrmAdvertiser({
          displayName: 'Advertiser',
          companyName: null,
          telegramUsername: null,
          contacts: [],
          completedSalesCount: 0,
          totalSalesCount: 0,
          totalRevenueInPrimaryCurrency: decimal(0),
          averageOrderValueInPrimaryCurrency: decimal(0),
          firstPurchaseAt: null,
          lastPurchaseAt: null,
        }),
      ],
      1,
    ]);
    prisma.telegramAdSale.findMany.mockResolvedValue([
      {
        advertiserId: 'advertiser-1',
        status: TelegramAdSaleStatus.CONFIRMED,
        createdAt: new Date('2026-08-05T00:00:00.000Z'),
        placements: [
          { id: 'placement-1', status: TelegramAdPlacementStatus.PUBLISHED },
          { id: 'placement-2', status: TelegramAdPlacementStatus.SCHEDULED },
        ],
        payments: [{ amountInPrimaryCurrency: decimal(780) }],
      },
      {
        advertiserId: null,
        status: TelegramAdSaleStatus.CONFIRMED,
        createdAt: new Date('2026-08-06T00:00:00.000Z'),
        placements: [
          { id: 'placement-3', status: TelegramAdPlacementStatus.PUBLISHED },
        ],
        payments: [{ amountInPrimaryCurrency: decimal(60) }],
      },
    ]);

    const result = await service.listCrmAdvertisers('user-1', {
      page: 1,
      pageSize: 10,
    });

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        completedSalesCount: 2,
        totalSalesCount: 2,
        completedPlacementsCount: 2,
        totalPlacementsCount: 3,
        totalRevenueInPrimaryCurrency: '840',
        averageOrderValueInPrimaryCurrency: '420',
        lastPurchaseAt: '2026-08-06T00:00:00.000Z',
      }),
    );
  });

  it('returns all advertisers when archived is omitted', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdCrmWorkspaceSettings.findUnique.mockResolvedValue(null);
    prisma.telegramAdvertiser.findMany.mockReturnValue('advertisers-query');
    prisma.telegramAdvertiser.count.mockReturnValue('count-query');
    prisma.$transaction.mockResolvedValue([[], 0]);

    await service.listCrmAdvertisers('user-1', {
      page: 1,
      pageSize: 10,
    });

    expect(prisma.telegramAdvertiser.findMany.mock.calls[0][0].where).toEqual({
      workspaceId: 'ws-1',
    });
  });

  it('returns an empty paginated CRM advertiser list', async () => {
    const { service, prisma } = createService();
    prisma.telegramAdCrmWorkspaceSettings.findUnique.mockResolvedValue(null);
    prisma.telegramAdvertiser.findMany.mockReturnValue('advertisers-query');
    prisma.telegramAdvertiser.count.mockReturnValue('count-query');
    prisma.$transaction.mockResolvedValue([[], 0]);

    const result = await service.listCrmAdvertisers('user-1', {
      page: 2,
      pageSize: 25,
    });

    expect(result).toEqual({
      items: [],
      pagination: {
        page: 2,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });

  it('classifies CRM RFM recency and frequency buckets', () => {
    const { service } = createService();
    const now = new Date('2026-08-08T00:00:00.000Z');

    expect((service as any).recencyBucket(null, now)).toBe('NONE');
    expect(
      (service as any).recencyBucket(new Date('2026-07-20T00:00:00.000Z'), now),
    ).toBe('RECENT');
    expect(
      (service as any).recencyBucket(new Date('2026-06-01T00:00:00.000Z'), now),
    ).toBe('WARM');
    expect(
      (service as any).recencyBucket(new Date('2026-03-01T00:00:00.000Z'), now),
    ).toBe('COLD');
    expect(
      (service as any).recencyBucket(new Date('2025-12-01T00:00:00.000Z'), now),
    ).toBe('DORMANT');
    expect((service as any).frequencyBucket(0, 0)).toBe('NONE');
    expect((service as any).frequencyBucket(1, 1)).toBe('ONE_TIME');
    expect((service as any).frequencyBucket(2, 2)).toBe('REPEAT');
    expect((service as any).frequencyBucket(5, 5)).toBe('LOYAL');
    expect((service as any).frequencyBucket(10, 10)).toBe('POWER');
  });
});
