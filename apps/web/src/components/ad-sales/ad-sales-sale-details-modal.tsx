"use client";

import { useEffect, useState } from "react";
import type { TelegramAdSale } from "@telegram-system/shared";
import {
  SaleStatusActions,
  type SaleActionKey,
} from "@/components/ad-sales/sale-status-actions";
import {
  Button,
  Card,
  CustomSelect,
  DateInput,
  EmptyState,
  FormField,
  Input,
  Modal,
  TimeInput,
} from "@/components/ui/primitives";
import type { Account } from "@/lib/api";
import { currenciesApi } from "@/lib/api";
import {
  channelLocalDateKey,
  channelLocalTime,
  toNumber,
  zonedDateTimeToUtc,
} from "@/lib/telegram-ad-sales";
import { accountDisplayName } from "@/lib/account-display";

type SalePlacementEditDraft = {
  id: string;
  date: string;
  time: string;
  timezone: string;
  agreedPrice: string;
  recommendedPrice: string;
  minimumPrice: string;
  manualPriceReason: string;
};

type SalePaymentEditDraft = {
  id: string;
  accountId: string;
  amount: string;
  currency: string;
  paidDate: string;
  paidTime: string;
  notes: string;
};

function allocatePaymentDraft(
  amount: number,
  placements: SalePlacementEditDraft[],
) {
  let remaining = amount;
  return placements.flatMap((placement) => {
    const agreedPrice = toNumber(placement.agreedPrice);
    const allocation = Math.max(0, Math.min(remaining, agreedPrice));
    remaining -= allocation;
    return allocation > 0
      ? [{ placementId: placement.id, amount: allocation }]
      : [];
  });
}

export function SaleDetailsModal(props: {
  sale: TelegramAdSale | null;
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  settings: Awaited<ReturnType<typeof currenciesApi.getSettings>> | undefined;
  rates: Awaited<ReturnType<typeof currenciesApi.listRates>> | undefined;
  onSave: (
    sale: TelegramAdSale,
    draft: {
      placements: Array<{
        id: string;
        scheduledAt: string;
        timezone: string;
        agreedPrice: number;
        recommendedPrice: number;
        minimumPrice: number;
        currency: string;
        manualPriceReason: string | null;
      }>;
      payments: Array<{
        id: string;
        accountId: string;
        amount: number;
        currency: string;
        paidAt: string;
        notes: string | null;
        allocations: Array<{ placementId: string; amount: number }>;
      }>;
    },
  ) => Promise<void>;
  onAction: (
    sale: TelegramAdSale,
    action: SaleActionKey,
    placement?: TelegramAdSale["placements"][number],
  ) => Promise<void>;
}) {
  const [placementDrafts, setPlacementDrafts] = useState<
    SalePlacementEditDraft[]
  >([]);
  const [paymentDrafts, setPaymentDrafts] = useState<SalePaymentEditDraft[]>(
    [],
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!props.sale || !props.open) return;
    setPlacementDrafts(
      props.sale.placements.map((placement) => ({
        id: placement.id,
        date: channelLocalDateKey(placement.scheduledAt, placement.timezone),
        time: channelLocalTime(placement.scheduledAt, placement.timezone),
        timezone: placement.timezone,
        agreedPrice: placement.agreedPrice,
        recommendedPrice: placement.recommendedPrice,
        minimumPrice: placement.minimumPrice,
        manualPriceReason: placement.manualPriceReason ?? "",
      })),
    );
    setPaymentDrafts(
      (props.sale.payments ?? [])
        .filter((payment) => payment.status !== "VOIDED")
        .map((payment) => {
          const account = props.accounts.find(
            (item) => item.id === payment.accountId,
          );
          return {
            id: payment.id,
            accountId: payment.accountId,
            amount: payment.amount,
            currency: account?.currency ?? payment.currency,
            paidDate: payment.paidAt.slice(0, 10),
            paidTime: payment.paidAt.slice(11, 16),
            notes: payment.notes ?? "",
          };
        }),
    );
    setSaveError("");
  }, [props.accounts, props.open, props.sale]);

  if (!props.sale) return null;
  const editCurrency =
    paymentDrafts[0]?.currency ?? props.sale.settlementCurrency;

  const updatePlacementDraft = (
    id: string,
    patch: Partial<SalePlacementEditDraft>,
  ) => {
    setPlacementDrafts((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };
  const updatePaymentDraft = (
    id: string,
    patch: Partial<SalePaymentEditDraft>,
  ) => {
    setPaymentDrafts((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };
  const saveChanges = async () => {
    setSaveError("");
    setSaving(true);
    try {
      await props.onSave(props.sale!, {
        placements: placementDrafts.map((placement) => ({
          id: placement.id,
          scheduledAt: zonedDateTimeToUtc(
            placement.date,
            placement.time,
            placement.timezone,
          ).toISOString(),
          timezone: placement.timezone,
          agreedPrice: toNumber(placement.agreedPrice),
          recommendedPrice: toNumber(placement.recommendedPrice),
          minimumPrice: toNumber(placement.minimumPrice),
          currency: editCurrency,
          manualPriceReason: placement.manualPriceReason.trim() || null,
        })),
        payments: paymentDrafts.map((payment) => {
          const account = props.accounts.find(
            (item) => item.id === payment.accountId,
          );
          const amount = toNumber(payment.amount);
          return {
            id: payment.id,
            accountId: payment.accountId,
            amount,
            currency: account?.currency ?? payment.currency,
            paidAt: new Date(
              `${payment.paidDate}T${payment.paidTime || "00:00"}:00`,
            ).toISOString(),
            notes: payment.notes.trim() || null,
            allocations: allocatePaymentDraft(amount, placementDrafts),
          };
        }),
      });
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save changes.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.sale.title || props.sale.advertiserName}
      size="xl"
    >
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <Card>
            <h4 className="font-medium text-white">Summary</h4>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-400">Advertiser</dt>
                <dd>{props.sale.advertiserName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-400">Status</dt>
                <dd>{props.sale.status}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-400">Payment</dt>
                <dd>{props.sale.paymentStatus || "UNPAID"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-400">Total agreed</dt>
                <dd>
                  {props.sale.totalAgreedAmount} {props.sale.settlementCurrency}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-400">Total paid</dt>
                <dd>
                  {props.sale.totalPaidAmount} {props.sale.settlementCurrency}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-400">Outstanding</dt>
                <dd>
                  {props.sale.outstandingAmount} {props.sale.settlementCurrency}
                </dd>
              </div>
            </dl>
          </Card>
          <Card>
            <h4 className="mb-3 font-medium text-white">Sale actions</h4>
            <SaleStatusActions
              sale={props.sale}
              onAction={(action) => void props.onAction(props.sale!, action)}
            />
          </Card>
          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="font-medium text-white">Payments</h4>
              {paymentDrafts.length ? (
                <span className="text-xs text-neutral-500">
                  Finance transaction updates too
                </span>
              ) : null}
            </div>
            <div className="space-y-2">
              {paymentDrafts.map((payment) => (
                <div
                  key={payment.id}
                  className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3 text-sm"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <FormField label="Account">
                      <CustomSelect
                        value={payment.accountId}
                        onChange={(accountId) => {
                          const account = props.accounts.find(
                            (item) => item.id === accountId,
                          );
                          updatePaymentDraft(payment.id, {
                            accountId,
                            currency: account?.currency ?? payment.currency,
                          });
                        }}
                        options={props.accounts
                          .filter((account) => account.isActive)
                          .map((account) => ({
                            value: account.id,
                            label: `${accountDisplayName(account)} (${account.currency})`,
                            iconUrl:
                              account.iconPresentation?.type === "image"
                                ? account.iconPresentation.url
                                : undefined,
                            iconEmoji:
                              account.iconPresentation?.type === "unicode"
                                ? account.iconPresentation.value
                                : undefined,
                            iconFallback: account.name,
                          }))}
                      />
                    </FormField>
                    <FormField label={`Amount (${payment.currency})`}>
                      <Input
                        value={payment.amount}
                        inputMode="decimal"
                        onChange={(event) =>
                          updatePaymentDraft(payment.id, {
                            amount: event.target.value,
                          })
                        }
                      />
                    </FormField>
                    <FormField label="Paid date">
                      <DateInput
                        value={payment.paidDate}
                        onChange={(event) =>
                          updatePaymentDraft(payment.id, {
                            paidDate: event.target.value,
                          })
                        }
                      />
                    </FormField>
                    <FormField label="Paid time">
                      <TimeInput
                        value={payment.paidTime}
                        onChange={(event) =>
                          updatePaymentDraft(payment.id, {
                            paidTime: event.target.value,
                          })
                        }
                      />
                    </FormField>
                  </div>
                  <div className="mt-3">
                    <FormField label="Notes">
                      <Input
                        value={payment.notes}
                        onChange={(event) =>
                          updatePaymentDraft(payment.id, {
                            notes: event.target.value,
                          })
                        }
                      />
                    </FormField>
                  </div>
                </div>
              ))}
              {!paymentDrafts.length ? (
                <EmptyState text="No payments yet." />
              ) : null}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h4 className="mb-3 font-medium text-white">Placements</h4>
            <div className="space-y-3">
              {props.sale.placements.map((placement) => {
                const draft = placementDrafts.find(
                  (item) => item.id === placement.id,
                );
                return (
                  <div
                    key={placement.id}
                    className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">
                          {placement.telegramChannelId}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {new Date(placement.scheduledAt).toLocaleString()} ·{" "}
                          {placement.timezone}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-white">
                          {placement.agreedPrice} {editCurrency}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {placement.status}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-4 text-sm">
                      <FormField label="Date">
                        <DateInput
                          value={draft?.date ?? ""}
                          onChange={(event) =>
                            updatePlacementDraft(placement.id, {
                              date: event.target.value,
                            })
                          }
                        />
                      </FormField>
                      <FormField label="Time">
                        <TimeInput
                          value={draft?.time ?? ""}
                          onChange={(event) =>
                            updatePlacementDraft(placement.id, {
                              time: event.target.value,
                            })
                          }
                        />
                      </FormField>
                      <FormField label={`Price (${editCurrency})`}>
                        <Input
                          value={draft?.agreedPrice ?? placement.agreedPrice}
                          inputMode="decimal"
                          onChange={(event) =>
                            updatePlacementDraft(placement.id, {
                              agreedPrice: event.target.value,
                            })
                          }
                        />
                      </FormField>
                      <FormField label="Recommended">
                        <Input
                          value={
                            draft?.recommendedPrice ??
                            placement.recommendedPrice
                          }
                          inputMode="decimal"
                          onChange={(event) =>
                            updatePlacementDraft(placement.id, {
                              recommendedPrice: event.target.value,
                            })
                          }
                        />
                      </FormField>
                      <div>
                        Expected: {placement.expectedViews.toLocaleString()}
                      </div>
                      <div>
                        Paid allocation: {placement.paidAllocatedAmount || "0"}
                      </div>
                      <div>
                        Actual views: {placement.actualViewsFinal ?? "-"}
                      </div>
                      <div>Actual CPM: {placement.actualCpm ?? "-"}</div>
                    </div>
                    {toNumber(draft?.agreedPrice ?? placement.agreedPrice) <
                    toNumber(draft?.minimumPrice ?? placement.minimumPrice) ? (
                      <div className="mt-3">
                        <FormField label="Reason for low price">
                          <Input
                            value={draft?.manualPriceReason ?? ""}
                            onChange={(event) =>
                              updatePlacementDraft(placement.id, {
                                manualPriceReason: event.target.value,
                              })
                            }
                          />
                        </FormField>
                      </div>
                    ) : null}
                    {placement.managedPostId ? (
                      <p className="mt-2 text-xs text-neutral-500">
                        Managed post: {placement.managedPostId} · Deletion:{" "}
                        {placement.plannedDeleteAt || "n/a"}
                      </p>
                    ) : null}
                    <div className="mt-4">
                      <SaleStatusActions
                        sale={props.sale!}
                        placement={placement}
                        onAction={(action) =>
                          void props.onAction(props.sale!, action, placement)
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          {saveError ? (
            <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
              {saveError}
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button onClick={() => void saveChanges()} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
