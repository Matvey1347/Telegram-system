import { buildAvailabilitySlots } from './domain/slot-engine';

describe('buildAvailabilitySlots', () => {
  const base = {
    now: new Date('2026-07-31T08:00:00.000Z'),
    dateKey: '2026-08-02',
    policy: {
      timezone: 'Europe/Warsaw',
      slotStrategy: 'BEFORE_ORGANIC_POST' as const,
      fallbackSlotTimes: [],
      allowManualSlots: false,
      organicPostsPerAdSlot: 1,
      maxAdsPerDay: 1,
      minHoursBetweenAds: 24,
      minDaysBetweenAds: 1,
    },
    product: {
      id: 'prod-1',
      topDurationMinutes: 60,
      currency: 'USD',
      expectedViews: 1000,
      recommendedPrice: '15.00',
      minimumPrice: '12.00',
    },
  };

  it('creates a slot before an organic post', () => {
    const result = buildAvailabilitySlots({
      ...base,
      organicTimes: ['19:15'],
      organicScheduledAt: [new Date('2026-08-02T17:15:00.000Z')],
      placements: [],
    });

    expect(result[0].state).toBe('AVAILABLE');
  });

  it('marks manual-only policies correctly', () => {
    const result = buildAvailabilitySlots({
      ...base,
      policy: { ...base.policy, slotStrategy: 'MANUAL', allowManualSlots: true },
      organicTimes: [],
      organicScheduledAt: [],
      placements: [],
    });

    expect(result[0].state).toBe('MANUAL_ONLY');
  });

  it('blocks conflicting reserved ads', () => {
    const result = buildAvailabilitySlots({
      ...base,
      organicTimes: ['19:15'],
      organicScheduledAt: [new Date('2026-08-02T17:15:00.000Z')],
      placements: [
        {
          id: 'placement-1',
          saleId: 'sale-1',
          status: 'RESERVED',
          scheduledAt: new Date('2026-08-02T16:15:00.000Z'),
        },
      ],
    });

    expect(['RESERVED', 'BLOCKED_BY_POLICY', 'SOLD']).toContain(result[0].state);
  });

  it('keeps existing past placements sold instead of marking them as unused past slots', () => {
    const result = buildAvailabilitySlots({
      ...base,
      now: new Date('2026-08-03T08:00:00.000Z'),
      organicTimes: ['19:15'],
      organicScheduledAt: [new Date('2026-08-02T17:15:00.000Z')],
      placements: [
        {
          id: 'placement-1',
          saleId: 'sale-1',
          status: 'PUBLISHED',
          scheduledAt: new Date('2026-08-02T16:15:00.000Z'),
        },
      ],
    });

    expect(result[0].state).toBe('SOLD');
  });

  it('matches same-day placements to generated slots when the exact scheduled time differs', () => {
    const result = buildAvailabilitySlots({
      ...base,
      now: new Date('2026-08-03T08:00:00.000Z'),
      organicTimes: ['19:15'],
      organicScheduledAt: [new Date('2026-08-02T17:15:00.000Z')],
      placements: [
        {
          id: 'placement-1',
          saleId: 'sale-1',
          status: 'PUBLISHED',
          scheduledAt: new Date('2026-08-02T09:00:00.000Z'),
        },
      ],
    });

    expect(result[0].state).toBe('SOLD');
    expect(result[0].existingPlacement?.id).toBe('placement-1');
  });

  it('creates no ad slots when there are no organic posts for before-organic strategy', () => {
    const result = buildAvailabilitySlots({
      ...base,
      organicTimes: [],
      organicScheduledAt: [],
      placements: [],
    });

    expect(result).toEqual([]);
  });

  it('respects organic posts per ad slot cadence', () => {
    const result = buildAvailabilitySlots({
      ...base,
      policy: { ...base.policy, organicPostsPerAdSlot: 3 },
      organicTimes: ['08:00', '14:00', '20:00', '22:00'],
      organicScheduledAt: [
        new Date('2026-08-02T06:00:00.000Z'),
        new Date('2026-08-02T12:00:00.000Z'),
        new Date('2026-08-02T18:00:00.000Z'),
        new Date('2026-08-02T20:00:00.000Z'),
      ],
      placements: [],
    });

    expect(result).toHaveLength(1);
  });
});
