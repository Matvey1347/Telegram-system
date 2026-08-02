import { calculatePricing } from './domain/pricing';

describe('calculatePricing', () => {
  it('calculates CPM pricing with decimals', () => {
    const result = calculatePricing({
      expectedViews: 12500,
      pricingMode: 'CPM',
      targetCpm: 18.5,
      minimumCpm: 12.25,
    });

    expect(result.recommendedPrice.toFixed(2)).toBe('231.25');
    expect(result.minimumPrice.toFixed(2)).toBe('153.13');
  });

  it('keeps fixed pricing stable', () => {
    const result = calculatePricing({
      expectedViews: 1000,
      pricingMode: 'FIXED',
      fixedPrice: 200,
    });

    expect(result.recommendedPrice.toFixed(2)).toBe('200.00');
    expect(result.minimumPrice.toFixed(2)).toBe('200.00');
  });

  it('warns when manual override is below minimum', () => {
    const result = calculatePricing({
      expectedViews: 10000,
      pricingMode: 'MANUAL',
      targetCpm: 15,
      minimumCpm: 12,
      agreedPrice: 100,
    });

    expect(result.warnings).toContain('UNDER_MINIMUM_PRICE');
    expect(result.minimumPrice.toFixed(2)).toBe('120.00');
  });
});
