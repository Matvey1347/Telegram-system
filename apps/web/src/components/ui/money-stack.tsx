import type { CurrencySettings, ExchangeRate } from '@/lib/api';
import { getMoneyPreview } from '@/lib/money';

type MoneyStackProps = {
  amount: number | string | null | undefined;
  currency: string | null | undefined;
  settings?: Pick<CurrencySettings, 'primaryCurrency' | 'secondaryCurrency' | 'tertiaryCurrency' | 'currencyDisplayMode'> | null;
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
  const preview = getMoneyPreview({
    amount,
    currency,
    settings,
    rates,
    amountInPrimary,
  });
  const [primary, secondary, tertiary] = preview;
  const firstLine = [primary, secondary]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => item.amount == null ? 'Rate missing' : item.label)
    .join(' / ');
  const secondLine = tertiary?.amount == null
    ? tertiary
      ? 'Rate missing'
      : ''
    : `${approximate ? '≈ ' : ''}${tertiary.label}`;

  return (
    <div className={className}>
      <div className={mainClassName}>
        {firstLine || '-'}
      </div>
      {secondLine ? <div className={subClassName}>{secondLine}</div> : null}
    </div>
  );
}
