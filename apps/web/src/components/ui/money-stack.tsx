import type { CurrencySettings, ExchangeRate } from '@/lib/api';
import { formatMoney, getMoneyVariants } from '@/lib/money';

type MoneyStackProps = {
  amount: number | string | null | undefined;
  currency: string | null | undefined;
  settings?: Pick<CurrencySettings, 'primaryCurrency' | 'secondaryCurrency' | 'currencyDisplayMode'> | null;
  rates?: ExchangeRate[];
  amountInPrimary?: number | string | null;
  className?: string;
  mainClassName?: string;
  subClassName?: string;
  approximate?: boolean;
};

export function MoneyStack({
  amount,
  currency,
  settings,
  rates,
  amountInPrimary,
  className = '',
  mainClassName = 'text-2xl font-semibold text-white',
  subClassName = 'text-sm text-neutral-400',
  approximate = true,
}: MoneyStackProps) {
  const displayMode = settings?.currencyDisplayMode ?? 'code';
  const variants = getMoneyVariants({
    amount,
    currency,
    settings,
    rates,
    amountInPrimary,
  });

  return (
    <div className={className}>
      <div className={mainClassName}>{formatMoney(amount, currency, displayMode)}</div>
      {variants.length ? (
        <div className={subClassName}>
          {variants.map((variant) => (
            <div key={variant.currency}>
              {variant.amount == null ? '≈ Rate missing' : `${approximate ? '≈ ' : ''}${variant.label}`}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
