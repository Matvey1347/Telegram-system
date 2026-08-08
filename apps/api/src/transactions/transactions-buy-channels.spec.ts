import { TransactionsService } from './transactions.service';

describe('TransactionsService buy channels', () => {
  const makeService = () => {
    const prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'USD' }) },
      account: { findFirst: jest.fn().mockResolvedValue({ id: 'account-1', currency: 'USD' }) },
      transactionCategory: {
        findFirst: jest.fn(),
      },
      workspaceMember: { findFirst: jest.fn() },
      transaction: {
        create: jest.fn().mockResolvedValue({
          id: 'tx-1',
          accountId: 'account-1',
          categoryId: 'cat-buy',
          category: 'Buy Channels',
        }),
      },
      $queryRaw: jest.fn(),
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
    const service = new TransactionsService(
      prisma as never,
      workspaceService as never,
      currencyConversionService as never,
      financeCategoriesService as never,
    );

    return { prisma, service };
  };

  it('allows saving a legacy Buy Channels expense without a telegram channel', async () => {
    const { prisma, service } = makeService();
    prisma.transactionCategory.findFirst.mockResolvedValue({
      id: 'cat-buy',
      type: 'expense',
      key: null,
      name: 'Buy Channels (legacy)',
    });
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.create('user-1', {
      accountId: 'account-1',
      type: 'expense',
      amount: 157.88,
      categoryId: 'cat-buy',
      date: '2026-07-24',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'tx-1',
        purchasedTelegramChannel: null,
      }),
    );
  });

  it('does not sync purchase channel links for regular transaction categories', async () => {
    const { prisma, service } = makeService();
    prisma.transactionCategory.findFirst.mockResolvedValue({
      id: 'cat-expense',
      type: 'expense',
      key: null,
      name: 'QA Expense',
    });
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.create('user-1', {
      accountId: 'account-1',
      type: 'expense',
      amount: 12.34,
      exchangeRateToPrimary: 1,
      categoryId: 'cat-expense',
      date: '2026-08-08',
    });

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: 'tx-1',
        purchasedTelegramChannel: null,
      }),
    );
  });

  it('links the created transaction to the selected telegram channel', async () => {
    const { prisma, service } = makeService();
    prisma.transactionCategory.findFirst.mockResolvedValue({
      id: 'cat-buy',
      type: 'expense',
      key: 'buy_channels',
      name: 'Buy Channels',
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 'channel-1',
          title: 'Mentor',
          username: 'mentor_samorozvytok',
          photoUrl: null,
          purchaseTransactionId: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          purchaseTransactionId: 'tx-1',
          id: 'channel-1',
          title: 'Mentor',
          username: 'mentor_samorozvytok',
          photoUrl: null,
        },
      ]);

    const result = await service.create('user-1', {
      accountId: 'account-1',
      type: 'expense',
      amount: 157.88,
      categoryId: 'cat-buy',
      telegramChannelId: 'channel-1',
      date: '2026-07-24',
    });

    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        purchasedTelegramChannel: expect.objectContaining({
          id: 'channel-1',
          title: 'Mentor',
        }),
      }),
    );
  });
});
