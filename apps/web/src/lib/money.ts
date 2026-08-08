import type { CurrencyDisplayMode, CurrencySettings, ExchangeRate } from './api';

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

export function formatRate(value: number | string | null | undefined, maxFractionDigits = 10) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const factor = 10 ** maxFractionDigits;
  const truncated = Math.trunc(number * factor) / factor;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(truncated);
}

export function getExchangeRate(
  rates: ExchangeRate[] | undefined,
  fromCurrency: string | null | undefined,
  toCurrency: string | null | undefined,
) {
  const from = String(fromCurrency || '').toUpperCase();
  const to = String(toCurrency || '').toUpperCase();
  if (!from || !to) return null;
  if (from === to) return 1;
  const direct = rates?.find((rate) => rate.baseCurrency === from && rate.targetCurrency === to);
  if (direct) return Number(direct.rate);
  const reverse = rates?.find((rate) => rate.baseCurrency === to && rate.targetCurrency === from);
  if (reverse && Number(reverse.rate) > 0) return 1 / Number(reverse.rate);
  return null;
}

export function convertMoney(
  amount: number | string | null | undefined,
  fromCurrency: string | null | undefined,
  toCurrency: string | null | undefined,
  rates: ExchangeRate[] | undefined,
) {
  const rate = getExchangeRate(rates, fromCurrency, toCurrency);
  if (rate == null) return null;
  return Number(amount ?? 0) * rate;
}

export function getMoneyVariantTargets(
  currency: string | null | undefined,
  settings: Pick<CurrencySettings, 'primaryCurrency' | 'secondaryCurrency' | 'tertiaryCurrency'> | null | undefined,
) {
  const current = String(currency || '').toUpperCase();
  const primary = String(settings?.primaryCurrency || '').toUpperCase();
  const secondary = String(settings?.secondaryCurrency || '').toUpperCase();
  const tertiary = String(settings?.tertiaryCurrency || 'UAH').toUpperCase();
  if (!current || !primary) return [];
  return [primary, secondary, tertiary].filter(
    (target, index, list) =>
      target && target !== current && list.indexOf(target) === index,
  );
}

export function getMoneyVariants(params: {
  amount: number | string | null | undefined;
  currency: string | null | undefined;
  settings: Pick<CurrencySettings, 'primaryCurrency' | 'secondaryCurrency' | 'tertiaryCurrency' | 'currencyDisplayMode'> | null | undefined;
  rates?: ExchangeRate[];
  amountInPrimary?: number | string | null;
}) {
  const { amount, currency, settings, rates, amountInPrimary } = params;
  const current = String(currency || '').toUpperCase();
  const primary = String(settings?.primaryCurrency || '').toUpperCase();
  const displayMode = settings?.currencyDisplayMode ?? 'code';
  const targets = getMoneyVariantTargets(current, settings);

  return targets.map((target) => {
    let value: number | null = null;
    if (target === primary && amountInPrimary != null) {
      value = Number(amountInPrimary);
    } else if (current === primary && amountInPrimary != null) {
      const converted = convertMoney(amountInPrimary, primary, target, rates);
      value = converted == null ? null : converted;
    } else if (primary && amountInPrimary != null) {
      const converted = convertMoney(amountInPrimary, primary, target, rates);
      value = converted == null ? null : converted;
    } else {
      const converted = convertMoney(amount, current, target, rates);
      value = converted == null ? null : converted;
    }
    return {
      currency: target,
      amount: value,
      label: value == null ? 'Rate missing' : formatMoney(value, target, displayMode),
    };
  });
}

export function getMoneyPreview(params: {
  amount: number | string | null | undefined;
  currency: string | null | undefined;
  settings: Pick<CurrencySettings, 'primaryCurrency' | 'secondaryCurrency' | 'tertiaryCurrency' | 'currencyDisplayMode'> | null | undefined;
  rates?: ExchangeRate[];
  amountInPrimary?: number | string | null;
}) {
  const { amount, currency, settings, rates, amountInPrimary } = params;
  const displayMode = settings?.currencyDisplayMode ?? 'code';
  const primary = String(settings?.primaryCurrency || currency || '').toUpperCase();
  const secondary = String(settings?.secondaryCurrency || '').toUpperCase();
  const tertiary = String(settings?.tertiaryCurrency || 'UAH').toUpperCase();
  const ordered = [primary, secondary, tertiary].filter(
    (target, index, list) => target && list.indexOf(target) === index,
  );

  return ordered.map((target) => {
    const value =
      target === String(currency || '').toUpperCase()
        ? Number(amount ?? 0)
        : target === primary && amountInPrimary != null
          ? Number(amountInPrimary)
          : amountInPrimary != null && primary
            ? convertMoney(amountInPrimary, primary, target, rates)
            : convertMoney(amount, currency, target, rates);
    return {
      currency: target,
      amount: value,
      label: value == null ? 'Rate missing' : formatMoney(value, target, displayMode),
    };
  });
}

export function formatMoneyPreview(params: Parameters<typeof getMoneyPreview>[0]) {
  const [primary, secondary, tertiary] = getMoneyPreview(params);
  const firstLine = [primary, secondary]
    .filter(Boolean)
    .map((item) => item.amount == null ? 'Rate missing' : item.label)
    .join(' / ');
  const secondLine = tertiary ? (tertiary.amount == null ? 'Rate missing' : tertiary.label) : '';
  return secondLine ? `${firstLine}\n${secondLine}` : firstLine;
}
