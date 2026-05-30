export const TRANSACTION_TYPES = ['income', 'expense'] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];
