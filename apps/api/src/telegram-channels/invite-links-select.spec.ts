import { TelegramChannelsService } from './telegram-channels.service';

describe('TelegramChannelsService inviteLinksForSelect', () => {
  it('returns only unused invite links for campaign creation', async () => {
    const prisma = {
      telegramInviteLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'link-free',
            workspaceId: 'ws-1',
            telegramChannelId: 'channel-1',
            adCampaignId: null,
            name: 'Free link',
            url: 'https://t.me/+free',
            joinedCount: 0,
            requestedCount: 0,
            isRevoked: false,
          },
        ]),
      },
    };
    const service = new TelegramChannelsService(
      prisma as never,
      {} as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    service['workspace'] = jest.fn().mockResolvedValue('ws-1');
    service['findOne'] = jest.fn().mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'ws-1',
    });
    service['attachInviteLinkHistories'] = jest
      .fn()
      .mockImplementation(async (_workspaceId, _channelId, links) => links);

    const result = await service.inviteLinksForSelect('user-1', 'channel-1');

    expect(prisma.telegramInviteLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              workspaceId: 'ws-1',
              telegramChannelId: 'channel-1',
            },
            { adCampaignId: null },
          ],
        },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('link-free');
  });

  it('keeps current campaign invite links available during editing', async () => {
    const prisma = {
      telegramInviteLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'link-own',
            workspaceId: 'ws-1',
            telegramChannelId: 'channel-1',
            adCampaignId: 'campaign-1',
            name: 'Own link',
            url: 'https://t.me/+own',
            joinedCount: 0,
            requestedCount: 0,
            isRevoked: false,
          },
          {
            id: 'link-free',
            workspaceId: 'ws-1',
            telegramChannelId: 'channel-1',
            adCampaignId: null,
            name: 'Free link',
            url: 'https://t.me/+free',
            joinedCount: 0,
            requestedCount: 0,
            isRevoked: false,
          },
        ]),
      },
    };
    const service = new TelegramChannelsService(
      prisma as never,
      {} as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    service['workspace'] = jest.fn().mockResolvedValue('ws-1');
    service['findOne'] = jest.fn().mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'ws-1',
    });
    service['attachInviteLinkHistories'] = jest
      .fn()
      .mockImplementation(async (_workspaceId, _channelId, links) => links);

    const result = await service.inviteLinksForSelect('user-1', 'channel-1', {
      availableForCampaignId: 'campaign-1',
    });

    expect(prisma.telegramInviteLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              workspaceId: 'ws-1',
              telegramChannelId: 'channel-1',
            },
            {
              OR: [
                { adCampaignId: null },
                { adCampaignId: 'campaign-1' },
              ],
            },
          ],
        },
      }),
    );
    expect(result.map((link: { id: string }) => link.id)).toEqual([
      'link-own',
      'link-free',
    ]);
  });
});
