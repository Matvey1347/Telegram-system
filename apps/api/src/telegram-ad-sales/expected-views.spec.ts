import { calculateExpectedViews } from './domain/expected-views';

describe('calculateExpectedViews', () => {
  const now = new Date('2026-08-02T12:00:00.000Z');

  it('uses raw TelegramPost views without subtracting manual own views', () => {
    const result = calculateExpectedViews({
      now,
      posts: [139, 186, 264, 265, 233, 213].map((viewsCount, index) => ({
        id: `post-${index}`,
        postDate: new Date(now.getTime() - (index + 1) * 24 * 60 * 60 * 1000),
        viewsCount,
        manualOwnViews: viewsCount,
        excludeFromAnalytics: false,
      })),
    });

    expect(result.methodVersion).toBe('expected-views.v3-raw-posts');
    expect(result.expectedViews).toBe(186);
    expect(result.fallbackSource).toBe('POSTS');
    expect(result.dataQuality).toBe('READY');
  });

  it('does not fall back to audience or safe values when posts are insufficient', () => {
    const result = calculateExpectedViews({
      now,
      posts: [],
      currentSubscribersCount: 10000,
      ownViewsPerPost: 555,
      audienceSnapshot: {
        avgViewsAdjusted: 777,
        dataQuality: 'good',
      },
    });

    expect(result.expectedViews).toBeNull();
    expect(result.fallbackSource).toBe('NONE');
    expect(result.dataQuality).toBe('NOT_ENOUGH_DATA');
  });

  it('excludes analytics-disabled and ad placement posts from the sample', () => {
    const result = calculateExpectedViews({
      now,
      minPostsForPrimary: 2,
      posts: [
        { id: 'organic-1', postDate: new Date('2026-08-01T00:00:00.000Z'), viewsCount: 100, excludeFromAnalytics: false },
        { id: 'ad', postDate: new Date('2026-07-31T00:00:00.000Z'), viewsCount: 10000, excludeFromAnalytics: false, adPlacementLinked: true },
        { id: 'excluded', postDate: new Date('2026-07-30T00:00:00.000Z'), viewsCount: 9000, excludeFromAnalytics: true },
        { id: 'organic-2', postDate: new Date('2026-07-29T00:00:00.000Z'), viewsCount: 200, excludeFromAnalytics: false },
      ],
    });

    expect(result.expectedViews).toBe(150);
    expect(result.postsSampleCount).toBe(2);
    expect(result.sample.filter((item) => item.included)).toHaveLength(2);
  });

  it('uses only the 3 most recent valid posts for the sample', () => {
    const result = calculateExpectedViews({
      now,
      posts: [
        { id: 'post-1', postDate: new Date('2026-08-01T00:00:00.000Z'), viewsCount: 100, excludeFromAnalytics: false },
        { id: 'post-2', postDate: new Date('2026-07-31T00:00:00.000Z'), viewsCount: 200, excludeFromAnalytics: false },
        { id: 'post-3', postDate: new Date('2026-07-30T00:00:00.000Z'), viewsCount: 300, excludeFromAnalytics: false },
        { id: 'post-4', postDate: new Date('2026-07-29T00:00:00.000Z'), viewsCount: 900, excludeFromAnalytics: false },
      ],
    });

    expect(result.postsSampleCount).toBe(3);
    expect(result.expectedViews).toBe(200);
    expect(
      result.sample.find((item) => item.postId === 'post-4'),
    ).toMatchObject({
      included: false,
      reason: 'older_than_recent_sample',
    });
  });
});
