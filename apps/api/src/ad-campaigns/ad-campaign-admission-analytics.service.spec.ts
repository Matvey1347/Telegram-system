import {
  AdCampaignAdmissionDetectionMode,
  AdCampaignAdmissionTimeBoundarySource,
} from '@prisma/client';
import { AdCampaignAdmissionAnalyticsService } from './ad-campaign-admission-analytics.service';

const date = (value: string) => new Date(value);

function service() {
  return new AdCampaignAdmissionAnalyticsService({} as any) as any;
}

function campaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 'campaign-1',
    telegramChannelId: 'channel-1',
    startedAt: null,
    placementDate: date('2026-01-01T00:00:00.000Z'),
    createdAt: date('2026-01-01T00:00:00.000Z'),
    inviteLinks: [
      {
        id: 'link-1',
        url: 'https://t.me/+one',
        createsJoinRequest: true,
        createdAt: date('2026-01-01T00:00:00.000Z'),
        telegramCreatedAt: null,
      },
    ],
    ...overrides,
  };
}

describe('AdCampaignAdmissionAnalyticsService detection', () => {
  it('does not create a batch for the first zero snapshot', () => {
    const events = service().detectEventsForCampaign({
      campaign: campaign(),
      snapshots: [
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-02T00:00:00.000Z'),
          joinedCount: 0,
          requestedCount: 100,
        },
      ],
    });

    expect(events).toHaveLength(0);
  });

  it('creates a bootstrapped cumulative batch for first joined snapshot', () => {
    const events = service().detectEventsForCampaign({
      campaign: campaign(),
      snapshots: [
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-02T00:00:00.000Z'),
          joinedCount: 500,
          requestedCount: 0,
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0].detectionMode).toBe(
      AdCampaignAdmissionDetectionMode.BOOTSTRAPPED_CUMULATIVE,
    );
    expect(events[0].sourceLinks[0].joinedDelta).toBe(500);
    expect(events[0].analysisStartedAt).toEqual(date('2026-01-01T00:00:00.000Z'));
    expect(events[0].timeBoundarySource).toBe(
      AdCampaignAdmissionTimeBoundarySource.CAMPAIGN_START,
    );
  });

  it('restores historical positive joined deltas as exact batches', () => {
    const events = service().detectEventsForCampaign({
      campaign: campaign(),
      snapshots: [
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-01T00:00:00.000Z'),
          joinedCount: 0,
          requestedCount: 500,
        },
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-02T00:00:00.000Z'),
          joinedCount: 500,
          requestedCount: 50,
        },
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-03T00:00:00.000Z'),
          joinedCount: 700,
          requestedCount: 20,
        },
      ],
    });

    expect(events.map((event: any) => event.detectionMode)).toEqual([
      AdCampaignAdmissionDetectionMode.EXACT_DELTA,
      AdCampaignAdmissionDetectionMode.EXACT_DELTA,
    ]);
    expect(events.map((event: any) => event.sourceLinks[0].joinedDelta)).toEqual([
      500,
      200,
    ]);
  });

  it('uses joined delta rather than requested-count drop', () => {
    const events = service().detectEventsForCampaign({
      campaign: campaign(),
      snapshots: [
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-01T00:00:00.000Z'),
          joinedCount: 0,
          requestedCount: 500,
        },
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-02T00:00:00.000Z'),
          joinedCount: 500,
          requestedCount: 50,
        },
      ],
    });

    expect(events[0].sourceLinks[0].joinedDelta).toBe(500);
  });

  it('does not create a batch for requested-count decrease only', () => {
    const events = service().detectEventsForCampaign({
      campaign: campaign(),
      snapshots: [
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-01T00:00:00.000Z'),
          joinedCount: 0,
          requestedCount: 500,
        },
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-02T00:00:00.000Z'),
          joinedCount: 0,
          requestedCount: 50,
        },
      ],
    });

    expect(events).toHaveLength(0);
  });

  it('ignores joined growth on a normal link without prior requests', () => {
    const events = service().detectEventsForCampaign({
      campaign: campaign({
        inviteLinks: [
          {
            id: 'link-1',
            url: 'https://t.me/+normal',
            createsJoinRequest: false,
            createdAt: date('2026-01-01T00:00:00.000Z'),
            telegramCreatedAt: null,
          },
        ],
      }),
      snapshots: [
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-01T00:00:00.000Z'),
          joinedCount: 0,
          requestedCount: 0,
        },
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-02T00:00:00.000Z'),
          joinedCount: 10,
          requestedCount: 0,
        },
      ],
    });

    expect(events).toHaveLength(0);
  });

  it('aggregates multiple invite links observed in one sync into one batch', () => {
    const events = service().detectEventsForCampaign({
      campaign: campaign({
        inviteLinks: [
          {
            id: 'link-1',
            url: 'https://t.me/+one',
            createsJoinRequest: true,
            createdAt: date('2026-01-01T00:00:00.000Z'),
            telegramCreatedAt: null,
          },
          {
            id: 'link-2',
            url: 'https://t.me/+two',
            createsJoinRequest: true,
            createdAt: date('2026-01-01T00:00:00.000Z'),
            telegramCreatedAt: null,
          },
        ],
      }),
      snapshots: [
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-01T00:00:00.000Z'),
          joinedCount: 0,
          requestedCount: 100,
        },
        {
          inviteLinkId: 'link-2',
          syncedAt: date('2026-01-01T00:00:00.000Z'),
          joinedCount: 0,
          requestedCount: 100,
        },
        {
          inviteLinkId: 'link-1',
          syncedAt: date('2026-01-02T00:00:00.000Z'),
          joinedCount: 60,
          requestedCount: 0,
        },
        {
          inviteLinkId: 'link-2',
          syncedAt: date('2026-01-02T00:00:00.000Z'),
          joinedCount: 40,
          requestedCount: 0,
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(
      events[0].sourceLinks.reduce(
        (sum: number, link: { joinedDelta: number }) => sum + link.joinedDelta,
        0,
      ),
    ).toBe(100);
  });

  it('splits one shared view uplift window proportionally by released subscribers', () => {
    const analytics = service();
    const rawWindowViewsUplift = 88;
    const first = analytics.attributeWindowViewsUplift({
      rawWindowViewsUplift,
      releasedSubscribersCount: 137,
      windowReleasedSubscribers: 137 + 187,
    });
    const second = analytics.attributeWindowViewsUplift({
      rawWindowViewsUplift,
      releasedSubscribersCount: 187,
      windowReleasedSubscribers: 137 + 187,
    });

    expect(first).toBeCloseTo(37.21, 2);
    expect(second).toBeCloseTo(50.79, 2);
    expect(first + second).toBeCloseTo(rawWindowViewsUplift, 2);
  });
});
