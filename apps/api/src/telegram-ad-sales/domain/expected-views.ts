export type ExpectedViewsInputPost = {
  id?: string;
  postDate: Date;
  viewsCount: number | null;
  manualOwnViews?: number | null;
  excludeFromAnalytics: boolean;
  adPlacementLinked?: boolean;
};

export type ExpectedViewsInput = {
  now?: Date;
  statisticsWindowDays?: number;
  minPostsForPrimary?: number;
  maxPostsForPrimary?: number;
  posts: ExpectedViewsInputPost[];
  currentSubscribersCount?: number | null;
  ownViewsPerPost?: number | null;
  audienceSnapshot?: {
    activeSubscribersEstimate?: number | null;
    avgViewsAdjusted?: number | null;
    dataQuality?: string | null;
    collectedAt?: Date | null;
  } | null;
};

export type ExpectedViewsSampleItem = {
  postId: string | null;
  date: Date;
  rawViews: number | null;
  included: boolean;
  reason: string | null;
};

export type ExpectedViewsResult = {
  expectedViews: number | null;
  averageViews: number | null;
  medianViews: number | null;
  adjustedViews: number | null;
  postsSampleCount: number;
  methodVersion: string;
  dataQuality: 'READY' | 'NOT_ENOUGH_DATA';
  warnings: string[];
  fallbackSource: 'POSTS' | 'NONE';
  sample: ExpectedViewsSampleItem[];
};

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateExpectedViews(input: ExpectedViewsInput): ExpectedViewsResult {
  const now = input.now ?? new Date();
  const statisticsWindowDays = input.statisticsWindowDays ?? 50;
  const minPostsForPrimary = input.minPostsForPrimary ?? 3;
  const maxPostsForPrimary = input.maxPostsForPrimary ?? 3;
  const cutoff = new Date(now.getTime() - statisticsWindowDays * 24 * 60 * 60 * 1000);

  const baseSample = input.posts.map((post) => {
    const rawViews = post.viewsCount == null ? null : Math.max(0, Number(post.viewsCount));
    let reason: string | null = null;
    if (post.excludeFromAnalytics) reason = 'excluded_from_analytics';
    else if (post.adPlacementLinked) reason = 'ad_placement';
    else if (post.postDate < cutoff) reason = 'outside_window';
    else if (post.postDate > now) reason = 'future_post';
    else if (rawViews == null || !Number.isFinite(rawViews) || rawViews <= 0) reason = 'missing_raw_views';
    return {
      postId: post.id ?? null,
      date: post.postDate,
      rawViews,
      included: reason == null,
      reason,
    };
  });

  const includedCandidates = baseSample
    .filter((item) => item.included)
    .sort((left, right) => right.date.getTime() - left.date.getTime());
  const selectedPostIds = new Set(
    includedCandidates.slice(0, maxPostsForPrimary).map((item) => item.postId),
  );
  const sample = baseSample.map((item) => {
    if (!item.included) return item;
    if (selectedPostIds.has(item.postId)) return item;
    return {
      ...item,
      included: false,
      reason: 'older_than_recent_sample',
    };
  });

  const includedViews = sample
    .filter((item) => item.included)
    .map((item) => item.rawViews)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const avg = average(includedViews);
  const med = median(includedViews);

  if (includedViews.length < minPostsForPrimary || med == null) {
    return {
      expectedViews: null,
      averageViews: avg,
      medianViews: med,
      adjustedViews: med,
      postsSampleCount: includedViews.length,
      methodVersion: 'expected-views.v3-raw-posts',
      dataQuality: 'NOT_ENOUGH_DATA',
      warnings: ['INSUFFICIENT_POSTS_SAMPLE'],
      fallbackSource: 'NONE',
      sample,
    };
  }

  return {
    expectedViews: Math.max(0, Math.round(med)),
    averageViews: avg,
    medianViews: med,
    adjustedViews: med,
    postsSampleCount: includedViews.length,
    methodVersion: 'expected-views.v3-raw-posts',
    dataQuality: 'READY',
    warnings: includedViews.length < 5 ? ['INSUFFICIENT_POSTS_SAMPLE'] : [],
    fallbackSource: 'POSTS',
    sample,
  };
}
