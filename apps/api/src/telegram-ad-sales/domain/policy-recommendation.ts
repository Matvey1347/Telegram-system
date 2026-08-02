export type RecommendedPolicy = {
  expectedOrganicPostsPerDay: number;
  organicPostsPerAdSlot: number;
  maxAdsPerDay: number;
  minDaysBetweenAds: number;
  minHoursBetweenAds: number;
};

export function recommendPolicyFromOrganicPosts(
  expectedOrganicPostsPerDay: number,
): RecommendedPolicy {
  if (expectedOrganicPostsPerDay <= 3) {
    return {
      expectedOrganicPostsPerDay,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 1,
      minDaysBetweenAds: 3,
      minHoursBetweenAds: 72,
    };
  }
  if (expectedOrganicPostsPerDay <= 5) {
    return {
      expectedOrganicPostsPerDay,
      organicPostsPerAdSlot: 3,
      maxAdsPerDay: 1,
      minDaysBetweenAds: 2,
      minHoursBetweenAds: 48,
    };
  }
  return {
    expectedOrganicPostsPerDay,
    organicPostsPerAdSlot: 3,
    maxAdsPerDay: 1,
    minDaysBetweenAds: 1,
    minHoursBetweenAds: 24,
  };
}
