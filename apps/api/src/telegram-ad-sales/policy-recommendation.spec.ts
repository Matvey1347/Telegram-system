import { recommendPolicyFromOrganicPosts } from './domain/policy-recommendation';

describe('recommendPolicyFromOrganicPosts', () => {
  it('recommends one ad every 3 days for up to 3 organic posts', () => {
    expect(recommendPolicyFromOrganicPosts(3)).toEqual({
      expectedOrganicPostsPerDay: 3,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 1,
      minDaysBetweenAds: 3,
      minHoursBetweenAds: 72,
    });
  });

  it('recommends one ad every 2 days for 4-5 organic posts', () => {
    expect(recommendPolicyFromOrganicPosts(4.5).minDaysBetweenAds).toBe(2);
  });

  it('recommends daily ads for 6+ organic posts', () => {
    expect(recommendPolicyFromOrganicPosts(6).minHoursBetweenAds).toBe(24);
  });
});
