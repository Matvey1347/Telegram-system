'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { accountsApi, adCampaignsApi, currenciesApi, transactionsApi, transfersApi } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { Button, Card, EmptyState, LoadingState, PageHeader } from '@/components/ui/primitives';

export default function FinancePage() {
  const { data: settings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const { data: accounts, isLoading: loadingAccounts } = useQuery({ queryKey: ['accounts'], queryFn: accountsApi.list });
  const { data: transactions, isLoading: loadingTransactions } = useQuery({ queryKey: ['transactions', 'finance'], queryFn: () => transactionsApi.list({ sort: 'date_desc' }) });
  const { data: transfers, isLoading: loadingTransfers } = useQuery({ queryKey: ['transfers', 'finance'], queryFn: () => transfersApi.list({ sort: 'date_desc' }) });
  const { data: campaigns } = useQuery({ queryKey: ['ad-campaigns'], queryFn: () => adCampaignsApi.list() });

  const displayMode = settings?.currencyDisplayMode ?? 'code';
  const primaryCurrency = settings?.primaryCurrency ?? '';

  const categorySummary = useMemo(() => {
    const map = new Map<string, { name: string; income: number; expense: number }>();
    for (const tx of transactions ?? []) {
      const key = tx.categoryId ?? tx.category ?? 'uncategorized';
      const current = map.get(key) ?? { name: tx.categoryRef?.name ?? tx.category ?? 'Uncategorized', income: 0, expense: 0 };
      current[tx.type] += Number(tx.amountInPrimaryCurrency ?? 0);
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.income + b.expense - (a.income + a.expense)).slice(0, 8);
  }, [transactions]);

  const recentCampaigns = [...(campaigns ?? [])]
    .sort((a, b) => new Date(b.placementDate ?? b.startedAt ?? '').getTime() - new Date(a.placementDate ?? a.startedAt ?? '').getTime())
    .slice(0, 5);

  return (
    <AppShell>
      <PageHeader title="Finance" subtitle="Balances, transactions, transfers and campaign cash flow" />
      {loadingAccounts || loadingTransactions || loadingTransfers ? <LoadingState /> : null}

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {accounts?.map((account) => (
          <Card key={account.id}>
            <p className="text-sm text-neutral-400">{account.name}</p>
            <p className="mt-2 text-xl font-semibold">{formatMoney(account.balance ?? account.calculatedBalance, account.currency, displayMode)}</p>
            <p className="mt-1 text-sm text-neutral-400">≈ {account.convertedBalance == null ? 'Rate missing' : formatMoney(account.convertedBalance, account.convertedCurrency, displayMode)}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <FinanceTable title="Recent transactions" href="/transactions" headers={['Date', 'Type', 'Amount', 'Account', 'Category']}>
          {transactions?.slice(0, 8).map((tx) => (
            <tr key={tx.id} className="border-t border-neutral-800">
              <td className="px-3 py-2">{new Date(tx.date).toLocaleDateString()}</td>
              <td className={`px-3 py-2 font-semibold ${tx.type === 'income' ? 'text-emerald-300' : 'text-rose-300'}`}>{tx.type}</td>
              <td className="px-3 py-2">{formatMoney(tx.amount, tx.currency, displayMode)}</td>
              <td className="px-3 py-2">{tx.account?.name ?? '-'}</td>
              <td className="px-3 py-2">{tx.categoryRef?.name ?? tx.category}</td>
            </tr>
          ))}
        </FinanceTable>

        <FinanceTable title="Recent transfers" href="/transfers" headers={['Date', 'From', 'Amount', 'To', 'Amount']}>
          {transfers?.slice(0, 8).map((transfer) => (
            <tr key={transfer.id} className="border-t border-neutral-800">
              <td className="px-3 py-2">{new Date(transfer.date).toLocaleDateString()}</td>
              <td className="px-3 py-2">{transfer.fromAccount?.name ?? '-'}</td>
              <td className="px-3 py-2">{formatMoney(transfer.fromAmount, transfer.fromCurrency, displayMode)}</td>
              <td className="px-3 py-2">{transfer.toAccount?.name ?? '-'}</td>
              <td className="px-3 py-2">{formatMoney(transfer.toAmount, transfer.toCurrency, displayMode)}</td>
            </tr>
          ))}
        </FinanceTable>

        <FinanceTable title="Category summary" href="/categories" headers={['Category', 'Income', 'Expense']}>
          {categorySummary.map((row) => (
            <tr key={row.name} className="border-t border-neutral-800">
              <td className="px-3 py-2">{row.name}</td>
              <td className="px-3 py-2 text-emerald-300">{formatMoney(row.income, primaryCurrency, displayMode)}</td>
              <td className="px-3 py-2 text-rose-300">{formatMoney(row.expense, primaryCurrency, displayMode)}</td>
            </tr>
          ))}
        </FinanceTable>

        <FinanceTable title="Recent ad campaign expenses" href="/ad-campaigns" headers={['Campaign', 'Price', 'Primary', 'Date']}>
          {recentCampaigns.map((campaign) => (
            <tr key={campaign.id} className="border-t border-neutral-800">
              <td className="px-3 py-2">{campaign.title}</td>
              <td className="px-3 py-2">{formatMoney(campaign.price, campaign.currency, displayMode)}</td>
              <td className="px-3 py-2">{formatMoney(campaign.priceInPrimaryCurrency, primaryCurrency, displayMode)}</td>
              <td className="px-3 py-2">{campaign.placementDate ? new Date(campaign.placementDate).toLocaleDateString() : '-'}</td>
            </tr>
          ))}
        </FinanceTable>
      </div>

      {!loadingAccounts && !accounts?.length ? <EmptyState text="No finance data yet" /> : null}
    </AppShell>
  );
}

function FinanceTable({ title, href, headers, children }: { title: string; href: string; headers: string[]; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Link href={href}><Button variant="secondary">Open</Button></Link>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-neutral-400">
            <tr>{headers.map((header, index) => <th key={`${header}-${index}`} className="px-3 py-2">{header}</th>)}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </Card>
  );
}
