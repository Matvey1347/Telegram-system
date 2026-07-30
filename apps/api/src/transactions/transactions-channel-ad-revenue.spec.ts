import { BadRequestException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

describe('TransactionsService channel advertising revenue', () => {
  const makeService = () => {
    const prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'USD' }) },
      account: { findFirst: jest.fn().mockResolvedValue({ id: 'account-1', currency: 'USD' }) },
      transactionCategory: {
        findFirst: jest.fn(),
      },
      workspaceMember: { findFirst: jest.fn() },
      telegramChannel: {
        findFirst: jest.fn(),
      },
      transaction: {
        create: jest.fn().mockResolvedValue({
          id: 'tx-1',
          accountId: 'account-1',
          telegramChannelId: 'channel-1',
          categoryId: 'cat-revenue',
          category: 'Channel Advertising Revenue',
          telegramChannel: {
            id: 'channel-1',
            title: 'Revenue Channel',
            username: 'revenue_channel',
            photoUrl: null,
          },
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn(),
      $executeRawUnsafe: jest.fn(),
      $transaction: jest.fn().mockImplementation(async (callback) => callback(prisma)),
    };
    const workspaceService = {
      resolveAssignedMemberId: jest.fn().mockResolvedValue({
        workspaceId: 'ws-1',
        assignedMemberId: null,
      }),
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-1'),
    };
    const currencyConversionService = {
      getRate: jest.fn().mockResolvedValue(1),
    };
    const financeCategoriesService = {
      ensureSystemCategories: jest.fn(),
    };

    return {
      prisma,
      service: new TransactionsService(
        prisma as never,
        workspaceService as never,
        currencyConversionService as never,
        financeCategoriesService as never,
      ),
    };
  };

  it('requires a telegram channel for channel advertising revenue income', async () => {
    const { prisma, service } = makeService();
    prisma.transactionCategory.findFirst.mockResolvedValue({
      id: 'cat-revenue',
      type: 'income',
      key: 'channel_advertising_revenue',
      name: 'Channel Advertising Revenue',
    });

    await expect(
      service.create('user-1', {
        accountId: 'account-1',
        type: 'income',
        amount: 500,
        categoryId: 'cat-revenue',
        date: '2026-07-29',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores the selected telegram channel on channel advertising revenue income', async () => {
    const { prisma, service } = makeService();
    prisma.transactionCategory.findFirst.mockResolvedValue({
      id: 'cat-revenue',
      type: 'income',
      key: 'channel_advertising_revenue',
      name: 'Channel Advertising Revenue',
    });
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      title: 'Revenue Channel',
      username: 'revenue_channel',
      photoUrl: null,
    });

    const result = await service.create('user-1', {
      accountId: 'account-1',
      type: 'income',
      amount: 500,
      categoryId: 'cat-revenue',
      telegramChannelId: 'channel-1',
      date: '2026-07-29',
    });

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telegramChannelId: 'channel-1',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        telegramChannel: expect.objectContaining({
          id: 'channel-1',
          title: 'Revenue Channel',
        }),
      }),
    );
  });
});
