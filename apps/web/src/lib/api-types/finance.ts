import type { EntityAssignment, Icon, ResolvedEmoji, WorkspaceMember, Currency } from "./core";

export type TransactionType = "income" | "expense";
export type AccountTransactionStats = {
  count: number;
  incomeCount: number;
  expenseCount: number;
  received: number;
  spent: number;
  transferredIn: number;
  transferredOut: number;
  delta: number;
};
export type Account = EntityAssignment & {
  id: string;
  name: string;
  currency: Currency;
  initialBalance: number;
  balance?: number;
  calculatedBalance?: number | null;
  convertedBalance?: number | null;
  convertedCurrency?: Currency;
  transactionStats?: AccountTransactionStats;
  isActive: boolean;
  iconId?: string | null;
  icon?: Icon | null;
  iconPresentation?: ResolvedEmoji | null;
};
export type TransactionCategory = {
  id: string;
  name: string;
  type: TransactionType;
  isSystem: boolean;
  key?: string | null;
  iconId?: string | null;
  icon?: Icon | null;
  iconPresentation?: ResolvedEmoji | null;
};
export type Transaction = EntityAssignment & {
  id: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  exchangeRateToPrimary: number;
  amountInPrimaryCurrency: number;
  category: string;
  categoryId?: string | null;
  memberId?: string | null;
  description?: string;
  date: string;
  iconId?: string | null;
  icon?: Icon | null;
  iconPresentation?: ResolvedEmoji | null;
  account?: Account;
  categoryRef?: TransactionCategory;
  member?: WorkspaceMember;
  adCampaign?: { id: string; title: string } | null;
  investment?: { id: string; notes?: string | null } | null;
  telegramChannel?: {
    id: string;
    title: string;
    username?: string | null;
    photoUrl?: string | null;
  } | null;
  purchasedTelegramChannel?: {
    id: string;
    title: string;
    username?: string | null;
    photoUrl?: string | null;
  } | null;
};
export type Transfer = EntityAssignment & {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  fromAmount: number;
  toAmount: number;
  fromCurrency: Currency;
  toCurrency: Currency;
  exchangeRate?: number;
  transferLossAmount?: number;
  date: string;
  description?: string;
  fromAccount?: Account;
  toAccount?: Account;
};
