import { TelegramDataSourceStatus } from '@prisma/client';
import { TelegramChannelsService } from './telegram-channels.service';

describe('TelegramChannelsService invite link sync', () => {
  const prisma = {
    workspaceMember: { findMany: jest.fn() },
    telegramUserAccountIntegration: { findMany: jest.fn() },
    telegramChannelDailyStats: { findMany: jest.fn() },
    adCampaign: { findMany: jest.fn() },
    telegramPost: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    telegramChannelStatsSnapshot: { findFirst: jest.fn() },
    telegramChannelStatsPoint: { findMany: jest.fn() },
    telegramInviteLink: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    telegramInviteLinkSnapshot: { createMany: jest.fn() },
  };
  const workspaceService = {
    resolveWorkspaceIdForUser: jest.fn(),
  };
  const responseCache = {
    clearByPrefix: jest.fn(),
  };
  const encryptionService = {
    decrypt: jest.fn(),
  };
  const mtprotoClient = {
    getAllChannelInviteLinks: jest.fn(),
    getChannelHistorical: jest.fn(),
  };
  const sourceAccessService = {
    recordDataSource: jest.fn(),
  };
  const analyticsService = {
    getChannelFinancialSummary: jest.fn(),
  };

  let service: TelegramChannelsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelegramChannelsService(
      prisma as never,
      workspaceService as never,
      responseCache as never,
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
    prisma.telegramInviteLink.count.mockResolvedValue(0);
    prisma.telegramInviteLink.aggregate.mockResolvedValue({
      _sum: { joinedCount: 0, requestedCount: 0 },
    });
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
    prisma.telegramPost.aggregate.mockResolvedValue({
      _sum: {
        viewsCount: 0,
        forwardsCount: 0,
        reactionsCount: 0,
        commentsCount: 0,
      },
    });
    prisma.telegramPost.count.mockResolvedValue(0);
    prisma.telegramChannelStatsSnapshot.findFirst.mockResolvedValue(null);
    prisma.telegramChannelStatsPoint.findMany.mockResolvedValue([]);
    prisma.telegramInviteLinkSnapshot.createMany.mockResolvedValue({
      count: 0,
    });
    sourceAccessService.recordDataSource.mockResolvedValue(undefined);
    analyticsService.getChannelFinancialSummary.mockResolvedValue({
      totalAdSpend: 0,
      campaignsCount: 0,
      totalJoinedSubscribers: 0,
      avgCpa: null,
      activeSubscribersEstimate: null,
      paidActiveSubscribersEstimate: null,
      activeCpa: null,
      avgActiveRate: null,
      avgRetention7d: null,
      dataQuality: null,
      dataQualityReason: null,
      dataQualityWarning: null,
      hasExternalTrafficAnomaly: false,
      hasSubscriberBasePollution: false,
      kpiStatus: 'unknown',
      kpiLabel: '-',
    });
    encryptionService.decrypt.mockReturnValue('decrypted');
    jest
      .spyOn(service as never, 'recalculateCampaignMetricsById' as never)
      .mockResolvedValue(undefined as never);
    jest.spyOn(service as never, 'findOne' as never).mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'ws-1',
      currentSubscribersCount: 10,
      username: 'invite_channel',
    } as never);
    workspaceService.resolveWorkspaceIdForUser.mockResolvedValue('ws-1');
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
      expectedTotalLinks: 24,
      fetchedTotalLinks: 24,
      missingTotalLinks: 0,
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
      expectedTotalLinks: 1,
      fetchedTotalLinks: 1,
      missingTotalLinks: 0,
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
      expectedTotalLinks: 1,
      fetchedTotalLinks: 1,
      missingTotalLinks: 0,
      warnings: [],
    });
    expect(
      (service as any).telegramInviteLinkRequestedCountColumnAvailable,
    ).toBe(false);
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
      expectedTotalLinks: 1,
      fetchedTotalLinks: 1,
      missingTotalLinks: 0,
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
      expectedTotalLinks: 24,
      fetchedTotalLinks: 11,
      missingTotalLinks: 13,
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
          expectedTotalLinks: 24,
          fetchedTotalLinks: 11,
          missingTotalLinks: 13,
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
      expectedTotalLinks: 24,
      fetchedTotalLinks: 1,
      missingTotalLinks: 23,
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

  it('loads analytics invite-link totals via aggregates without reading invite-link rows', async () => {
    prisma.telegramInviteLink.aggregate.mockResolvedValueOnce({
      _sum: { joinedCount: 12, requestedCount: 4 },
    });
    prisma.telegramInviteLink.count.mockResolvedValueOnce(1);

    const result = await service.analytics(
      'user-1',
      'channel-1',
      '2026-07-01',
      '2026-07-18',
    );

    expect((service as any).telegramInviteLinkRequestedCountColumnAvailable).toBe(
      null,
    );
    expect(prisma.telegramInviteLink.findMany).not.toHaveBeenCalled();
    expect(result.summary.joinedHistoricalByLinks).toBe(12);
    expect((result as Record<string, unknown>).inviteLinks).toBeUndefined();
  });

  it('persists invite-link history snapshots during syncHistorical remote invite-link syncs', async () => {
    jest.spyOn(service as never, 'connectedAccount' as never).mockResolvedValue({
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
    } as never);
    jest
      .spyOn(service as never, 'buildInviteAttributionMaps' as never)
      .mockResolvedValue({} as never);
    jest
      .spyOn(service as never, 'persistResolvedChannelIdentity' as never)
      .mockResolvedValue(undefined as never);
    jest
      .spyOn(service as never, 'notifyDetailedTaskProgress' as never)
      .mockResolvedValue(undefined as never);
    jest
      .spyOn(service as never, 'notifyInviteLinksProgress' as never)
      .mockResolvedValue(undefined as never);

    const persistInviteLinkSnapshotsSpy = jest
      .spyOn(service as never, 'persistInviteLinkSnapshots' as never)
      .mockResolvedValue(undefined as never);
    const finalizeInviteLinkSyncSpy = jest
      .spyOn(service as never, 'finalizeInviteLinkSync' as never)
      .mockResolvedValue({
        imported: 2,
        updated: 0,
        scope: 'ALL_ADMINS',
        expectedTotalLinks: 2,
        fetchedTotalLinks: 2,
        missingTotalLinks: 0,
        warnings: [],
      } as never);
    const persistedByUrl = new Map([
      [
        'https://t.me/+hist_1',
        {
          upserted: {
            id: 'invite-1',
            telegramChannelId: 'channel-1',
            adCampaignId: 'campaign-1',
            joinedCount: 11,
            requestedCount: 0,
            isRevoked: false,
          },
          existing: null,
          unresolved: false,
          matchedMember: true,
        },
      ],
      [
        'https://t.me/+hist_2',
        {
          upserted: {
            id: 'invite-2',
            telegramChannelId: 'channel-1',
            adCampaignId: null,
            joinedCount: 7,
            requestedCount: 2,
            isRevoked: false,
          },
          existing: null,
          unresolved: false,
          matchedMember: true,
        },
      ],
    ]);
    jest
      .spyOn(service as never, 'persistInviteLinkFromRemote' as never)
      .mockImplementation(
        (async ({ link }: { link: { url: string } }) => {
          const persisted = persistedByUrl.get(link.url);
          if (!persisted) throw new Error(`Unexpected link ${link.url}`);
          return persisted as never;
        }) as never,
      );

    mtprotoClient.getChannelHistorical.mockImplementation(
      async (params: {
        onInviteLinkLoaded?: (
          link: { url: string },
          loadedCount: number,
          expectedTotal: number,
          warnings: string[],
        ) => Promise<void>;
      }) => {
        const links = [
          { url: 'https://t.me/+hist_1' },
          { url: 'https://t.me/+hist_2' },
        ];
        if (params.onInviteLinkLoaded) {
          await params.onInviteLinkLoaded(links[0], 1, 2, []);
          await params.onInviteLinkLoaded(links[1], 2, 2, []);
        }
        return {
          channel: null,
          inviteLinksDetailed: links,
          inviteLinksScope: 'ALL_ADMINS',
          inviteLinksExpectedTotal: 2,
          inviteLinkWarnings: [],
        };
      },
    );

    await service.syncHistorical('user-1', 'channel-1', {
      syncInviteLinks: true,
      syncPosts: false,
      syncMetrics: false,
      syncVisuals: false,
      syncJoinRequests: false,
      syncIncludeHistoricalPosts: false,
      postLimit: 10,
    } as never);

    expect(persistInviteLinkSnapshotsSpy).toHaveBeenCalledTimes(1);
    expect(persistInviteLinkSnapshotsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        channelId: 'channel-1',
        syncedAt: expect.any(Date),
        links: expect.arrayContaining([
          expect.objectContaining({
            id: 'invite-1',
            joinedCount: 11,
            requestedCount: 0,
          }),
          expect.objectContaining({
            id: 'invite-2',
            joinedCount: 7,
            requestedCount: 2,
          }),
        ]),
      }),
    );
    expect(finalizeInviteLinkSyncSpy).toHaveBeenCalledTimes(1);
  });

  it('clamps analytics date range to the latest 366 days instead of throwing', async () => {
    const result = await service.analytics(
      'user-1',
      'channel-1',
      '2024-01-01',
      '2026-07-18',
    );

    expect(result.range.maxRangeDays).toBe(366);
    expect(result.range.from).toBe('2025-07-17T00:00:00.000Z');
    expect(result.range.to).toBe('2026-07-18T00:00:00.000Z');
    expect(prisma.telegramChannelDailyStats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: {
            gte: new Date('2025-07-17T00:00:00.000Z'),
            lte: new Date('2026-07-18T00:00:00.000Z'),
          },
        }),
      }),
    );
  });
});
