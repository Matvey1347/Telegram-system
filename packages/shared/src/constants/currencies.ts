export const CURRENCIES = ['UAH', 'USD', 'EUR', 'PLN'] as const;

export type Currency = (typeof CURRENCIES)[number];
