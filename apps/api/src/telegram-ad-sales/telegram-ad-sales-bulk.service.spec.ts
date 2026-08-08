import {
  TelegramAdPlacementStatus,
  TelegramAdPricingMode,
  TelegramAdSaleStatus,
} from '@prisma/client';
import { decimal } from './domain/decimal';
import { TelegramAdSalesBulkService } from './telegram-ad-sales-bulk.service';

function createService() {
  const tx = {
    $executeRaw: jest.fn(),
    telegramAdvertiser: {
      create: jest.fn().mockResolvedValue({ id: 'advertiser-1' }),
      findFirst: jest.fn(),
    },
    telegramAdvertiserContact: { create: jest.fn() },
    telegramAdvertiserActivity: { create: jest.fn() },
    telegramAdSale: {
      create: jest.fn().mockResolvedValue({
        id: 'sale-1',
        advertiserName: 'Company A',
      }),
    },
    telegramAdSalePlacement: {
      create: jest.fn().mockResolvedValue({ id: 'placement-1' }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback) => callback(tx)),
    telegramChannel: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'channel-1',
        adBaseCurrency: 'USD',
      }),
    },
    telegramChannelNetwork: { findFirst: jest.fn() },
    telegramAdProduct: { findMany: jest.fn().mockResolvedValue([]) },
    telegramPost: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
  const workspaceService = {
    resolveAssignedMemberId: jest.fn().mockResolvedValue({
      workspaceId: 'ws-1',
      assignedMemberId: 'member-1',
    }),
  } as any;
  const logger = { info: jest.fn() } as any;
  const responseCache = { clearByPrefix: jest.fn() } as any;
  const salesService = {
    getSale: jest.fn().mockResolvedValue({
      id: 'sale-1',
      status: TelegramAdSaleStatus.RESERVED,
      placements: [],
    }),
  } as any;
  const service = new TelegramAdSalesBulkService(
    prisma,
    workspaceService,
    logger,
    responseCache,
    salesService,
  );
  return { service, prisma, tx, responseCache, salesService };
}

describe('TelegramAdSalesBulkService', () => {
  it('creates and reserves one channel placement without creating payments', async () => {
    const { service, tx, responseCache, salesService } = createService();

    const result = await service.create('user-1', {
      target: { type: 'CHANNEL', channelId: 'channel-1' },
      defaults: {
        advertiserName: 'Company A',
        advertiserContact: null,
        createAdvertiser: true,
        agreedPrice: 500,
        time: '12:00',
        timezone: 'Europe/Warsaw',
        settlementCurrency: 'USD',
      },
      rows: [{ clientRowId: 'row-1', date: '2026-08-16' }],
    });

    expect(tx.telegramAdSale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          advertiserName: 'Company A',
          advertiserContact: null,
          status: TelegramAdSaleStatus.RESERVED,
        }),
      }),
    );
    expect(tx.telegramAdSalePlacement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telegramChannelId: 'channel-1',
          agreedPrice: decimal(500),
          status: TelegramAdPlacementStatus.DRAFT,
        }),
      }),
    );
    expect(tx.telegramAdSalePlacement.update).toHaveBeenCalledWith({
      where: { id: 'placement-1' },
      data: { status: TelegramAdPlacementStatus.RESERVED },
    });
    expect(responseCache.clearByPrefix).toHaveBeenCalledWith(
      'telegram-ad-sales:availability:ws-1:',
    );
    expect(salesService.getSale).toHaveBeenCalledWith('user-1', 'sale-1');
    expect(result.createdPlacementCount).toBe(1);
  });

  it('records under-minimum bulk placements with an automatic manual reason', async () => {
    const { service, prisma, tx } = createService();

    const result = await service.create('user-1', {
      target: { type: 'CHANNEL', channelId: 'channel-1' },
      defaults: {
        advertiserName: 'Company A',
        agreedPrice: 90,
        minimumPrice: 100,
        time: '12:00',
        timezone: 'Europe/Warsaw',
        settlementCurrency: 'USD',
      },
      rows: [{ clientRowId: 'row-1', date: '2026-08-16' }],
    });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.telegramAdSalePlacement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agreedPrice: decimal(90),
          minimumPrice: decimal(100),
          manualPriceReason: 'Bulk price override',
        }),
      }),
    );
    expect(result.createdPlacementCount).toBe(1);
  });

  it('reuses an existing advertiser with the same display name instead of failing on unique constraint', async () => {
    const { service, tx } = createService();
    tx.telegramAdvertiser.findFirst.mockResolvedValueOnce({ id: 'advertiser-existing' });

    await service.create('user-1', {
      target: { type: 'CHANNEL', channelId: 'channel-1' },
      defaults: {
        advertiserName: 'Company A',
        agreedPrice: 500,
        time: '12:00',
        timezone: 'Europe/Warsaw',
        settlementCurrency: 'USD',
      },
      rows: [{ clientRowId: 'row-1', date: '2026-08-16' }],
    });

    expect(tx.telegramAdvertiser.create).not.toHaveBeenCalled();
    expect(tx.telegramAdSale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          advertiserId: 'advertiser-existing',
          advertiserName: 'Company A',
        }),
      }),
    );
  });

  it('keeps duplicate dates as separate placements when the client sends separate rows', async () => {
    const { service, tx } = createService();
    tx.telegramAdSalePlacement.create
      .mockResolvedValueOnce({ id: 'placement-1' })
      .mockResolvedValueOnce({ id: 'placement-2' });

    const result = await service.create('user-1', {
      target: { type: 'CHANNEL', channelId: 'channel-1' },
      defaults: {
        advertiserName: 'Company A',
        agreedPrice: 500,
        time: '18:00',
        timezone: 'Europe/Warsaw',
        settlementCurrency: 'USD',
      },
      rows: [
        { clientRowId: 'row-2026-07-31-0', date: '2026-07-31' },
        {
          clientRowId: 'row-2026-07-31-1',
          date: '2026-07-31',
          channelOverrides: [{ channelId: 'channel-1', time: '20:00' }],
        },
      ],
    });

    expect(tx.telegramAdSalePlacement.create).toHaveBeenCalledTimes(2);
    expect(tx.telegramAdSalePlacement.update).toHaveBeenCalledWith({
      where: { id: 'placement-1' },
      data: { status: TelegramAdPlacementStatus.RESERVED },
    });
    expect(tx.telegramAdSalePlacement.update).toHaveBeenCalledWith({
      where: { id: 'placement-2' },
      data: { status: TelegramAdPlacementStatus.RESERVED },
    });
    expect(result.createdPlacementCount).toBe(2);
    expect(result.rows).toEqual([
      expect.objectContaining({ clientRowId: 'row-2026-07-31-0', placementIds: ['placement-1'] }),
      expect.objectContaining({ clientRowId: 'row-2026-07-31-1', placementIds: ['placement-2'] }),
    ]);
  });

  it('allows bulk rows to record ads beyond existing reserved slot capacity', async () => {
    const { service, tx } = createService();
    tx.telegramAdSalePlacement.findFirst.mockResolvedValue({
      id: 'existing-placement',
      telegramAdSaleId: 'existing-sale',
      scheduledAt: new Date('2026-07-31T10:00:00.000Z'),
      status: TelegramAdPlacementStatus.RESERVED,
    });

    const result = await service.create('user-1', {
      target: { type: 'CHANNEL', channelId: 'channel-1' },
      defaults: {
        advertiserName: 'Company A',
        agreedPrice: 60,
        time: '12:00',
        timezone: 'Europe/Warsaw',
        settlementCurrency: 'USD',
      },
      rows: [{ clientRowId: 'row-2026-07-31-0', date: '2026-07-31' }],
    });

    expect(tx.telegramAdSalePlacement.findFirst).not.toHaveBeenCalled();
    expect(tx.telegramAdSalePlacement.update).toHaveBeenCalledWith({
      where: { id: 'placement-1' },
      data: { status: TelegramAdPlacementStatus.RESERVED },
    });
    expect(result.createdPlacementCount).toBe(1);
  });
});
