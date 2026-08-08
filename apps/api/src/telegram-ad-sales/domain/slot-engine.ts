import { zonedDateTimeToUtc } from './timezone';

export type SlotEnginePolicy = {
  timezone: string;
  slotStrategy: 'BEFORE_ORGANIC_POST' | 'FIXED_TIMES' | 'MANUAL';
  fallbackSlotTimes: string[];
  allowManualSlots: boolean;
  organicPostsPerAdSlot: number;
  maxAdsPerDay: number;
  minHoursBetweenAds: number;
  minDaysBetweenAds: number;
};

export type SlotEngineProduct = {
  id: string | null;
  topDurationMinutes: number | null;
  currency: string;
  expectedViews: number;
  recommendedPrice: string;
  minimumPrice: string;
};

export type SlotEnginePlacement = {
  id: string;
  saleId: string;
  status: string;
  scheduledAt: Date;
};

export type SlotEngineInput = {
  now: Date;
  dateKey: string;
  policy: SlotEnginePolicy;
  product: SlotEngineProduct;
  organicTimes: string[];
  organicScheduledAt: Date[];
  placements: SlotEnginePlacement[];
};

export type SlotEngineSlot = {
  channelId?: string;
  date: string;
  scheduledAt: Date;
  timezone: string;
  source: string;
  state:
    | 'AVAILABLE'
    | 'RESERVED'
    | 'SOLD'
    | 'BLOCKED_BY_POLICY'
    | 'CONFLICT_WITH_ORGANIC_POST'
    | 'CONFLICT_WITH_AD'
    | 'MANUAL_ONLY'
    | 'PAST';
  blockingReason: string | null;
  nextOrganicPostAt: Date | null;
  productId: string | null;
  expectedViews: number;
  recommendedPrice: string;
  minimumPrice: string;
  currency: string;
  existingPlacement: {
    id: string;
    saleId: string;
    status: string;
  } | null;
  organicPostsCountForDay: number;
  adsCountForDay: number;
};

function hoursBetween(left: Date, right: Date) {
  return Math.abs(left.getTime() - right.getTime()) / (60 * 60 * 1000);
}

function daysBetween(left: Date, right: Date) {
  return Math.abs(left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000);
}

export function buildAvailabilitySlots(input: SlotEngineInput): SlotEngineSlot[] {
  if (input.policy.slotStrategy === 'MANUAL') {
    return [
      {
        date: input.dateKey,
        scheduledAt: zonedDateTimeToUtc(input.dateKey, '00:00', input.policy.timezone),
        timezone: input.policy.timezone,
        source: 'manual',
        state: 'MANUAL_ONLY',
        blockingReason: 'manual_only',
        nextOrganicPostAt: null,
        productId: input.product.id,
        expectedViews: input.product.expectedViews,
        recommendedPrice: input.product.recommendedPrice,
        minimumPrice: input.product.minimumPrice,
        currency: input.product.currency,
        existingPlacement: null,
        organicPostsCountForDay: input.organicScheduledAt.length,
        adsCountForDay: input.placements.length,
      },
    ];
  }

  const organicCadence = Math.max(1, Number(input.policy.organicPostsPerAdSlot || 1));
  const organicCandidateTimes =
    organicCadence > 1
      ? input.organicTimes.filter((_, index) => (index + 1) % organicCadence === 0)
      : input.organicTimes;
  const candidateTimes =
    input.policy.slotStrategy === 'FIXED_TIMES'
      ? input.policy.fallbackSlotTimes
      : organicCandidateTimes.map((time) => {
          const [hour, minute] = time.split(':').map(Number);
          const shifted = new Date(Date.UTC(2000, 0, 1, hour, minute, 0));
          shifted.setUTCMinutes(
            shifted.getUTCMinutes() - Number(input.product.topDurationMinutes ?? 0),
          );
          return `${shifted.getUTCHours().toString().padStart(2, '0')}:${shifted
            .getUTCMinutes()
            .toString()
            .padStart(2, '0')}`;
        });
  const candidateScheduledTimes = candidateTimes.map((time) =>
    zonedDateTimeToUtc(input.dateKey, time, input.policy.timezone).getTime(),
  );
  const candidateScheduledTimeSet = new Set(candidateScheduledTimes);
  const exactPlacementsByTime = new Map(
    input.placements.map((placement) => [
      placement.scheduledAt.getTime(),
      placement,
    ]),
  );
  const fallbackPlacements = [...input.placements]
    .filter(
      (placement) =>
        !candidateScheduledTimeSet.has(placement.scheduledAt.getTime()),
    )
    .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime());
  let fallbackPlacementIndex = 0;

  return candidateTimes.map((time, index) => {
    const scheduledAt = zonedDateTimeToUtc(input.dateKey, time, input.policy.timezone);
    const nextOrganicPostAt =
      input.organicScheduledAt
        .filter((value) => value.getTime() >= scheduledAt.getTime())
        .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
    const existingPlacement =
      exactPlacementsByTime.get(scheduledAt.getTime()) ??
      fallbackPlacements[fallbackPlacementIndex++] ??
      null;
    const blockingByHours = input.placements.some(
      (placement) =>
        hoursBetween(placement.scheduledAt, scheduledAt) <
        input.policy.minHoursBetweenAds,
    );
    const blockingByDays = input.placements.some(
      (placement) =>
        daysBetween(placement.scheduledAt, scheduledAt) <
        input.policy.minDaysBetweenAds,
    );

    let state: SlotEngineSlot['state'] = 'AVAILABLE';
    let blockingReason: string | null = null;
    if (existingPlacement) {
      state =
        existingPlacement.status === 'RESERVED' ? 'RESERVED' : 'SOLD';
      blockingReason = 'existing_placement';
    } else if (scheduledAt.getTime() <= input.now.getTime()) {
      state = 'PAST';
      blockingReason = 'past';
    } else if (
      input.policy.maxAdsPerDay >= 0 &&
      input.placements.length >= input.policy.maxAdsPerDay
    ) {
      state = 'BLOCKED_BY_POLICY';
      blockingReason = 'max_ads_per_day';
    } else if (blockingByHours || blockingByDays) {
      state = 'BLOCKED_BY_POLICY';
      blockingReason = blockingByHours
        ? 'min_hours_between_ads'
        : 'min_days_between_ads';
    } else if (
      nextOrganicPostAt &&
      Number(input.product.topDurationMinutes ?? 0) > 0 &&
      scheduledAt.getTime() +
        Number(input.product.topDurationMinutes ?? 0) * 60 * 1000 >
        nextOrganicPostAt.getTime()
    ) {
      state = 'CONFLICT_WITH_ORGANIC_POST';
      blockingReason = 'top_duration_overlaps_organic_post';
    }

    return {
      date: input.dateKey,
      scheduledAt,
      timezone: input.policy.timezone,
      source:
        input.policy.slotStrategy === 'FIXED_TIMES' ? 'fixed_time' : `organic_${index}`,
      state,
      blockingReason,
      nextOrganicPostAt,
      productId: input.product.id,
      expectedViews: input.product.expectedViews,
      recommendedPrice: input.product.recommendedPrice,
      minimumPrice: input.product.minimumPrice,
      currency: input.product.currency,
      existingPlacement: existingPlacement
        ? {
            id: existingPlacement.id,
            saleId: existingPlacement.saleId,
            status: existingPlacement.status,
          }
        : null,
      organicPostsCountForDay: input.organicScheduledAt.length,
      adsCountForDay: input.placements.length,
    };
  });
}
