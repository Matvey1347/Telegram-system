import type { CurrencyDisplayMode } from './api';

const SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  PLN: 'zł',
  UAH: '₴',
  GBP: '£',
  TRY: '₺',
  CAD: 'C$',
  AUD: 'A$',
  CHF: 'CHF',
  JPY: '¥',
  CNY: '¥',
};

export function formatMoney(
  amount: number | string | null | undefined,
  currencyCode: string | null | undefined,
  currencyDisplayMode: CurrencyDisplayMode = 'code',
) {
  const value = Number(amount ?? 0);
  const code = (currencyCode || '').toUpperCase();
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  if (currencyDisplayMode === 'symbol') {
    return `${SYMBOLS[code] ?? code} ${formatted}`.trim();
  }

  return `${formatted} ${code}`.trim();
}
