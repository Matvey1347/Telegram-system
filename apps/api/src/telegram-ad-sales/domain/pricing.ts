import { Prisma } from '@prisma/client';
import { decimal } from './decimal';

export type PricingCalculationInput = {
  expectedViews: number;
  pricingMode: 'CPM' | 'FIXED' | 'MANUAL';
  targetCpm?: Prisma.Decimal.Value | null;
  minimumCpm?: Prisma.Decimal.Value | null;
  fixedPrice?: Prisma.Decimal.Value | null;
  agreedPrice?: Prisma.Decimal.Value | null;
};

export type PricingCalculationResult = {
  recommendedPrice: Prisma.Decimal;
  minimumPrice: Prisma.Decimal;
  targetCpm: Prisma.Decimal;
  warnings: string[];
};

export function calculatePricing(input: PricingCalculationInput): PricingCalculationResult {
  const warnings: string[] = [];
  const expectedViews = decimal(Math.max(0, input.expectedViews));
  const thousand = decimal(1000);
  const targetCpm =
    input.pricingMode === 'FIXED'
      ? decimal(0)
      : decimal(input.targetCpm ?? input.minimumCpm ?? 0);
  const minimumCpm = decimal(input.minimumCpm ?? input.targetCpm ?? 0);

  let recommendedPrice =
    input.pricingMode === 'FIXED'
      ? decimal(input.fixedPrice ?? 0)
      : expectedViews.div(thousand).mul(targetCpm);
  const minimumPrice =
    input.pricingMode === 'FIXED'
      ? decimal(input.fixedPrice ?? 0)
      : expectedViews.div(thousand).mul(minimumCpm);

  if (input.pricingMode === 'MANUAL' && input.agreedPrice != null) {
    recommendedPrice =
      input.targetCpm != null
        ? expectedViews.div(thousand).mul(decimal(input.targetCpm))
        : decimal(input.agreedPrice);
    if (decimal(input.agreedPrice).lt(minimumPrice)) {
      warnings.push('UNDER_MINIMUM_PRICE');
    }
  }

  return {
    recommendedPrice: recommendedPrice.toDecimalPlaces(2),
    minimumPrice: minimumPrice.toDecimalPlaces(2),
    targetCpm: targetCpm.toDecimalPlaces(2),
    warnings,
  };
}
