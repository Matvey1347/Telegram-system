'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleMinus, CirclePlus } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { InlineIconPicker } from '@/components/icons/inline-icon-picker';
import {
  Account,
  accountsApi,
  currenciesApi,
  transactionCategoriesApi,
  transactionsApi,
  transfersApi,
  type Transaction,
  type TransactionType,
} from '@/lib/api';
import { formatMoney, formatRate } from '@/lib/money';
import { MoneyStack } from '@/components/ui/money-stack';
import { Button, Card, DateRangeInput, EmptyState, EntityCard, FormField, PageHeader, Skeleton } from '@/components/ui/primitives';

type DateFilters = { dateFrom: string; dateTo: string };
type CategoryStats = { count: number; totalPrimary: number };

export default function FinancePage() {
  const qc = useQueryClient();
  const [dateFilters, setDateFilters] = useState<DateFilters>({ dateFrom: '', dateTo: '' });
  const [categoryType, setCategoryType] = useState<TransactionType>('expense');

  const datedQuery = useMemo(
    () => Object.fromEntries(Object.entries(dateFilters).filter(([, value]) => value)),
    [dateFilters],
  );

  const { data: settings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const { data: rates } = useQuery({ queryKey: ['currency-rates'], queryFn: currenciesApi.listRates });
  const { data: accounts, isLoading: loadingAccounts } = useQuery({ queryKey: ['accounts'], queryFn: accountsApi.list });
  const { data: transactions, isLoading: loadingTransactions, error: transactionsError } = useQuery({
    queryKey: ['transactions', 'finance', datedQuery],
    queryFn: () => transactionsApi.list({ ...datedQuery, sort: 'date_desc' }),
  });
  const { data: transfers, isLoading: loadingTransfers, error: transfersError } = useQuery({
    queryKey: ['transfers', 'finance', datedQuery],
    queryFn: () => transfersApi.list({ ...datedQuery, sort: 'date_desc' }),
  });
  const { data: categories, isLoading: loadingCategories, error: categoriesError } = useQuery({
    queryKey: ['transaction-categories-admin', 'finance', categoryType],
    queryFn: () => transactionCategoriesApi.list(categoryType),
  });

  const updateTransactionIconMutation = useMutation({
    mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) => transactionsApi.update(id, { iconId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  });
  const updateAccountIconMutation = useMutation({
    mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) => accountsApi.update(id, { iconId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['transfers'] });
    },
  });
  const updateCategoryIconMutation = useMutation({
    mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) => transactionCategoriesApi.update(id, { iconId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['transaction-categories'] });
      qc.invalidateQueries({ queryKey: ['transaction-categories-admin'] });
    },
  });

  const primaryCurrency = settings?.primaryCurrency ?? '';
  const categoryStats = useMemo(() => {
    const map = new Map<string, CategoryStats>();
    for (const transaction of transactions ?? []) {
      if (transaction.type !== categoryType) continue;
      const key = transaction.categoryId ?? transaction.category ?? 'uncategorized';
      const current = map.get(key) ?? { count: 0, totalPrimary: 0 };
      current.count += 1;
      current.totalPrimary += Number(transaction.amountInPrimaryCurrency ?? 0);
      map.set(key, current);
    }
    return map;
  }, [categoryType, transactions]);

  return (
    <AppShell>
      <PageHeader title="Finance" subtitle="Balances, transactions, transfers and categories" />

      <Card className="mb-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FormField label="Period">
            <DateRangeInput
              from={dateFilters.dateFrom}
              to={dateFilters.dateTo}
              onChange={(range) => setDateFilters({ dateFrom: range.from, dateTo: range.to })}
            />
          </FormField>
        </div>
      </Card>

      {transactionsError ? <div className="mb-4 text-red-300">Failed to load transactions</div> : null}
      {transfersError ? <div className="mb-4 text-red-300">Failed to load transfers</div> : null}
      {categoriesError ? <div className="mb-4 text-red-300">Failed to load categories</div> : null}

      <div className="space-y-6">
        <FinanceSection title="Accounts" href="/accounts" isLoading={loadingAccounts} skeleton="cards">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {accounts?.map((account) => (
              <EntityCard
                key={account.id}
                title={<div className="flex items-center gap-2"><InlineIconPicker iconId={account.iconId ?? null} onChange={(iconId) => updateAccountIconMutation.mutate({ id: account.id, iconId })} /><span>{account.name}</span></div>}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <MoneyStack amount={account.balance ?? account.calculatedBalance} currency={account.currency} settings={settings} rates={rates} amountInPrimary={account.convertedCurrency === settings?.primaryCurrency ? account.convertedBalance : null} />
                  <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs">{account.currency}</span>
                </div>
                <AccountStatsSummary account={account} displayMode={settings?.currencyDisplayMode} />
              </EntityCard>
            ))}
          </div>
          {!loadingAccounts && !accounts?.length ? <EmptyState text="No accounts yet" /> : null}
        </FinanceSection>

        <FinanceSection title="Transactions" href="/transactions" isLoading={loadingTransactions} skeleton="table">
          <div className="table-scroll w-full rounded-lg border border-neutral-800">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-neutral-900 text-xs uppercase text-neutral-400">
                <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Account</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {transactions?.map((transaction) => (
                  <tr key={transaction.id} className="bg-neutral-950">
                    <td className="px-3 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <InlineIconPicker iconId={transaction.iconId ?? null} onChange={(iconId) => updateTransactionIconMutation.mutate({ id: transaction.id, iconId })} className="shrink-0" />
                          <div className="truncate font-medium text-white">{getTransactionTitle(transaction)}</div>
                        </div>
                        <div className={`mt-1 text-xs ${transaction.type === 'income' ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {transaction.type} • {new Date(transaction.date).toLocaleDateString()}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <MoneyStack amount={transaction.amount} currency={transaction.currency} settings={settings} rates={rates} amountInPrimary={transaction.amountInPrimaryCurrency} mainClassName={`font-semibold ${transaction.type === 'income' ? 'text-emerald-300' : 'text-rose-300'}`} subClassName="text-xs text-neutral-400" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <InlineIconPicker iconId={transaction.categoryRef?.iconId ?? null} onChange={(iconId) => transaction.categoryRef?.id && updateCategoryIconMutation.mutate({ id: transaction.categoryRef.id, iconId })} className="shrink-0" />
                        <span>{transaction.categoryRef?.name ?? transaction.category}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <InlineIconPicker iconId={transaction.account?.iconId ?? null} onChange={(iconId) => transaction.account?.id && updateAccountIconMutation.mutate({ id: transaction.account.id, iconId })} className="shrink-0" />
                        <span>{transaction.account?.name ?? '-'}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loadingTransactions && !transactions?.length ? <EmptyState text="No transactions" /> : null}
        </FinanceSection>

        <FinanceSection title="Categories" href="/categories" isLoading={loadingCategories} skeleton="cards">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            {([
              { value: 'expense', label: 'Expenses', icon: CircleMinus },
              { value: 'income', label: 'Income', icon: CirclePlus },
            ] as const).map((tab) => {
              const Icon = tab.icon;
              const active = categoryType === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setCategoryType(tab.value)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-base font-semibold transition ${active ? 'border-neutral-600 bg-neutral-800 text-white' : tab.value === 'expense' ? 'border-transparent bg-transparent text-rose-300 hover:border-neutral-800 hover:bg-neutral-900 hover:text-rose-200' : 'border-transparent bg-transparent text-neutral-400 hover:border-neutral-800 hover:bg-neutral-900 hover:text-white'}`}
                >
                  <Icon size={20} className={tab.value === 'income' ? 'text-emerald-300' : 'text-rose-300'} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {categories?.map((category) => {
              const stats = categoryStats.get(category.id) ?? { count: 0, totalPrimary: 0 };
              const tone = category.type === 'income' ? 'text-emerald-300' : 'text-rose-300';
              return (
                <EntityCard
                  key={category.id}
                  title={<div className="flex items-center gap-2"><InlineIconPicker iconId={category.iconId ?? null} onChange={(iconId) => updateCategoryIconMutation.mutate({ id: category.id, iconId })} /><span>{category.name}</span></div>}
                >
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-neutral-400">{category.type === 'income' ? 'Received' : 'Spent'}</p>
                      <MoneyStack amount={stats.totalPrimary} currency={primaryCurrency} settings={settings} rates={rates} mainClassName={`text-2xl font-semibold ${tone}`} subClassName="text-base font-medium text-neutral-200" />
                    </div>
                    <p className="text-sm text-neutral-400">
                      {stats.count} {stats.count === 1 ? 'transaction' : 'transactions'}
                    </p>
                  </div>
                </EntityCard>
              );
            })}
          </div>
          {!loadingCategories && !categories?.length ? <EmptyState text="No categories" /> : null}
        </FinanceSection>

        <FinanceSection title="Transfers" href="/transfers" isLoading={loadingTransfers} skeleton="table">
          <div className="table-scroll w-full rounded-lg border border-neutral-800">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-neutral-900 text-xs uppercase text-neutral-400">
                <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">From</th><th className="px-3 py-2">From amount</th><th className="px-3 py-2">To</th><th className="px-3 py-2">To amount</th><th className="px-3 py-2">Exchange rate</th><th className="px-3 py-2">Loss</th><th className="px-3 py-2">Description</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {transfers?.map((transfer) => (
                  <tr key={transfer.id} className="bg-neutral-950">
                    <td className="px-3 py-2">{new Date(transfer.date).toLocaleDateString()}</td>
                    <td className="px-3 py-2"><TransferAccountCell account={transfer.fromAccount} fallback={transfer.fromAccountId} onIconChange={(iconId) => updateAccountIconMutation.mutate({ id: transfer.fromAccountId, iconId })} /></td>
                    <td className="px-3 py-2"><MoneyStack amount={transfer.fromAmount} currency={transfer.fromCurrency} settings={settings} rates={rates} mainClassName="font-medium text-white" subClassName="text-xs text-neutral-400" /></td>
                    <td className="px-3 py-2"><TransferAccountCell account={transfer.toAccount} fallback={transfer.toAccountId} onIconChange={(iconId) => updateAccountIconMutation.mutate({ id: transfer.toAccountId, iconId })} /></td>
                    <td className="px-3 py-2"><MoneyStack amount={transfer.toAmount} currency={transfer.toCurrency} settings={settings} rates={rates} mainClassName="font-medium text-white" subClassName="text-xs text-neutral-400" /></td>
                    <td className="px-3 py-2">{formatRate(transfer.exchangeRate, 1)}</td>
                    <td className="px-3 py-2">{transfer.transferLossAmount != null ? <MoneyStack amount={transfer.transferLossAmount} currency={transfer.toCurrency} settings={settings} rates={rates} mainClassName="font-medium text-white" subClassName="text-xs text-neutral-400" /> : '-'}</td>
                    <td className="max-w-[240px] truncate px-3 py-2">{transfer.description || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loadingTransfers && !transfers?.length ? <EmptyState text="No transfers" /> : null}
        </FinanceSection>
      </div>
    </AppShell>
  );
}

function FinanceSection({ title, href, children, isLoading, skeleton }: { title: string; href: string; children: ReactNode; isLoading?: boolean; skeleton?: 'cards' | 'table' }) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <Link href={href}><Button variant="secondary">Open</Button></Link>
      </div>
      {isLoading ? <FinanceSectionSkeleton variant={skeleton} /> : children}
    </section>
  );
}

function FinanceSectionSkeleton({ variant = 'cards' }: { variant?: 'cards' | 'table' }) {
  if (variant === 'table') {
    return (
      <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 p-3" role="status" aria-label="Loading section">
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-11 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading section">
      {Array.from({ length: 3 }, (_, index) => <Card key={index}><Skeleton className="h-5 w-1/2" /><Skeleton className="mt-5 h-8 w-2/3" /><Skeleton className="mt-4 h-3 w-full" /><Skeleton className="mt-2 h-3 w-4/5" /></Card>)}
    </div>
  );
}

function AccountStatsSummary({ account, displayMode }: { account: Account; displayMode?: 'code' | 'symbol' }) {
  const stats = account.transactionStats;
  const count = stats?.count ?? 0;
  const received = Number(stats?.received ?? 0);
  const spent = Number(stats?.spent ?? 0);
  const transferredIn = Number(stats?.transferredIn ?? 0);
  const transferredOut = Number(stats?.transferredOut ?? 0);
  const delta = Number(stats?.delta ?? 0);

  return (
    <div className="mt-3 space-y-1.5 text-xs leading-snug text-neutral-500">
      <div>{count} {count === 1 ? 'transaction' : 'transactions'}</div>
      <div className="grid gap-1">
        <AccountStatLine label="Received" value={received} currency={account.currency} displayMode={displayMode} tone="positive" />
        <AccountStatLine label="Spent" value={spent} currency={account.currency} displayMode={displayMode} tone="negative" />
        <AccountStatLine label="Transferred in" value={transferredIn} currency={account.currency} displayMode={displayMode} tone="positive" />
        <AccountStatLine label="Transferred out" value={transferredOut} currency={account.currency} displayMode={displayMode} tone="negative" />
        {delta !== 0 ? <AccountStatLine label="Delta" value={delta} currency={account.currency} displayMode={displayMode} tone={delta > 0 ? 'positive' : 'negative'} /> : null}
      </div>
    </div>
  );
}

function AccountStatLine({ label, value, currency, displayMode, tone }: { label: string; value: number; currency: string; displayMode?: 'code' | 'symbol'; tone: 'positive' | 'negative' }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className={`font-medium ${tone === 'positive' ? 'text-emerald-300' : 'text-rose-300'}`}>
        {formatMoney(value, currency, displayMode)}
      </span>
    </div>
  );
}

function TransferAccountCell({ account, fallback, onIconChange }: { account?: Pick<Account, 'name' | 'iconId'> | null; fallback: string; onIconChange: (iconId: string | null) => void }) {
  return (
    <div className="flex items-center gap-2">
      <InlineIconPicker iconId={account?.iconId ?? null} onChange={onIconChange} className="shrink-0" />
      <span className="min-w-0 truncate">{account?.name ?? fallback}</span>
    </div>
  );
}

function getTransactionTitle(transaction: Transaction) {
  return transaction.description?.trim()
    || transaction.adCampaign?.title?.trim()
    || transaction.investment?.notes?.trim()
    || transaction.member?.user?.name?.trim()
    || transaction.categoryRef?.name
    || transaction.category
    || 'Transaction';
}
