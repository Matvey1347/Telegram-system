export type DataQuality =
  | 'normal'
  | 'borderline'
  | 'suspicious'
  | 'anomalous'
  | 'invalid';

export type SubscriberBaseQuality =
  | 'normal'
  | 'suspicious'
  | 'polluted'
  | 'invalid';

const dataQualityRank: Record<DataQuality, number> = {
  normal: 0,
  borderline: 1,
  suspicious: 2,
  anomalous: 3,
  invalid: 4,
};

const subscriberBaseQualityRank: Record<SubscriberBaseQuality, number> = {
  normal: 0,
  suspicious: 1,
  polluted: 2,
  invalid: 3,
};

export function maxDataQuality(a: DataQuality, b: DataQuality) {
  return dataQualityRank[a] >= dataQualityRank[b] ? a : b;
}

export function maxSubscriberBaseQuality(
  a: SubscriberBaseQuality,
  b: SubscriberBaseQuality,
) {
  return subscriberBaseQualityRank[a] >= subscriberBaseQualityRank[b] ? a : b;
}

export function calculateEffectiveSubscribers(input: {
  totalSubscribers: number | null;
  knownFakeSubscribersCount: number;
  manualSubscriberBaseQuality?: string | null;
}) {
  const totalSubscribers = input.totalSubscribers;
  const knownFakeSubscribersCount = Math.max(0, input.knownFakeSubscribersCount || 0);
  const effectiveSubscribers =
    totalSubscribers == null
      ? null
      : Math.max(0, totalSubscribers - knownFakeSubscribersCount);

  let subscriberBaseQuality: SubscriberBaseQuality = 'normal';
  if (effectiveSubscribers === 0 && knownFakeSubscribersCount > 0) {
    subscriberBaseQuality = 'invalid';
  } else if (knownFakeSubscribersCount > 0) {
    subscriberBaseQuality = 'polluted';
  }

  const manualQuality = normalizeSubscriberBaseQuality(
    input.manualSubscriberBaseQuality,
  );
  if (manualQuality) {
    subscriberBaseQuality = maxSubscriberBaseQuality(
      subscriberBaseQuality,
      manualQuality,
    );
  }

  return {
    effectiveSubscribers,
    subscriberBaseQuality,
    hasSubscriberBasePollution:
      subscriberBaseQuality === 'polluted' ||
      subscriberBaseQuality === 'invalid' ||
      subscriberBaseQuality === 'suspicious',
  };
}

export function classifyViewRate(rawViewRate: number | null) {
  if (rawViewRate == null || !Number.isFinite(rawViewRate)) {
    return {
      dataQuality: 'invalid' as DataQuality,
      hasExternalTrafficAnomaly: false,
      reason: 'missing_subscribers_or_views',
    };
  }
  if (rawViewRate <= 80) {
    return {
      dataQuality: 'normal' as DataQuality,
      hasExternalTrafficAnomaly: false,
      reason: 'views_within_normal_range',
    };
  }
  if (rawViewRate <= 120) {
    return {
      dataQuality: 'borderline' as DataQuality,
      hasExternalTrafficAnomaly: false,
      reason: 'views_close_to_subscribers_limit',
    };
  }
  if (rawViewRate <= 200) {
    return {
      dataQuality: 'suspicious' as DataQuality,
      hasExternalTrafficAnomaly: true,
      reason: 'views_exceed_subscribers',
    };
  }
  return {
    dataQuality: 'anomalous' as DataQuality,
    hasExternalTrafficAnomaly: true,
    reason: 'views_strongly_exceed_subscribers',
  };
}

export function buildDataQualityWarning(
  dataQuality: DataQuality,
  reason?: string | null,
) {
  if (dataQuality === 'normal') return null;
  if (dataQuality === 'borderline') {
    return 'Views are close to subscriber count. Metrics may be less stable.';
  }
  if (dataQuality === 'suspicious') {
    if (reason === 'views_uplift_without_new_subscribers') {
      return 'Views increased without new subscribers. Metrics may be distorted and should be checked before scaling.';
    }
    return 'Views exceed subscribers. Metrics may be distorted by external traffic, reposts, viral reach, or view manipulation.';
  }
  if (dataQuality === 'anomalous') {
    return 'Views strongly exceed subscribers. Active subscriber metrics are capped and should not be treated as precise.';
  }
  return 'Not enough valid data to calculate subscriber-based metrics.';
}

function normalizeSubscriberBaseQuality(
  value?: string | null,
): SubscriberBaseQuality | null {
  if (
    value === 'normal' ||
    value === 'suspicious' ||
    value === 'polluted' ||
    value === 'invalid'
  ) {
    return value;
  }
  return null;
}
