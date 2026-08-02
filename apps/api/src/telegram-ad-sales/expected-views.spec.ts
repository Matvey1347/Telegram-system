import { calculateExpectedViews } from './domain/expected-views';

describe('calculateExpectedViews', () => {
  const now = new Date('2026-07-31T12:00:00.000Z');

  it('uses bounded post sample when enough posts exist', () => {
    const result = calculateExpectedViews({
      now,
      posts: [1200, 1300, 1250, 1280, 1220].map((viewsCount, index) => ({
        postDate: new Date(now.getTime() - (index + 2) * 24 * 60 * 60 * 1000),
        viewsCount,
        manualOwnViews: 0,
        excludeFromAnalytics: false,
      })),
    });

    expect(result.expectedViews).toBeGreaterThanOrEqual(1200);
    expect(result.fallbackSource).toBe('POSTS');
  });

  it('filters outliers and excluded posts', () => {
    const result = calculateExpectedViews({
      now,
      posts: [
        { postDate: new Date('2026-07-20T00:00:00.000Z'), viewsCount: 1000, manualOwnViews: 0, excludeFromAnalytics: false },
        { postDate: new Date('2026-07-19T00:00:00.000Z'), viewsCount: 1100, manualOwnViews: 0, excludeFromAnalytics: false },
        { postDate: new Date('2026-07-18T00:00:00.000Z'), viewsCount: 9000, manualOwnViews: 0, excludeFromAnalytics: false },
        { postDate: new Date('2026-07-17T00:00:00.000Z'), viewsCount: 1200, manualOwnViews: 0, excludeFromAnalytics: true },
      ],
    });

    expect(result.expectedViews).toBeLessThan(5000);
    expect(result.postsSampleCount).toBe(3);
  });

  it('falls back to audience snapshot when posts are insufficient', () => {
    const result = calculateExpectedViews({
      now,
      posts: [],
      audienceSnapshot: {
        avgViewsAdjusted: 777,
        dataQuality: 'normal',
      },
    });

    expect(result.expectedViews).toBe(777);
    expect(result.fallbackSource).toBe('AUDIENCE_SNAPSHOT');
  });

  it('falls back to manual own views per post', () => {
    const result = calculateExpectedViews({
      now,
      posts: [],
      ownViewsPerPost: 555,
    });

    expect(result.expectedViews).toBe(555);
    expect(result.fallbackSource).toBe('OWN_VIEWS_PER_POST');
  });

  it('returns safe zero-compatible fallback', () => {
    const result = calculateExpectedViews({
      now,
      posts: [],
      currentSubscribersCount: 0,
    });

    expect(result.expectedViews).toBe(0);
    expect(result.fallbackSource).toBe('SAFE_VALUE');
  });

  it('uses raw post views when normalized sample collapses but real recent views exist', () => {
    const result = calculateExpectedViews({
      now,
      posts: [137, 185, 263, 265, 233, 213].map((viewsCount, index) => ({
        postDate: new Date(now.getTime() - (index + 2) * 24 * 60 * 60 * 1000),
        viewsCount,
        manualOwnViews: viewsCount,
        excludeFromAnalytics: false,
      })),
      currentSubscribersCount: 350,
    });

    expect(result.expectedViews).toBeGreaterThan(100);
    expect(result.fallbackSource).toBe('POSTS');
  });
});
