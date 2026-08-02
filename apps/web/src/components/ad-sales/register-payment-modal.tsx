"use client";

import { useEffect, useMemo, useState } from "react";
import type { TelegramAdSale } from "@telegram-system/shared";
import type { Account } from "@/lib/api";
import { Button, FormField, Input, Modal, Select, Textarea } from "@/components/ui/primitives";
import { autoAllocatePayment, toNumber } from "@/lib/telegram-ad-sales";

type AllocationState = Record<string, string>;

export function RegisterPaymentModal({
  open,
  onClose,
  sale,
  accounts,
  defaultCurrency,
  onSubmit,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  sale: TelegramAdSale | null;
  accounts: Account[];
  defaultCurrency: string;
  onSubmit: (payload: {
    accountId: string;
    amount: number;
    currency: string;
    paidAt: string;
    notes?: string;
    allocations: Array<{ placementId: string; amount: number }>;
  }) => Promise<void>;
  busy?: boolean;
}) {
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [paidAt, setPaidAt] = useState("");
  const [notes, setNotes] = useState("");
  const [allocationState, setAllocationState] = useState<AllocationState>({});

  useEffect(() => {
    if (!open || !sale) return;
    const preferredAccount = accounts.find((account) => account.isActive);
    setAccountId(preferredAccount?.id ?? "");
    setCurrency(preferredAccount?.currency ?? defaultCurrency);
    setPaidAt(new Date().toISOString().slice(0, 16));
    setNotes("");
    const amountValue = toNumber(sale.outstandingAmount || sale.totalAgreedAmount);
    setAmount(amountValue ? String(amountValue) : "");
    const allocation = autoAllocatePayment({
      amount: amountValue,
      placements: sale.placements.map((placement) => ({
        id: placement.id,
        agreedPrice: placement.agreedPrice,
        paidAllocatedAmount: placement.paidAllocatedAmount,
      })),
    });
    setAllocationState(
      Object.fromEntries(
        allocation.allocations.map((item) => [item.placementId, String(item.amount)]),
      ),
    );
  }, [accounts, defaultCurrency, open, sale]);

  const allocations = useMemo(
    () =>
      sale?.placements.map((placement) => ({
        placement,
        amount: toNumber(allocationState[placement.id]),
      })) ?? [],
    [allocationState, sale],
  );

  const allocatedTotal = useMemo(
    () => Number(allocations.reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
    [allocations],
  );
  const enteredAmount = toNumber(amount);
  const unallocated = Number(Math.max(0, enteredAmount - allocatedTotal).toFixed(2));

  if (!sale) return null;

  return (
    <Modal open={open} onClose={onClose} title="Register payment" size="xl">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Account">
              <Select
                value={accountId}
                onChange={(event) => {
                  const nextAccountId = event.target.value;
                  setAccountId(nextAccountId);
                  const account = accounts.find((item) => item.id === nextAccountId);
                  if (account) setCurrency(account.currency);
                }}
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.currency})
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Amount">
              <Input value={amount} onChange={(event) => setAmount(event.target.value)} />
            </FormField>
            <FormField label="Currency">
              <Input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} />
            </FormField>
            <FormField label="Paid at">
              <Input
                type="datetime-local"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </FormField>
          </div>
          <FormField label="Notes">
            <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </FormField>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950/70">
            <div className="border-b border-neutral-800 px-4 py-3">
              <h4 className="font-medium text-white">Allocations</h4>
              <p className="mt-1 text-xs text-neutral-400">
                Auto-filled from unpaid placements. You can adjust per placement.
              </p>
            </div>
            <div className="divide-y divide-neutral-800">
              {sale.placements.map((placement) => (
                <div
                  key={placement.id}
                  className="grid gap-3 px-4 py-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]"
                >
                  <div>
                    <p className="font-medium text-white">{placement.telegramChannelId}</p>
                    <p className="text-xs text-neutral-500">
                      {new Date(placement.scheduledAt).toLocaleString()} · {placement.status}
                    </p>
                  </div>
                  <div className="text-sm text-neutral-300">
                    Agreed {placement.agreedPrice} {placement.currency}
                  </div>
                  <div className="text-sm text-neutral-300">
                    Paid {placement.paidAllocatedAmount || "0"} {placement.currency}
                  </div>
                  <Input
                    value={allocationState[placement.id] ?? ""}
                    onChange={(event) =>
                      setAllocationState((current) => ({
                        ...current,
                        [placement.id]: event.target.value,
                      }))
                    }
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
            <h4 className="font-medium text-white">Payment summary</h4>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-neutral-400">Payment amount</dt>
                <dd className="text-white">{enteredAmount || 0} {currency}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-neutral-400">Allocated</dt>
                <dd className="text-white">{allocatedTotal} {currency}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-neutral-400">Unallocated</dt>
                <dd className={unallocated > 0 ? "text-amber-300" : "text-emerald-300"}>
                  {unallocated} {currency}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-neutral-400">Resulting status</dt>
                <dd className="text-white">
                  {unallocated > 0 ? "Unallocated warning" : "Fully allocated"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-950/50 p-4 text-sm text-neutral-400">
            Exchange rate preview uses backend settlement logic after save. The client only shows
            amount split and unallocated remainder.
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={async () => {
            await onSubmit({
              accountId,
              amount: enteredAmount,
              currency,
              paidAt: new Date(paidAt).toISOString(),
              notes: notes.trim() || undefined,
              allocations: allocations
                .filter((item) => item.amount > 0)
                .map((item) => ({
                  placementId: item.placement.id,
                  amount: item.amount,
                })),
            });
          }}
          disabled={busy || !accountId || enteredAmount <= 0}
        >
          Save payment
        </Button>
      </div>
    </Modal>
  );
}
