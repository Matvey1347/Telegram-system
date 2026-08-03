import { FinanceCategoriesService } from './finance-categories.service';

describe('FinanceCategoriesService', () => {
  it('merges legacy Telegram Ad Sales income category into Channel Advertising Revenue', async () => {
    const prisma: any = {
      icon: {
        upsert: jest
          .fn()
          .mockResolvedValueOnce({ id: 'icon-channel' })
          .mockResolvedValueOnce({ id: 'icon-reversal' }),
      },
      transactionCategory: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'legacy-category',
              key: 'telegram_ad_sales',
              name: 'Telegram Ad Sales',
            },
          ]),
        upsert: jest
          .fn()
          .mockResolvedValueOnce({ id: 'investment-category', name: 'Investment' })
          .mockResolvedValueOnce({
            id: 'channel-revenue-category',
            name: 'Channel Advertising Revenue',
          })
          .mockResolvedValueOnce({
            id: 'reversal-category',
            name: 'Telegram Ad Sales Reversal',
          })
          .mockResolvedValueOnce({ id: 'advertising-category', name: 'Advertising' })
          .mockResolvedValueOnce({ id: 'buy-channels-category', name: 'Buy Channels' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      transaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const workspaceService: any = {};
    const service = new FinanceCategoriesService(prisma, workspaceService);

    await service.ensureSystemCategories('ws-1');

    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-1',
        OR: [
          { categoryId: { in: ['legacy-category'] } },
          { category: 'Telegram Ad Sales' },
        ],
      },
      data: {
        categoryId: 'channel-revenue-category',
        category: 'Channel Advertising Revenue',
      },
    });
    expect(prisma.transactionCategory.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['legacy-category'] } },
    });
  });
});
