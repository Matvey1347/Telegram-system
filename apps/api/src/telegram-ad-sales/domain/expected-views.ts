export type ExpectedViewsInputPost = {
  postDate: Date;
  viewsCount: number | null;
  manualOwnViews: number;
  excludeFromAnalytics: boolean;
};

export type ExpectedViewsInput = {
  now?: Date;
  statisticsWindowDays?: number;
  freshnessGraceHours?: number;
  minPostsForPrimary?: number;
  anomalyMultiplier?: number;
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

export type ExpectedViewsResult = {
  expectedViews: number;
  averageViews: number | null;
  medianViews: number | null;
  adjustedViews: number | null;
  postsSampleCount: number;
  methodVersion: string;
  dataQuality: string;
  warnings: string[];
  fallbackSource: 'POSTS' | 'AUDIENCE_SNAPSHOT' | 'OWN_VIEWS_PER_POST' | 'SAFE_VALUE';
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

function trimmedMean(values: number[]) {
  if (!values.length) return null;
  if (values.length < 4) return average(values);
  const sorted = [...values].sort((a, b) => a - b);
  const trim = Math.max(1, Math.floor(sorted.length * 0.1));
  return average(sorted.slice(trim, sorted.length - trim));
}

export function calculateExpectedViews(
  input: ExpectedViewsInput,
): ExpectedViewsResult {
  const now = input.now ?? new Date();
  const statisticsWindowDays = input.statisticsWindowDays ?? 30;
  const freshnessGraceHours = input.freshnessGraceHours ?? 18;
  const minPostsForPrimary = input.minPostsForPrimary ?? 3;
  const anomalyMultiplier = input.anomalyMultiplier ?? 3;
  const warnings: string[] = [];
  const cutoff = new Date(
    now.getTime() - statisticsWindowDays * 24 * 60 * 60 * 1000,
  );
  const freshnessCutoff = new Date(
    now.getTime() - freshnessGraceHours * 60 * 60 * 1000,
  );
  const relevantViews = input.posts
    .filter((post) => !post.excludeFromAnalytics)
    .filter((post) => post.postDate >= cutoff)
    .filter((post) => post.postDate <= freshnessCutoff)
    .map((post) =>
      Math.max(
        0,
        Number(post.viewsCount ?? 0) - Math.max(0, Number(post.manualOwnViews ?? 0)),
      ),
    )
    .filter((value) => Number.isFinite(value));
  const rawViews = input.posts
    .filter((post) => !post.excludeFromAnalytics)
    .filter((post) => post.postDate >= cutoff)
    .filter((post) => post.postDate <= freshnessCutoff)
    .map((post) => Math.max(0, Number(post.viewsCount ?? 0)))
    .filter((value) => Number.isFinite(value));

  const rawMedian = median(relevantViews);
  const boundedViews =
    rawMedian == null
      ? relevantViews
      : relevantViews.filter((value) => value <= rawMedian * anomalyMultiplier || value <= 1);

  const avg = average(boundedViews);
  const med = median(boundedViews);
  const adjusted = trimmedMean(boundedViews);
  const rawPositiveViews = rawViews.filter((value) => value > 0);
  const rawAvg = average(rawPositiveViews);
  const rawMed = median(rawPositiveViews);
  const rawAdjusted = trimmedMean(rawPositiveViews);
  const shouldUseRawPostViews =
    rawPositiveViews.length >= minPostsForPrimary &&
    rawMed != null &&
    rawAdjusted != null &&
    (boundedViews.length < minPostsForPrimary ||
      (Math.max(...boundedViews, 0) === 0 && rawMed > 0));

  if (
    !shouldUseRawPostViews &&
    boundedViews.length >= minPostsForPrimary &&
    med != null &&
    adjusted != null
  ) {
    if (boundedViews.length < 5) warnings.push('INSUFFICIENT_POSTS_SAMPLE');
    return {
      expectedViews: Math.max(0, Math.round(Math.min(med, adjusted))),
      averageViews: avg,
      medianViews: med,
      adjustedViews: adjusted,
      postsSampleCount: boundedViews.length,
      methodVersion: 'expected-views.v1',
      dataQuality: boundedViews.length < 5 ? 'warning' : 'good',
      warnings,
      fallbackSource: 'POSTS',
    };
  }
  if (
    rawPositiveViews.length >= minPostsForPrimary &&
    rawMed != null &&
    rawAdjusted != null
  ) {
    warnings.push('FALLBACK_EXPECTED_VIEWS');
    warnings.push('INSUFFICIENT_POSTS_SAMPLE');
    return {
      expectedViews: Math.max(0, Math.round(Math.min(rawMed, rawAdjusted))),
      averageViews: rawAvg,
      medianViews: rawMed,
      adjustedViews: rawAdjusted,
      postsSampleCount: rawPositiveViews.length,
      methodVersion: 'expected-views.v1',
      dataQuality: 'warning',
      warnings,
      fallbackSource: 'POSTS',
    };
  }

  if (input.audienceSnapshot) {
    const audienceValue =
      input.audienceSnapshot.avgViewsAdjusted ??
      input.audienceSnapshot.activeSubscribersEstimate ??
      null;
    if (audienceValue != null && audienceValue >= 0) {
      warnings.push('FALLBACK_EXPECTED_VIEWS');
      return {
        expectedViews: Math.round(audienceValue),
        averageViews: avg,
        medianViews: med,
        adjustedViews: adjusted,
        postsSampleCount: boundedViews.length,
        methodVersion: 'expected-views.v1',
        dataQuality: input.audienceSnapshot.dataQuality ?? 'warning',
        warnings,
        fallbackSource: 'AUDIENCE_SNAPSHOT',
      };
    }
  }

  if (Number(input.ownViewsPerPost ?? 0) > 0) {
    warnings.push('FALLBACK_EXPECTED_VIEWS');
    return {
      expectedViews: Math.round(Number(input.ownViewsPerPost ?? 0)),
      averageViews: avg,
      medianViews: med,
      adjustedViews: adjusted,
      postsSampleCount: boundedViews.length,
      methodVersion: 'expected-views.v1',
      dataQuality: 'warning',
      warnings,
      fallbackSource: 'OWN_VIEWS_PER_POST',
    };
  }

  warnings.push('FALLBACK_EXPECTED_VIEWS');
  warnings.push('LOW_DATA_QUALITY');
  const safeValue = Math.max(
    0,
    Math.round(Number(input.currentSubscribersCount ?? 0) * 0.1),
  );
  return {
    expectedViews: safeValue,
    averageViews: avg,
    medianViews: med,
    adjustedViews: adjusted,
    postsSampleCount: boundedViews.length,
    methodVersion: 'expected-views.v1',
    dataQuality: 'poor',
    warnings,
    fallbackSource: 'SAFE_VALUE',
  };
}
