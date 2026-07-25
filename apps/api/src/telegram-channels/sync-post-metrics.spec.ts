import { TelegramChannelsService } from './telegram-channels.service';

describe('TelegramChannelsService syncPostsMetricsForWorkspace', () => {
  const prisma = {
    telegramChannel: {
      findFirst: jest.fn(),
    },
  };
  const sourceAccessService = {
    recordDataSource: jest.fn(),
  };
  const mtprotoClient = {
    getChannelPostsMetrics: jest.fn(),
  };

  let service: TelegramChannelsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelegramChannelsService(
      prisma as never,
      {} as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      mtprotoClient as never,
      sourceAccessService as never,
      {} as never,
    );
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      username: 'mentor_samorozvytok',
      telegramChatId: '123456',
    });
    mtprotoClient.getChannelPostsMetrics.mockResolvedValue([]);
    jest
      .spyOn(service as never, 'getChannelSyncCutoffs' as never)
      .mockResolvedValue({
        postsSyncFrom: new Date('2026-07-24T17:55:00.427Z'),
        inviteLinksSyncFrom: new Date('2026-07-24T17:55:00.427Z'),
      } as never);
    jest
      .spyOn(service as never, 'connectedAccount' as never)
      .mockResolvedValue({ id: 'account-1' } as never);
    jest
      .spyOn(service as never, 'accountCredentials' as never)
      .mockReturnValue({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
      } as never);
    jest
      .spyOn(service as never, 'persistPostMetrics' as never)
      .mockResolvedValue({ affectedDays: 0 } as never);
    jest
      .spyOn(service as never, 'createAudienceSnapshotSafely' as never)
      .mockResolvedValue(null as never);
  });

  it('loads the latest posts window without filtering by postsSyncFrom', async () => {
    await service.syncPostsMetricsForWorkspace('workspace-1', 'channel-1', {});

    expect(mtprotoClient.getChannelPostsMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
        postLimit: 50,
      }),
    );
    expect(
      mtprotoClient.getChannelPostsMetrics.mock.calls[0]?.[0]?.postsFrom,
    ).toBeUndefined();
  });
});
