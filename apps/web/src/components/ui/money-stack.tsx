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
  const formatPreviewItem = (item: (typeof preview)[number]) =>
    item.amount == null ? 'Rate missing' : item.label;

  return (
    <div className={className}>
      <div className={mainClassName}>
        {[primary, secondary].filter(Boolean).map(formatPreviewItem).join(' / ')}
      </div>
      {tertiary ? (
        <div className={subClassName}>
          {tertiary.amount == null ? 'Rate missing' : `${approximate ? '≈ ' : ''}${tertiary.label}`}
        </div>
      ) : null}
    </div>
  );
}
