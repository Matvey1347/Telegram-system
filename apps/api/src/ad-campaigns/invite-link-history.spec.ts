import { buildCampaignInviteLinkHistoryPayload } from './invite-link-history';

const date = (value: string) => new Date(value);

function inviteLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-1',
    name: 'Primary',
    url: 'https://t.me/+primary',
    joinedCount: 100,
    requestedCount: 20,
    isRevoked: false,
    createdAt: date('2026-01-01T00:00:00.000Z'),
    updatedAt: date('2026-01-03T00:00:00.000Z'),
    lastSyncedAt: date('2026-01-03T00:00:00.000Z'),
    ...overrides,
  };
}

describe('buildCampaignInviteLinkHistoryPayload', () => {
  it('builds a synthetic current point when there are no snapshot rows', () => {
    const payload = buildCampaignInviteLinkHistoryPayload(
      {
        id: 'campaign-1',
        title: 'Campaign',
        inviteLinks: [inviteLink()],
      },
      [],
    );

    expect(payload.points).toHaveLength(1);
    expect(payload.summary).toMatchObject({
      currentJoinedCount: 100,
      currentRequestedCount: 20,
      currentTotalAttributed: 120,
      peakTotalAttributed: 120,
      inviteLinksCount: 1,
    });
    expect(payload.inviteLinks[0].summary.currentTotalAttributed).toBe(120);
  });

  it('does not duplicate the current point when the latest snapshot matches', () => {
    const syncedAt = date('2026-01-03T00:00:00.000Z');
    const payload = buildCampaignInviteLinkHistoryPayload(
      {
        id: 'campaign-1',
        inviteLinks: [
          inviteLink({
            joinedCount: 100,
            requestedCount: 20,
            lastSyncedAt: syncedAt,
          }),
        ],
      },
      [
        {
          inviteLinkId: 'link-1',
          syncedAt,
          joinedCount: 100,
          requestedCount: 20,
          isRevoked: false,
        },
      ],
    );

    expect(payload.points).toHaveLength(1);
    expect(payload.points[0].syncedAt).toEqual(syncedAt);
  });

  it('aggregates same-time snapshots and reports drawdown from peak', () => {
    const payload = buildCampaignInviteLinkHistoryPayload(
      {
        id: 'campaign-1',
        inviteLinks: [
          inviteLink({
            id: 'link-1',
            joinedCount: 80,
            requestedCount: 0,
            lastSyncedAt: date('2026-01-03T00:00:00.000Z'),
          }),
          inviteLink({
            id: 'link-2',
            name: 'Second',
            url: 'https://t.me/+second',
            joinedCount: 20,
            requestedCount: 0,
            lastSyncedAt: date('2026-01-03T00:00:00.000Z'),
          }),
        ],
      },
      [
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-02T00:00:00.000Z'),
          joinedCount: 80,
          requestedCount: 70,
          isRevoked: false,
        },
        {
          inviteLinkId: 'link-2',
          syncedAt: date('2026-01-02T00:00:00.000Z'),
          joinedCount: 20,
          requestedCount: 30,
          isRevoked: false,
        },
      ],
    );

    expect(payload.points.map((point) => point.totalAttributed)).toEqual([
      200, 100,
    ]);
    expect(payload.summary).toMatchObject({
      currentJoinedCount: 100,
      currentRequestedCount: 0,
      peakTotalAttributed: 200,
      drawdownFromPeak: 100,
      drawdownPercent: 50,
      hasHighDropoff: true,
    });
  });

  it('clamps point limits while keeping at least two points', () => {
    const payload = buildCampaignInviteLinkHistoryPayload(
      {
        id: 'campaign-1',
        inviteLinks: [
          inviteLink({
            joinedCount: 30,
            requestedCount: 0,
            lastSyncedAt: date('2026-01-04T00:00:00.000Z'),
          }),
        ],
      },
      [
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-01T00:00:00.000Z'),
          joinedCount: 10,
          requestedCount: 0,
          isRevoked: false,
        },
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-02T00:00:00.000Z'),
          joinedCount: 20,
          requestedCount: 0,
          isRevoked: false,
        },
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-03T00:00:00.000Z'),
          joinedCount: 25,
          requestedCount: 0,
          isRevoked: false,
        },
      ],
      1,
    );

    expect(payload.points.map((point) => point.joinedCount)).toEqual([25, 30]);
  });
});
