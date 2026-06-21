'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleMinus, CirclePlus } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { InlineIconPicker } from '@/components/icons/inline-icon-picker';
import { accountsApi, currenciesApi, transactionCategoriesApi, transactionsApi, transfersApi, type Transaction, type TransactionType } from '@/lib/api';
import { MoneyStack } from '@/components/ui/money-stack';
import { Button, Card, EmptyState, EntityCard, LoadingState, PageHeader } from '@/components/ui/primitives';

export default function FinancePage() {
  const qc = useQueryClient();
  const [categoryType, setCategoryType] = useState<TransactionType>('expense');
  const { data: settings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const { data: rates } = useQuery({ queryKey: ['currency-rates'], queryFn: currenciesApi.listRates });
  const { data: accounts, isLoading: loadingAccounts } = useQuery({ queryKey: ['accounts'], queryFn: accountsApi.list });
  const { data: transactions, isLoading: loadingTransactions } = useQuery({ queryKey: ['transactions', 'finance'], queryFn: () => transactionsApi.list({ sort: 'date_desc' }) });
  const { data: transfers, isLoading: loadingTransfers } = useQuery({ queryKey: ['transfers', 'finance'], queryFn: () => transfersApi.list({ sort: 'date_desc' }) });
  const updateTransactionIconMutation = useMutation({
    mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) => transactionsApi.update(id, { iconId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
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

  const categorySummary = useMemo(() => {
    const map = new Map<string, { name: string; type: TransactionType; icon: Transaction['categoryRef']; totalPrimary: number; count: number }>();
    for (const tx of transactions ?? []) {
      const key = tx.categoryId ?? tx.category ?? 'uncategorized';
      const amountPrimary = Number(tx.amountInPrimaryCurrency ?? 0);
      const current = map.get(key) ?? {
        name: tx.categoryRef?.name ?? tx.category ?? 'Uncategorized',
        type: tx.type,
        icon: tx.categoryRef,
        totalPrimary: 0,
        count: 0,
      };
      current.totalPrimary += amountPrimary;
      current.count += 1;
      map.set(key, current);
    }
    return [...map.values()]
      .filter((item) => item.type === categoryType)
      .sort((a, b) => b.totalPrimary - a.totalPrimary)
      .slice(0, 6);
  }, [categoryType, transactions]);

  return (
    <AppShell>
      <PageHeader title="Finance" subtitle="Balances, transactions, transfers and campaign cash flow" />
      {loadingAccounts || loadingTransactions || loadingTransfers ? <LoadingState /> : null}

      <div className="space-y-6">
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Accounts</h2>
            <Link href="/accounts"><Button variant="secondary">Open</Button></Link>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {accounts?.map((account) => (
              <EntityCard
                key={account.id}
                title={
                  <div className="flex items-center gap-2">
                    <InlineIconPicker
                      iconId={account.iconId ?? null}
                      onChange={(iconId) => updateAccountIconMutation.mutate({ id: account.id, iconId })}
                    />
                    <span>{account.name}</span>
                  </div>
                }
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <MoneyStack amount={account.balance ?? account.calculatedBalance} currency={account.currency} settings={settings} rates={rates} amountInPrimary={account.convertedCurrency === primaryCurrency ? account.convertedBalance : null} />
                  <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs">{account.currency}</span>
                </div>
              </EntityCard>
            ))}
          </div>
          {!loadingAccounts && !accounts?.length ? <EmptyState text="No accounts yet" /> : null}
        </section>

        <FinanceTable title="Recent transactions" href="/transactions" headers={['Name', 'Price', 'Category', 'Account']}>
          {transactions?.slice(0, 8).map((tx) => (
            <tr key={tx.id} className="border-t border-neutral-800">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <InlineIconPicker
                    iconId={tx.iconId ?? tx.categoryRef?.iconId ?? null}
                    onChange={(iconId) => updateTransactionIconMutation.mutate({ id: tx.id, iconId })}
                  />
                  <div className="font-medium text-white">{getTransactionTitle(tx)}</div>
                </div>
                <div className={`mt-1 text-sm ${tx.type === 'income' ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {tx.type} • {new Date(tx.date).toLocaleDateString()}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <MoneyStack amount={tx.amount} currency={tx.currency} settings={settings} rates={rates} amountInPrimary={tx.amountInPrimaryCurrency} mainClassName={`font-semibold ${tx.type === 'income' ? 'text-emerald-300' : 'text-rose-300'}`} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {tx.categoryRef?.id ? (
                    <InlineIconPicker
                      iconId={tx.categoryRef.iconId ?? null}
                      onChange={(iconId) => updateCategoryIconMutation.mutate({ id: tx.categoryRef!.id, iconId })}
                    />
                  ) : null}
                  <span>{tx.categoryRef?.name ?? tx.category}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {tx.account?.id ? (
                    <InlineIconPicker
                      iconId={tx.account.iconId ?? null}
                      onChange={(iconId) => updateAccountIconMutation.mutate({ id: tx.account!.id, iconId })}
                    />
                  ) : null}
                  <span>{tx.account?.name ?? '-'}</span>
                </div>
              </td>
            </tr>
          ))}
        </FinanceTable>

        <FinanceSection title="Categories" href="/categories">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            {([
              { value: 'expense', label: 'Expenses', icon: CircleMinus, iconClass: 'text-rose-300', textClass: 'text-rose-300 hover:text-rose-200' },
              { value: 'income', label: 'Income', icon: CirclePlus, iconClass: 'text-emerald-300', textClass: 'text-neutral-400 hover:text-white' },
            ] as const).map((tab) => {
              const Icon = tab.icon;
              const active = categoryType === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setCategoryType(tab.value)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-base font-semibold transition ${active ? 'border-neutral-600 bg-neutral-800 text-white' : `border-transparent bg-transparent ${tab.textClass}`}`}
                >
                  <Icon size={20} className={tab.iconClass} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {categorySummary.map((category) => (
              <EntityCard
                key={`${category.type}-${category.name}`}
                title={
                  <div className="flex items-center gap-2">
                    {category.icon?.id ? (
                      <InlineIconPicker
                        iconId={category.icon.iconId ?? null}
                        onChange={(iconId) => updateCategoryIconMutation.mutate({ id: category.icon!.id, iconId })}
                      />
                    ) : null}
                    <span>{category.name}</span>
                  </div>
                }
              >
                <p className="text-neutral-400">{category.type === 'income' ? 'Received' : 'Spent'}</p>
                <MoneyStack amount={category.totalPrimary} currency={primaryCurrency} settings={settings} rates={rates} mainClassName={`text-2xl font-semibold ${category.type === 'income' ? 'text-emerald-300' : 'text-rose-300'}`} subClassName="text-base font-medium text-neutral-200" />
                <p className="text-neutral-400">{category.count} {category.count === 1 ? 'transaction' : 'transactions'}</p>
              </EntityCard>
            ))}
          </div>
          {!loadingTransactions && !categorySummary.length ? <EmptyState text="No categories yet" /> : null}
        </FinanceSection>

        <FinanceTable title="Recent transfers" href="/transfers" headers={['Date', 'From', 'Amount', 'To', 'Amount']}>
          {transfers?.slice(0, 8).map((transfer) => (
            <tr key={transfer.id} className="border-t border-neutral-800">
              <td className="px-4 py-3">{new Date(transfer.date).toLocaleDateString()}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {transfer.fromAccount?.id ? (
                    <InlineIconPicker
                      iconId={transfer.fromAccount.iconId ?? null}
                      onChange={(iconId) => updateAccountIconMutation.mutate({ id: transfer.fromAccount!.id, iconId })}
                    />
                  ) : null}
                  <span>{transfer.fromAccount?.name ?? '-'}</span>
                </div>
              </td>
              <td className="px-4 py-3"><MoneyStack amount={transfer.fromAmount} currency={transfer.fromCurrency} settings={settings} rates={rates} mainClassName="font-medium text-white" /></td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {transfer.toAccount?.id ? (
                    <InlineIconPicker
                      iconId={transfer.toAccount.iconId ?? null}
                      onChange={(iconId) => updateAccountIconMutation.mutate({ id: transfer.toAccount!.id, iconId })}
                    />
                  ) : null}
                  <span>{transfer.toAccount?.name ?? '-'}</span>
                </div>
              </td>
              <td className="px-4 py-3"><MoneyStack amount={transfer.toAmount} currency={transfer.toCurrency} settings={settings} rates={rates} mainClassName="font-medium text-white" /></td>
            </tr>
          ))}
        </FinanceTable>
      </div>
    </AppShell>
  );
}

function FinanceSection({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <Link href={href}><Button variant="secondary">Open</Button></Link>
      </div>
      {children}
    </Card>
  );
}

function FinanceTable({ title, href, headers, children }: { title: string; href: string; headers: string[]; children: ReactNode }) {
  return (
    <FinanceSection title={title} href={href}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm text-neutral-200">
          <thead className="text-xs uppercase text-neutral-500">
            <tr>{headers.map((header, index) => <th key={`${header}-${index}`} className="px-4 py-3 font-semibold">{header}</th>)}</tr>
          </thead>
          <tbody className="text-base">{children}</tbody>
        </table>
      </div>
    </FinanceSection>
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
