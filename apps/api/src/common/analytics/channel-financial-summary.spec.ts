import {
  effectiveCampaignActiveSubscribers,
  effectiveCampaignJoinedSubscribers,
  resolveChannelKpiLabel,
  resolveChannelKpiStatus,
} from './channel-financial-summary';

describe('channel-financial-summary', () => {
  it('uses the same joined formula for channel cards and channel detail', () => {
    expect(
      effectiveCampaignJoinedSubscribers({
        joinedCount: 23,
        newSubscribers: 23,
        inviteLinks: [{ joinedCount: 80 }, { joinedCount: 72 }],
      }),
    ).toBe(152);
  });

  it('falls back to campaign active subscribers before channel-level estimate', () => {
    expect(
      effectiveCampaignActiveSubscribers({
        cappedActiveSubscribersFromAd: 54,
        activeSubscribersFromAd: 40,
      }),
    ).toBe(54);
  });

  it('classifies KPI status with the same thresholds', () => {
    const status = resolveChannelKpiStatus({
      avgCpa: 0.79,
      targetCpaFrom: 0.3,
      targetCpa: 0.6,
      acceptableCpaFrom: 0.6,
      acceptableCpa: 1.2,
      stopCpaFrom: 1.2,
    });

    expect(status).toBe('acceptable');
    expect(resolveChannelKpiLabel(status)).toBe('Acceptable');
  });
});
