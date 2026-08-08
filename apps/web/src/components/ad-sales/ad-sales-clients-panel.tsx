"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MemberSelect } from "@/components/workspace/member-select";
import { Pagination } from "@/components/ui/pagination";
import {
  Card,
  ErrorState,
  FormField,
  Input,
  Select,
  TableLoadingState,
  Skeleton,
} from "@/components/ui/primitives";
import { AdSalesClientsTable } from "@/components/ad-sales/ad-sales-clients-table";
import type { CurrencySettings, ExchangeRate } from "@/lib/api";
import { telegramAdSalesApi } from "@/lib/api";
import { formatMoneyPreview } from "@/lib/money";
import { telegramAdSalesKeys } from "@/lib/telegram-ad-sales-query";

const panelClass = "rounded-[22px] border border-neutral-800 bg-[#171717]";
const tileClass =
  "rounded-[18px] border border-slate-800/80 bg-[#0b1220] p-4 shadow-[inset_0_1px_0_rgba(96,165,250,0.05)]";
const clientsCacheOptions = {
  staleTime: 2 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: false,
} as const;

const statusOptions = [
  { value: "", label: "All statuses" },
  { value: "LEAD", label: "Lead" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "LOST", label: "Lost" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "ARCHIVED", label: "Archived" },
];

const lifecycleOptions = [
  { value: "", label: "All lifecycle stages" },
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "CUSTOMER", label: "Customer" },
  { value: "REPEAT_CUSTOMER", label: "Repeat customer" },
  { value: "REACTIVATION", label: "Reactivation" },
  { value: "CHURNED", label: "Churned" },
];

type ArchivedFilter = "active" | "archived" | "all";

export function AdSalesClientsPanel({
  settings,
  rates,
}: {
  settings?: CurrencySettings;
  rates?: ExchangeRate[];
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [lifecycleStage, setLifecycleStage] = useState("");
  const [ownerMemberId, setOwnerMemberId] = useState("");
  const [archived, setArchived] = useState<ArchivedFilter>("active");

  const queryParams = useMemo(
    () => ({
      page,
      pageSize,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(status ? { status } : {}),
      ...(lifecycleStage ? { lifecycleStage } : {}),
      ...(ownerMemberId ? { ownerMemberId } : {}),
      ...(archived === "all" ? {} : { archived: archived === "archived" }),
    }),
    [archived, lifecycleStage, ownerMemberId, page, pageSize, search, status],
  );

  const clientsQuery = useQuery({
    queryKey: telegramAdSalesKeys.crmAdvertisers(queryParams),
    queryFn: () => telegramAdSalesApi.listCrmAdvertisers(queryParams),
    ...clientsCacheOptions,
  });

  const clients = clientsQuery.data?.items ?? [];
  const pageRevenue = clients.reduce(
    (sum, client) => sum + Number(client.totalRevenueInPrimaryCurrency ?? 0),
    0,
  );
  const moneySettings = settings ?? {
    primaryCurrency: "USD",
    secondaryCurrency: "UAH",
    tertiaryCurrency: "UAH",
    currencyDisplayMode: "code" as const,
  };
  const urgentCount = clients.filter((client) =>
    ["HIGH", "URGENT"].includes(String(client.urgency ?? "").toUpperCase()),
  ).length;
  const nowMs = clientsQuery.dataUpdatedAt;
  const overdueTaskCount = clients.filter((client) =>
    client.nextOpenTask?.dueAt
      ? new Date(client.nextOpenTask.dueAt).getTime() < nowMs
      : false,
  ).length;

  const resetPage = (callback: () => void) => {
    setPage(1);
    callback();
  };

  return (
    <div className="space-y-5">
      <Card className={panelClass}>
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_180px] xl:items-end">
          <FormField label="Search">
            <Input
              value={search}
              onChange={(event) =>
                resetPage(() => setSearch(event.target.value))
              }
              placeholder="Name, company, Telegram, contact"
            />
          </FormField>
          <FormField label="Status">
            <Select
              value={status}
              onChange={(event) =>
                resetPage(() => setStatus(event.target.value))
              }
            >
              {statusOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Lifecycle">
            <Select
              value={lifecycleStage}
              onChange={(event) =>
                resetPage(() => setLifecycleStage(event.target.value))
              }
            >
              {lifecycleOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Owner">
            <MemberSelect
              value={ownerMemberId}
              onChange={(value) => resetPage(() => setOwnerMemberId(value))}
              includeAll
            />
          </FormField>
          <FormField label="Archive">
            <Select
              value={archived}
              onChange={(event) =>
                resetPage(() =>
                  setArchived(event.target.value as ArchivedFilter),
                )
              }
            >
              <option value="active">Active only</option>
              <option value="archived">Archived only</option>
              <option value="all">All clients</option>
            </Select>
          </FormField>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Clients"
          value={
            clientsQuery.isLoading
              ? <MetricTileSkeleton />
              : String(clientsQuery.data?.pagination.totalItems ?? 0)
          }
        />
        <MetricTile
          label="High value"
          value={
            clientsQuery.isLoading
              ? <MetricTileSkeleton />
              : String(clients.filter((client) => client.isHighValue).length)
          }
        />
        <MetricTile
          label="Needs action"
          value={clientsQuery.isLoading ? <MetricTileSkeleton /> : String(urgentCount)}
        />
        <MetricTile
          label="Page revenue"
          value={
            clientsQuery.isLoading ? (
              <MetricTileSkeleton />
            ) : (
              formatMoneyPreview({
                amount: pageRevenue,
                currency: moneySettings.primaryCurrency,
                settings: moneySettings,
                rates,
              })
            )
          }
        />
      </div>

      {clientsQuery.isLoading ? (
        <TableLoadingState columns={8} rows={6} />
      ) : null}
      {clientsQuery.error ? (
        <ErrorState text="Could not load ad-sales clients." />
      ) : null}
      {!clientsQuery.isLoading && !clientsQuery.error ? (
        <AdSalesClientsTable
          clients={clients}
          settings={moneySettings}
          rates={rates}
          overdueTaskCount={overdueTaskCount}
        />
      ) : null}

      {clientsQuery.data?.pagination ? (
        <Pagination
          page={clientsQuery.data.pagination.page}
          pageSize={clientsQuery.data.pagination.pageSize}
          totalItems={clientsQuery.data.pagination.totalItems}
          totalPages={clientsQuery.data.pagination.totalPages}
          hasNextPage={clientsQuery.data.pagination.hasNextPage}
          hasPreviousPage={clientsQuery.data.pagination.hasPreviousPage}
          onPageChange={setPage}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setPage(1);
          }}
        />
      ) : null}
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card className={tileClass}>
      <p className="text-xs font-medium uppercase text-neutral-500">{label}</p>
      <div className="mt-2 whitespace-pre-line text-2xl font-semibold text-white">{value}</div>
    </Card>
  );
}

function MetricTileSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-label="Loading metric">
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-4 w-16" />
    </div>
  );
}
