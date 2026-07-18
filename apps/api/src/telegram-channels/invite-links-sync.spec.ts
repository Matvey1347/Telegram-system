import { TelegramDataSourceStatus } from '@prisma/client';
import { TelegramChannelsService } from './telegram-channels.service';

describe('TelegramChannelsService invite link sync', () => {
  const prisma = {
    workspaceMember: { findMany: jest.fn() },
    telegramUserAccountIntegration: { findMany: jest.fn() },
    telegramChannelDailyStats: { findMany: jest.fn() },
    adCampaign: { findMany: jest.fn() },
    telegramPost: { findMany: jest.fn() },
    telegramChannelStatsSnapshot: { findFirst: jest.fn() },
    telegramChannelStatsPoint: { findMany: jest.fn() },
    telegramInviteLink: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const workspaceService = {
    resolveWorkspaceIdForUser: jest.fn(),
  };
  const encryptionService = {
    decrypt: jest.fn(),
  };
  const mtprotoClient = {
    getAllChannelInviteLinks: jest.fn(),
  };
  const sourceAccessService = {
    recordDataSource: jest.fn(),
  };
  const analyticsService = {};

  let service: TelegramChannelsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelegramChannelsService(
      prisma as never,
      workspaceService as never,
      encryptionService as never,
      mtprotoClient as never,
      sourceAccessService as never,
      analyticsService as never,
    );
    prisma.workspaceMember.findMany.mockResolvedValue([
      { id: 'member-1', telegramUsername: 'owner_admin' },
      { id: 'member-2', telegramUsername: 'sasha_admin' },
    ]);
    prisma.telegramUserAccountIntegration.findMany.mockResolvedValue([
      {
        telegramUserId: '100',
        username: 'owner_admin',
        assignedMemberId: 'member-1',
      },
      {
        telegramUserId: '200',
        username: 'sasha_admin',
        assignedMemberId: 'member-2',
      },
    ]);
    prisma.telegramInviteLink.findUnique.mockResolvedValue(null);
    prisma.telegramInviteLink.findFirst.mockResolvedValue(null);
    prisma.telegramInviteLink.upsert.mockImplementation(
      async ({ create }: { create: Record<string, unknown> }) => ({
        id: String(create.url),
        adCampaignId: null,
      }),
    );
    prisma.telegramInviteLink.findMany.mockResolvedValue([]);
    prisma.telegramInviteLink.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: String(data.url),
        adCampaignId: null,
      }),
    );
    prisma.telegramInviteLink.update.mockImplementation(
      async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        adCampaignId: null,
      }),
    );
    prisma.telegramChannelDailyStats.findMany.mockResolvedValue([]);
    prisma.adCampaign.findMany.mockResolvedValue([]);
    prisma.telegramPost.findMany.mockResolvedValue([]);
    prisma.telegramChannelStatsSnapshot.findFirst.mockResolvedValue(null);
    prisma.telegramChannelStatsPoint.findMany.mockResolvedValue([]);
    sourceAccessService.recordDataSource.mockResolvedValue(undefined);
    jest
      .spyOn(service as never, 'recalculateCampaignMetricsById' as never)
      .mockResolvedValue(undefined as never);
    jest.spyOn(service as never, 'findOne' as never).mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'ws-1',
      currentSubscribersCount: 10,
    } as never);
  });

  it('upserts all remote links and emits sequential saving progress', async () => {
    const progress: string[] = [];
    const remoteLinks = Array.from({ length: 24 }, (_, index) => ({
      url: `https://t.me/+link_${index + 1}`,
      title: `Link ${index + 1}`,
      telegramCreatorUserId: index < 11 ? '100' : '200',
      creatorUsername: index < 11 ? 'owner_admin' : 'sasha_admin',
      creatorFirstName: index < 11 ? 'Owner' : 'Sasha',
      creatorLastName: 'Admin',
      creatorPhotoUrl: null,
      createdAt: null,
      startDate: null,
      expireDate: null,
      usageLimit: null,
      usage: index + 1,
      requested: index === 12 ? 3 : 0,
      requestNeeded: index === 12,
      permanent: true,
      revoked: false,
    }));

    const result = await (service as any).syncChannelInviteLinks({
      workspaceId: 'ws-1',
      channelId: 'channel-1',
      account: {
        id: 'tg-account-1',
        label: 'Owner',
        username: 'owner_admin',
        firstName: 'Owner',
        apiId: '1',
        apiHashEncrypted: 'enc',
        apiHashIv: 'iv',
        apiHashAuthTag: 'tag',
        sessionEncrypted: 'sess',
        sessionIv: 'sess-iv',
        sessionAuthTag: 'sess-tag',
      },
      channelReference: {
        username: 'invite_channel',
        telegramChatId: '7001',
        telegramAccessHash: '9001',
      },
      prefetchedRemote: {
        scope: 'ALL_ADMINS',
        expectedTotalLinks: 24,
        admins: [],
        links: remoteLinks,
        warnings: [],
      },
      onProgress: (item: any) => {
        if (item.phase === 'saving_invite_links') {
          progress.push(`${item.stageCurrent}/${item.stageTotal}`);
        }
      },
      progressStep: { current: 2, total: 8 },
    });

    expect(result).toEqual({
      imported: 24,
      updated: 0,
      scope: 'ALL_ADMINS',
      warnings: [],
    });
    expect(prisma.telegramInviteLink.upsert).toHaveBeenCalledTimes(24);
    expect(prisma.telegramInviteLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          url: 'https://t.me/+link_13',
          joinedCount: 13,
          requestedCount: 3,
          creatorMemberId: 'member-2',
        }),
        select: expect.objectContaining({
          id: true,
          adCampaignId: true,
        }),
      }),
    );
    expect(prisma.telegramInviteLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          id: true,
          name: true,
          createdBy: true,
          adCampaignId: true,
        }),
      }),
    );
    expect(progress[0]).toBe('0/24');
    expect(progress[1]).toBe('1/24');
    expect(progress.at(-1)).toBe('24/24');
    expect(sourceAccessService.recordDataSource).toHaveBeenCalledWith(
      expect.objectContaining({
        status: TelegramDataSourceStatus.SUCCESS,
        metadata: expect.objectContaining({
          importedCount: 24,
          matchedMembersCount: 24,
          unresolvedCreatorsCount: 0,
        }),
      }),
    );
  });

  it('retries invite-link upsert without requestedCount when the running Prisma client is outdated', async () => {
    prisma.telegramInviteLink.upsert
      .mockRejectedValueOnce(
        new Error('Unknown argument `requestedCount`. Available options are marked with ?.'),
      )
      .mockResolvedValueOnce({
        id: 'link-1',
        adCampaignId: null,
      });

    const result = await (service as any).syncChannelInviteLinks({
      workspaceId: 'ws-1',
      channelId: 'channel-1',
      account: {
        id: 'tg-account-1',
        label: 'Owner',
        username: 'owner_admin',
        firstName: 'Owner',
        apiId: '1',
        apiHashEncrypted: 'enc',
        apiHashIv: 'iv',
        apiHashAuthTag: 'tag',
        sessionEncrypted: 'sess',
        sessionIv: 'sess-iv',
        sessionAuthTag: 'sess-tag',
      },
      channelReference: {
        username: 'invite_channel',
        telegramChatId: '7001',
        telegramAccessHash: '9001',
      },
      prefetchedRemote: {
        scope: 'ALL_ADMINS',
        expectedTotalLinks: 1,
        admins: [],
        links: [
          {
            url: 'https://t.me/+link_compat',
            title: 'Compat Link',
            telegramCreatorUserId: '100',
            creatorUsername: 'owner_admin',
            creatorFirstName: 'Owner',
            creatorLastName: 'Admin',
            creatorPhotoUrl: null,
            createdAt: null,
            startDate: null,
            expireDate: null,
            usageLimit: null,
            usage: 1,
            requested: 7,
            requestNeeded: true,
            permanent: true,
            revoked: false,
          },
        ],
        warnings: [],
      },
      progressStep: { current: 2, total: 8 },
    });

    expect(result).toEqual({
      imported: 1,
      updated: 0,
      scope: 'ALL_ADMINS',
      warnings: [],
    });
    expect(prisma.telegramInviteLink.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.telegramInviteLink.upsert.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        create: expect.objectContaining({ requestedCount: 7 }),
        update: expect.objectContaining({ requestedCount: 7 }),
        select: expect.objectContaining({
          id: true,
          adCampaignId: true,
        }),
      }),
    );
    expect(prisma.telegramInviteLink.upsert.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        create: expect.not.objectContaining({ requestedCount: expect.anything() }),
        update: expect.not.objectContaining({ requestedCount: expect.anything() }),
      }),
    );
  });

  it('retries invite-link upsert without requestedCount when the database column is missing', async () => {
    prisma.telegramInviteLink.upsert
      .mockRejectedValueOnce(
        new Error(
          'The column `requestedCount of relation TelegramInviteLink` does not exist in the current database.',
        ),
      )
      .mockResolvedValueOnce({
        id: 'link-db-compat',
        adCampaignId: null,
      });

    const result = await (service as any).syncChannelInviteLinks({
      workspaceId: 'ws-1',
      channelId: 'channel-1',
      account: {
        id: 'tg-account-1',
        label: 'Owner',
        username: 'owner_admin',
        firstName: 'Owner',
        apiId: '1',
        apiHashEncrypted: 'enc',
        apiHashIv: 'iv',
        apiHashAuthTag: 'tag',
        sessionEncrypted: 'sess',
        sessionIv: 'sess-iv',
        sessionAuthTag: 'sess-tag',
      },
      channelReference: {
        username: 'invite_channel',
        telegramChatId: '7001',
        telegramAccessHash: '9001',
      },
      prefetchedRemote: {
        scope: 'ALL_ADMINS',
        expectedTotalLinks: 1,
        admins: [],
        links: [
          {
            url: 'https://t.me/+link_db_compat',
            title: 'Compat Link',
            telegramCreatorUserId: '100',
            creatorUsername: 'owner_admin',
            creatorFirstName: 'Owner',
            creatorLastName: 'Admin',
            creatorPhotoUrl: null,
            createdAt: null,
            startDate: null,
            expireDate: null,
            usageLimit: null,
            usage: 1,
            requested: 9,
            requestNeeded: true,
            permanent: true,
            revoked: false,
          },
        ],
        warnings: [],
      },
      progressStep: { current: 2, total: 8 },
    });

    expect(result).toEqual({
      imported: 1,
      updated: 0,
      scope: 'ALL_ADMINS',
      warnings: [],
    });
    expect((service as any).telegramInviteLinkRequestedCountColumnAvailable).toBe(
      false,
    );
    expect(prisma.telegramInviteLink.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.telegramInviteLink.upsert.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        create: expect.objectContaining({ requestedCount: 9 }),
        update: expect.objectContaining({ requestedCount: 9 }),
      }),
    );
    expect(prisma.telegramInviteLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ requestedCount: expect.anything() }),
      }),
    );
    expect(prisma.telegramInviteLink.update).not.toHaveBeenCalled();
  });

  it('skips requestedCount entirely when the current Prisma runtime does not support it yet', async () => {
    (service as any).telegramInviteLinkRequestedCountSupported = false;

    const result = await (service as any).syncChannelInviteLinks({
      workspaceId: 'ws-1',
      channelId: 'channel-1',
      account: {
        id: 'tg-account-1',
        label: 'Owner',
        username: 'owner_admin',
        firstName: 'Owner',
        apiId: '1',
        apiHashEncrypted: 'enc',
        apiHashIv: 'iv',
        apiHashAuthTag: 'tag',
        sessionEncrypted: 'sess',
        sessionIv: 'sess-iv',
        sessionAuthTag: 'sess-tag',
      },
      channelReference: {
        username: 'invite_channel',
        telegramChatId: '7001',
        telegramAccessHash: '9001',
      },
      prefetchedRemote: {
        scope: 'ALL_ADMINS',
        expectedTotalLinks: 1,
        admins: [],
        links: [
          {
            url: 'https://t.me/+link_runtime_compat',
            title: 'Compat Link',
            telegramCreatorUserId: '100',
            creatorUsername: 'owner_admin',
            creatorFirstName: 'Owner',
            creatorLastName: 'Admin',
            creatorPhotoUrl: null,
            createdAt: null,
            startDate: null,
            expireDate: null,
            usageLimit: null,
            usage: 1,
            requested: 5,
            requestNeeded: true,
            permanent: true,
            revoked: false,
          },
        ],
        warnings: [],
      },
      progressStep: { current: 2, total: 8 },
    });

    expect(result).toEqual({
      imported: 1,
      updated: 0,
      scope: 'ALL_ADMINS',
      warnings: [],
    });
    expect(prisma.telegramInviteLink.upsert).not.toHaveBeenCalled();
    expect(prisma.telegramInviteLink.create).toHaveBeenCalledTimes(1);
    expect(prisma.telegramInviteLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ requestedCount: expect.anything() }),
        select: expect.objectContaining({
          id: true,
          adCampaignId: true,
        }),
      }),
    );
  });

  it('persists partial invite-link sync for the reported 24 expected and 11 loaded scenario without crashing', async () => {
    const progress: string[] = [];
    const remoteLinks = Array.from({ length: 11 }, (_, index) => ({
      url: `https://t.me/+owner_partial_${index + 1}`,
      title: null,
      telegramCreatorUserId: '100',
      creatorUsername: 'owner_admin',
      creatorFirstName: 'Matvii',
      creatorLastName: null,
      creatorPhotoUrl: null,
      createdAt: null,
      startDate: null,
      expireDate: null,
      usageLimit: null,
      usage: index,
      requested: 0,
      requestNeeded: true,
      permanent: true,
      revoked: false,
    }));
    (service as any).telegramInviteLinkRequestedCountSupported = false;

    const result = await (service as any).syncChannelInviteLinks({
      workspaceId: 'ws-1',
      channelId: 'cmrf6qlrb000g2igcrc7pkabz',
      account: {
        id: 'tg-account-1',
        label: 'Owner',
        username: 'matviikpr',
        firstName: 'Matvii',
        apiId: '1',
        apiHashEncrypted: 'enc',
        apiHashIv: 'iv',
        apiHashAuthTag: 'tag',
        sessionEncrypted: 'sess',
        sessionIv: 'sess-iv',
        sessionAuthTag: 'sess-tag',
      },
      channelReference: {
        telegramChatId: '4492379514',
      },
      prefetchedRemote: {
        scope: 'PARTIAL_ADMINS',
        expectedTotalLinks: 24,
        admins: [],
        links: remoteLinks,
        warnings: [
          'Admin 6894032839 invite-link sync failed: Telegram admin 6894032839 could not be resolved as an input user.',
          'Admin 821695725 invite-link sync failed: Telegram admin 821695725 could not be resolved as an input user.',
          'Admin 433791261 invite-link sync failed: Telegram admin 433791261 could not be resolved as an input user.',
        ],
      },
      onProgress: (item: any) => {
        if (item.phase === 'saving_invite_links') {
          progress.push(`${item.stageCurrent}/${item.stageTotal}`);
        }
      },
      progressStep: { current: 2, total: 8 },
    });

    expect(result).toEqual({
      imported: 11,
      updated: 0,
      scope: 'PARTIAL_ADMINS',
      warnings: [
        'Admin 6894032839 invite-link sync failed: Telegram admin 6894032839 could not be resolved as an input user.',
        'Admin 821695725 invite-link sync failed: Telegram admin 821695725 could not be resolved as an input user.',
        'Admin 433791261 invite-link sync failed: Telegram admin 433791261 could not be resolved as an input user.',
      ],
    });
    expect(prisma.telegramInviteLink.upsert).not.toHaveBeenCalled();
    expect(prisma.telegramInviteLink.create).toHaveBeenCalledTimes(11);
    expect(progress[0]).toBe('0/11');
    expect(progress.at(-1)).toBe('11/11');
    expect(sourceAccessService.recordDataSource).toHaveBeenCalledWith(
      expect.objectContaining({
        status: TelegramDataSourceStatus.PARTIAL,
        metadata: expect.objectContaining({
          scope: 'PARTIAL_ADMINS',
          activeLinksCount: 11,
          importedCount: 11,
          updatedCount: 0,
          warnings: expect.arrayContaining([
            expect.stringContaining('6894032839'),
            expect.stringContaining('821695725'),
            expect.stringContaining('433791261'),
          ]),
        }),
      }),
    );
  });

  it('avoids selecting the missing requestedCount column while syncing partial invite links', async () => {
    (service as any).telegramInviteLinkRequestedCountSupported = false;
    const result = await (service as any).syncChannelInviteLinks({
        workspaceId: 'ws-1',
        channelId: 'cmrf6qlrb000g2igcrc7pkabz',
        account: {
          id: 'tg-account-1',
          label: 'Owner',
          username: 'matviikpr',
          firstName: 'Matvii',
          apiId: '1',
          apiHashEncrypted: 'enc',
          apiHashIv: 'iv',
          apiHashAuthTag: 'tag',
          sessionEncrypted: 'sess',
          sessionIv: 'sess-iv',
          sessionAuthTag: 'sess-tag',
        },
        channelReference: {
          telegramChatId: '4492379514',
        },
        prefetchedRemote: {
          scope: 'PARTIAL_ADMINS',
          expectedTotalLinks: 24,
          admins: [],
          links: [
            {
              url: 'https://t.me/+mbliuCdzB4k0ODdk',
              title: null,
              telegramCreatorUserId: '100',
              creatorUsername: 'owner_admin',
              creatorFirstName: 'Matvii',
              creatorLastName: null,
              creatorPhotoUrl: null,
              createdAt: null,
              startDate: null,
              expireDate: null,
              usageLimit: null,
              usage: 0,
              requested: 0,
              requestNeeded: true,
              permanent: true,
              revoked: false,
            },
          ],
          warnings: [
            'Admin 6894032839 invite-link sync failed: Telegram admin 6894032839 could not be resolved as an input user.',
          ],
        },
        progressStep: { current: 2, total: 8 },
      });

    expect(result).toEqual({
      imported: 1,
      updated: 0,
      scope: 'PARTIAL_ADMINS',
      warnings: [
        'Admin 6894032839 invite-link sync failed: Telegram admin 6894032839 could not be resolved as an input user.',
      ],
    });

    expect(prisma.telegramInviteLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          id: true,
          name: true,
          createdBy: true,
          adCampaignId: true,
        }),
      }),
    );
    expect(prisma.telegramInviteLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          id: true,
          adCampaignId: true,
        }),
      }),
    );
  });

  it('falls back to invite-link reads without requestedCount while loading analytics', async () => {
    prisma.telegramInviteLink.findMany
      .mockRejectedValueOnce(
        new Error(
          'The column `TelegramInviteLink.requestedCount` does not exist in the current database.',
        ),
      )
      .mockResolvedValueOnce([
        {
          id: 'link-analytics-1',
          workspaceId: 'ws-1',
          telegramChannelId: 'channel-1',
          adCampaignId: null,
          name: 'Analytics Link',
          url: 'https://t.me/+analytics_1',
          telegramInviteLinkId: 'https://t.me/+analytics_1',
          createdBy: 'Owner',
          createsJoinRequest: false,
          expireDate: null,
          memberLimit: null,
          joinedCount: 12,
          isRevoked: false,
          lastSyncedAt: null,
          creatorTelegramUserId: '100',
          creatorUsername: 'owner_admin',
          creatorFirstName: 'Owner',
          creatorLastName: 'Admin',
          creatorPhotoUrl: null,
          creatorMemberId: 'member-1',
          creatorMatchSource: 'TELEGRAM_USER_ID',
          createdAt: new Date('2026-07-18T00:00:00.000Z'),
          updatedAt: new Date('2026-07-18T00:00:00.000Z'),
          adCampaign: null,
          creatorMember: null,
        },
      ]);

    const result = await service.analytics(
      'user-1',
      'channel-1',
      '2026-07-01',
      '2026-07-18',
    );

    expect((service as any).telegramInviteLinkRequestedCountColumnAvailable).toBe(
      false,
    );
    expect(prisma.telegramInviteLink.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.telegramInviteLink.findMany.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        select: expect.objectContaining({ requestedCount: true }),
      }),
    );
    expect(prisma.telegramInviteLink.findMany.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        select: expect.not.objectContaining({
          requestedCount: expect.anything(),
        }),
      }),
    );
    expect(result.summary.joinedHistoricalByLinks).toBe(12);
    expect(result.inviteLinks).toEqual([
      expect.objectContaining({
        id: 'link-analytics-1',
        joinedCount: 12,
        requestedCount: 0,
      }),
    ]);
  });
});
