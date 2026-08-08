"use client";

import type { TelegramAdSale } from "@telegram-system/shared";
import { SaleStatusActions } from "@/components/ad-sales/sale-status-actions";
import { MemberSelect } from "@/components/workspace/member-select";
import { MoneyStack } from "@/components/ui/money-stack";
import { Pagination } from "@/components/ui/pagination";
import {
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  Select,
  TableLoadingState,
} from "@/components/ui/primitives";
import { currenciesApi } from "@/lib/api";

const adSalesPanelClass =
  "rounded-[22px] border border-neutral-800 bg-[#171717]";

function saleChannelCount(sale: TelegramAdSale) {
  const channels = new Set(
    sale.placements.map(
      (placement) =>
        placement.telegramChannelId || placement.telegramChannelNetworkId,
    ),
  );
  const count = channels.size;
  if (count <= 0) return "-";
  if (count === 1) return "1 channel";
  return `${count} channels`;
}

function saleStatusTone(status: TelegramAdSale["status"]) {
  if (status === "CONFIRMED" || status === "COMPLETED") return "emerald";
  if (status === "RESERVED" || status === "IN_PROGRESS") return "blue";
  if (status === "CANCELLED") return "red";
  return "neutral";
}

function paymentStatusTone(status: string) {
  if (status === "PAID") return "emerald";
  if (status === "PARTIALLY_PAID" || status === "OVERPAID") return "amber";
  return "neutral";
}

function EnumPill({ label, tone }: { label: string; tone: string }) {
  const classes: Record<string, string> = {
    emerald: "border-emerald-700 bg-emerald-900/30 text-emerald-200",
    blue: "border-blue-700 bg-blue-900/30 text-blue-200",
    amber: "border-amber-700 bg-amber-900/30 text-amber-200",
    red: "border-red-700 bg-red-900/30 text-red-200",
    neutral: "border-neutral-700 bg-neutral-900 text-neutral-300",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${classes[tone] ?? classes.neutral}`}
    >
      {label}
    </span>
  );
}

export function SalesTab(props: {
  sales: TelegramAdSale[];
  loading: boolean;
  error: unknown;
  page: number;
  pageSize: number;
  pagination?: {
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    page: number;
    pageSize: number;
  };
  onPageChange: (value: number) => void;
  onPageSizeChange: (value: number) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  paymentStatusFilter: string;
  onPaymentStatusFilterChange: (value: string) => void;
  responsibleMemberId: string;
  onResponsibleMemberIdChange: (value: string) => void;
  underpricedOnly: boolean;
  onUnderpricedOnlyChange: (value: boolean) => void;
  unpaidOnly: boolean;
  onUnpaidOnlyChange: (value: boolean) => void;
  settings: Awaited<ReturnType<typeof currenciesApi.getSettings>> | undefined;
  rates: Awaited<ReturnType<typeof currenciesApi.listRates>> | undefined;
  onOpenSale: (saleId: string) => void;
}) {
  const statusOptions = [
    { value: "", label: "All statuses" },
    { value: "DRAFT", label: "Draft" },
    { value: "RESERVED", label: "Reserved" },
    { value: "CONFIRMED", label: "Confirmed" },
    { value: "IN_PROGRESS", label: "In progress" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
  ];
  const paymentStatusOptions = [
    { value: "", label: "All payment states" },
    { value: "UNPAID", label: "Unpaid" },
    { value: "PARTIALLY_PAID", label: "Partially paid" },
    { value: "PAID", label: "Paid" },
    { value: "OVERPAID", label: "Overpaid" },
  ];

  return (
    <div className="space-y-5">
      <Card className={adSalesPanelClass}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] xl:items-end">
          <FormField label="Search">
            <Input
              value={props.search}
              onChange={(event) => props.onSearchChange(event.target.value)}
            />
          </FormField>
          <FormField label="Status">
            <Select
              value={props.statusFilter}
              onChange={(event) =>
                props.onStatusFilterChange(event.target.value)
              }
            >
              {statusOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Payment status">
            <Select
              value={props.paymentStatusFilter}
              onChange={(event) =>
                props.onPaymentStatusFilterChange(event.target.value)
              }
            >
              {paymentStatusOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Responsible">
            <MemberSelect
              value={props.responsibleMemberId}
              onChange={props.onResponsibleMemberIdChange}
              includeAll
            />
          </FormField>
          <label className="flex">
            <span className="inline-flex h-[38px] items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-950/70 px-4 text-sm font-medium text-neutral-200">
              <span className="relative inline-flex h-5 w-5 items-center justify-center">
                <input
                  type="checkbox"
                  checked={props.underpricedOnly}
                  onChange={(event) =>
                    props.onUnderpricedOnlyChange(event.target.checked)
                  }
                  className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-neutral-600 bg-neutral-900 checked:border-blue-500 checked:bg-blue-600"
                />
                <span className="pointer-events-none absolute text-xs font-bold text-white opacity-0 peer-checked:opacity-100">
                  ✓
                </span>
              </span>
              Underpriced only
            </span>
          </label>
          <label className="flex">
            <span className="inline-flex h-[38px] items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-950/70 px-4 text-sm font-medium text-neutral-200">
              <span className="relative inline-flex h-5 w-5 items-center justify-center">
                <input
                  type="checkbox"
                  checked={props.unpaidOnly}
                  onChange={(event) =>
                    props.onUnpaidOnlyChange(event.target.checked)
                  }
                  className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-neutral-600 bg-neutral-900 checked:border-blue-500 checked:bg-blue-600"
                />
                <span className="pointer-events-none absolute text-xs font-bold text-white opacity-0 peer-checked:opacity-100">
                  ✓
                </span>
              </span>
              Unpaid only
            </span>
          </label>
        </div>
      </Card>

      {props.loading ? <TableLoadingState columns={8} rows={6} /> : null}
      {props.error ? <ErrorState text="Could not load ad sales." /> : null}
      {!props.loading && !props.error ? (
        <div className={adSalesPanelClass}>
          <div className="table-scroll w-full">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-neutral-900 text-xs uppercase text-neutral-400">
                <tr>
                  <th className="px-4 py-3">Sale</th>
                  <th className="px-4 py-3">Advertiser</th>
                  <th className="px-4 py-3">Channels</th>
                  <th className="px-4 py-3">Nearest placement</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Total agreed</th>
                  <th className="px-4 py-3">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {props.sales.map((sale) => {
                  const nearestPlacement = [...sale.placements].sort(
                    (left, right) =>
                      left.scheduledAt.localeCompare(right.scheduledAt),
                  )[0];
                  return (
                    <tr
                      key={sale.id}
                      className="cursor-pointer bg-neutral-950 transition hover:bg-neutral-900/60"
                      onClick={() => props.onOpenSale(sale.id)}
                    >
                      <td className="px-4 py-4">
                        <p className="font-medium text-white">
                          {sale.title || "Untitled sale"}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {new Date(sale.createdAt).toLocaleString()}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-white">{sale.advertiserName}</p>
                        <p className="text-xs text-neutral-500">
                          {sale.advertiserTelegram ||
                            sale.advertiserContact ||
                            "-"}
                        </p>
                      </td>
                      <td className="px-4 py-4">{saleChannelCount(sale)}</td>
                      <td className="px-4 py-4">
                        {nearestPlacement
                          ? new Date(
                              nearestPlacement.scheduledAt,
                            ).toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-4 py-4">
                        <EnumPill
                          label={sale.status.replaceAll("_", " ")}
                          tone={saleStatusTone(sale.status)}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <EnumPill
                          label={(sale.paymentStatus || "UNPAID").replaceAll(
                            "_",
                            " ",
                          )}
                          tone={paymentStatusTone(
                            sale.paymentStatus || "UNPAID",
                          )}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <MoneyStack
                          amount={Number(sale.totalAgreedAmount || 0)}
                          currency={sale.settlementCurrency}
                          settings={props.settings}
                          rates={props.rates}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <MoneyStack
                          amount={Number(sale.outstandingAmount || 0)}
                          currency={sale.settlementCurrency}
                          settings={props.settings}
                          rates={props.rates}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!props.sales.length ? (
            <div className="p-4">
              <EmptyState text="No sales matched the current filters." />
            </div>
          ) : null}
        </div>
      ) : null}

      {props.pagination ? (
        <Pagination
          page={props.pagination.page}
          pageSize={props.pagination.pageSize}
          totalItems={props.pagination.totalItems}
          totalPages={props.pagination.totalPages}
          hasNextPage={props.pagination.hasNextPage}
          hasPreviousPage={props.pagination.hasPreviousPage}
          onPageChange={props.onPageChange}
          onPageSizeChange={props.onPageSizeChange}
        />
      ) : null}
    </div>
  );
}
