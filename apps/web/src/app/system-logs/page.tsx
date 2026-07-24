"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Pagination } from "@/components/ui/pagination";
import {
  Button,
  ConfirmDeleteModal,
  CustomSelect,
  Input,
  Modal,
  Skeleton,
} from "@/components/ui/primitives";
import { useAuth } from "@/hooks/use-auth";
import { applicationLogsApi, type WorkspaceRole } from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";
import type {
  ApplicationLog,
  ApplicationLogKind,
  ApplicationLogLevel,
  ApplicationLogsQuery,
} from "@telegram-system/shared";

const LEVELS: ApplicationLogLevel[] = ["debug", "info", "warn", "error"];
const KINDS: ApplicationLogKind[] = [
  "http",
  "application",
  "integration",
  "cron",
  "client",
  "audit",
];
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function parseList(value: string | null) {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

function parseLimit(value: string | null) {
  const parsed = Number(value || 50);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
}

function selectToneForLevel(level?: string) {
  if (level === "error") return "danger" as const;
  if (level === "warn") return "warning" as const;
  if (level === "info") return "info" as const;
  if (level === "debug") return "muted" as const;
  return "muted" as const;
}

function selectToneForKind(kind?: string) {
  if (kind === "integration") return "success" as const;
  if (kind === "cron") return "warning" as const;
  if (kind === "client") return "danger" as const;
  if (kind === "http" || kind === "audit") return "info" as const;
  return "muted" as const;
}

function selectToneForMethod(method?: string) {
  if (method === "POST") return "success" as const;
  if (method === "PATCH") return "warning" as const;
  if (method === "DELETE") return "danger" as const;
  if (method === "GET" || method === "PUT") return "info" as const;
  return "muted" as const;
}

function badgeClassForLevel(level?: string | null) {
  if (level === "error") {
    return "border-red-500/30 bg-red-500/10 text-red-200";
  }
  if (level === "warn") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  if (level === "info") {
    return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  }
  if (level === "debug") {
    return "border-slate-500/30 bg-slate-500/10 text-slate-200";
  }
  return "border-neutral-700 bg-neutral-800 text-neutral-200";
}

function badgeClassForKind(kind?: string | null) {
  if (kind === "integration") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  if (kind === "cron") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  if (kind === "client") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  }
  if (kind === "http") {
    return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  }
  if (kind === "audit") {
    return "border-cyan-500/30 bg-cyan-500/10 text-cyan-200";
  }
  return "border-slate-500/30 bg-slate-500/10 text-slate-200";
}

function badgeClassForMethod(method?: string | null) {
  if (method === "POST") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  if (method === "PATCH") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  if (method === "DELETE") {
    return "border-red-500/30 bg-red-500/10 text-red-200";
  }
  if (method === "GET" || method === "PUT") {
    return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  }
  return "border-slate-500/30 bg-slate-500/10 text-slate-200";
}

function badgeClassForStatus(statusCode?: number | null) {
  if (statusCode == null) {
    return "border-neutral-700 bg-neutral-800 text-neutral-300";
  }
  if (statusCode >= 500) {
    return "border-red-500/30 bg-red-500/10 text-red-200";
  }
  if (statusCode >= 400) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  if (statusCode >= 200) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  return "border-slate-500/30 bg-slate-500/10 text-slate-200";
}

function logRowGlowClass(log: ApplicationLog) {
  if (log.level === "error") return "hover:bg-red-950/20";
  if (log.level === "warn") return "hover:bg-amber-950/20";
  if (log.level === "info") return "hover:bg-sky-950/20";
  return "hover:bg-slate-900/60";
}

function DataBadge({
  value,
  className,
}: {
  value: string;
  className: string;
}) {
  return (
    <span
      className={`inline-flex min-w-[4.5rem] items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${className}`}
    >
      {value}
    </span>
  );
}

function DetailField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-sm text-neutral-100 ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function LogTableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950/70">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-neutral-800 bg-neutral-900/90 text-neutral-400">
          <tr>
            {[
              "Time",
              "Level",
              "Kind",
              "Event",
              "Source",
              "Method",
              "Endpoint",
              "Status",
              "Duration",
              "Message",
              "Correlation",
            ].map((label) => (
              <th key={label} className="px-3 py-3">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }, (_, index) => (
            <tr key={index} className="border-b border-neutral-800/80">
              <td className="px-3 py-4">
                <Skeleton className="h-4 w-32" />
              </td>
              <td className="px-3 py-4">
                <Skeleton className="h-6 w-16 rounded-full" />
              </td>
              <td className="px-3 py-4">
                <Skeleton className="h-6 w-20 rounded-full" />
              </td>
              <td className="px-3 py-4">
                <Skeleton className="h-4 w-40" />
              </td>
              <td className="px-3 py-4">
                <Skeleton className="h-4 w-36" />
              </td>
              <td className="px-3 py-4">
                <Skeleton className="h-6 w-16 rounded-full" />
              </td>
              <td className="px-3 py-4">
                <Skeleton className="h-4 w-48" />
              </td>
              <td className="px-3 py-4">
                <Skeleton className="h-6 w-16 rounded-full" />
              </td>
              <td className="px-3 py-4">
                <Skeleton className="h-4 w-16" />
              </td>
              <td className="px-3 py-4">
                <Skeleton className="h-4 w-72 max-w-full" />
              </td>
              <td className="px-3 py-4">
                <Skeleton className="h-4 w-36" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useLogFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useMemo<ApplicationLogsQuery>(
    () => ({
      search: searchParams.get("search") || undefined,
      correlationId: searchParams.get("correlationId") || undefined,
      levels: parseList(searchParams.get("levels")) as ApplicationLogLevel[],
      kinds: parseList(searchParams.get("kinds")) as ApplicationLogKind[],
      sources: parseList(searchParams.get("sources")),
      events: parseList(searchParams.get("events")),
      methods: parseList(searchParams.get("methods")),
      endpoint: searchParams.get("endpoint") || undefined,
      userId: searchParams.get("userId") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      limit: parseLimit(searchParams.get("limit")),
    }),
    [searchParams],
  );

  const setFilter = (key: string, value?: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`);
  };

  return { filters, setFilter };
}

export default function SystemLogsPage() {
  const { workspace } = useAuth();
  const { pushToast } = useAppToast();
  const queryClient = useQueryClient();
  const role = workspace?.role as WorkspaceRole | undefined;
  const canView = role === "owner" || role === "admin";
  const { filters, setFilter } = useLogFilters();
  const [selected, setSelected] = useState<ApplicationLog | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const handleCopy = async (value: string, label = "Copied successfully.") => {
    try {
      await navigator.clipboard.writeText(value);
      pushToast(label, "success");
    } catch {
      pushToast("Failed to copy.", "error");
    }
  };

  const updateFilter = (key: string, value?: string | null) => {
    setCursor(undefined);
    setCursorStack([]);
    setFilter(key, value);
  };

  const filterOptions = useQuery({
    queryKey: ["application-log-filter-options"],
    queryFn: applicationLogsApi.filterOptions,
    enabled: canView,
  });

  const logsQuery = useQuery({
    queryKey: ["application-logs", filters, cursor],
    enabled: canView,
    placeholderData: keepPreviousData,
    queryFn: () =>
      applicationLogsApi.list({
        ...filters,
        cursor,
      }),
  });

  const clearMutation = useMutation({
    mutationFn: applicationLogsApi.clear,
    onSuccess: async (result) => {
      setDeleteModalOpen(false);
      setCursor(undefined);
      setCursorStack([]);
      setSelected(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["application-logs"] }),
        queryClient.invalidateQueries({ queryKey: ["application-log-filter-options"] }),
      ]);
      pushToast(
        result.deletedCount
          ? `Deleted ${result.deletedCount} logs.`
          : "No logs to delete.",
        "success",
      );
    },
    onError: () => {
      pushToast("Failed to delete logs.", "error");
    },
  });

  if (!canView) {
    return (
      <AppShell>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          Only workspace owners and admins can view system logs.
        </div>
      </AppShell>
    );
  }

  const items = logsQuery.data?.items ?? [];
  const currentPage = cursorStack.length + 1;
  const pageLimit = filters.limit || 50;
  const showSkeleton = logsQuery.isLoading && !logsQuery.data;
  const isPageTransitionLoading = logsQuery.isFetching && !!logsQuery.data;
  const totalItemsForPagination =
    logsQuery.data?.hasMore || currentPage > 1
      ? currentPage * pageLimit + (logsQuery.data?.hasMore ? 1 : 0)
      : items.length;
  const totalPagesForPagination =
    logsQuery.data?.hasMore || currentPage > 1
      ? currentPage + (logsQuery.data?.hasMore ? 1 : 0)
      : 1;

  const levelOptions = [
    { value: "", label: "All levels", tone: "muted" as const },
    ...LEVELS.map((level) => ({
      value: level,
      label: level,
      tone: selectToneForLevel(level),
    })),
  ];
  const kindOptions = [
    { value: "", label: "All kinds", tone: "muted" as const },
    ...KINDS.map((kind) => ({
      value: kind,
      label: kind,
      tone: selectToneForKind(kind),
    })),
  ];
  const sourceOptions = [
    { value: "", label: "All sources", tone: "muted" as const },
    ...(filterOptions.data?.sources || []).map((source) => ({
      value: source,
      label: source,
      tone: "muted" as const,
    })),
  ];
  const eventOptions = [
    { value: "", label: "All events", tone: "muted" as const },
    ...(filterOptions.data?.events || []).map((eventName) => ({
      value: eventName,
      label: eventName,
      tone: "muted" as const,
    })),
  ];
  const methodOptions = [
    { value: "", label: "All methods", tone: "muted" as const },
    ...METHODS.map((method) => ({
      value: method,
      label: method,
      tone: selectToneForMethod(method),
    })),
  ];
  return (
    <AppShell>
      <div className="space-y-4">
        <div className="rounded-2xl border border-neutral-800 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_28%),#0a0a0a] p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                System Logs
              </h1>
              <p className="mt-1 text-sm text-neutral-400">
                Structured backend, integration and client runtime logs.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void logsQuery.refetch()}
                disabled={logsQuery.isFetching}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-50"
                aria-label="Refresh logs"
              >
                <RefreshCw
                  size={16}
                  className={logsQuery.isFetching ? "animate-spin" : ""}
                />
              </button>
              <Button
                variant="secondary"
                onClick={() =>
                  void handleCopy(
                    items.map((item) => JSON.stringify(item)).join("\n"),
                    "Filtered logs copied successfully.",
                  )
                }
                disabled={!items.length}
                className="inline-flex items-center gap-2"
              >
                <Copy size={14} />
                Copy NDJSON
              </Button>
              <Button
                variant="danger"
                onClick={() => setDeleteModalOpen(true)}
                disabled={clearMutation.isPending}
                className="inline-flex items-center gap-2"
              >
                <Trash2 size={14} />
                Delete all logs
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4 backdrop-blur md:grid-cols-4">
          <Input
            placeholder="Search message or event"
            value={filters.search || ""}
            onChange={(event) =>
              updateFilter("search", event.target.value || null)
            }
          />
          <Input
            placeholder="Correlation ID"
            value={filters.correlationId || ""}
            onChange={(event) =>
              updateFilter("correlationId", event.target.value || null)
            }
          />
          <CustomSelect
            value={filters.levels?.[0] || ""}
            onChange={(value) => updateFilter("levels", value || null)}
            options={levelOptions}
          />
          <CustomSelect
            value={filters.kinds?.[0] || ""}
            onChange={(value) => updateFilter("kinds", value || null)}
            options={kindOptions}
          />
          <CustomSelect
            value={filters.sources?.[0] || ""}
            onChange={(value) => updateFilter("sources", value || null)}
            options={sourceOptions}
          />
          <CustomSelect
            value={filters.events?.[0] || ""}
            onChange={(value) => updateFilter("events", value || null)}
            options={eventOptions}
          />
          <CustomSelect
            value={filters.methods?.[0] || ""}
            onChange={(value) => updateFilter("methods", value || null)}
            options={methodOptions}
          />
          <Input
            placeholder="Endpoint"
            value={filters.endpoint || ""}
            onChange={(event) =>
              updateFilter("endpoint", event.target.value || null)
            }
          />
        </div>

        {showSkeleton ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-400">
              <Skeleton className="h-9 w-20 rounded-full" />
              <Skeleton className="h-9 w-28 rounded-full" />
              <Skeleton className="h-9 w-24 rounded-full" />
            </div>
          </div>
        ) : (
          <Pagination
            page={currentPage}
            pageSize={pageLimit}
            totalItems={totalItemsForPagination}
            totalPages={totalPagesForPagination}
            hasNextPage={Boolean(logsQuery.data?.hasMore)}
            hasPreviousPage={currentPage > 1}
            onPageChange={(nextPage) => {
              if (nextPage === currentPage || logsQuery.isFetching) {
                return;
              }

              if (nextPage < currentPage) {
                const nextStack = cursorStack.slice(0, Math.max(0, nextPage - 1));
                const nextCursor =
                  nextPage <= 1 ? undefined : nextStack[nextStack.length - 1];
                setCursorStack(nextStack);
                setCursor(nextCursor || undefined);
                return;
              }

              if (nextPage === currentPage + 1 && logsQuery.data?.nextCursor) {
                setCursorStack((value) => [...value, cursor || ""]);
                setCursor(logsQuery.data.nextCursor || undefined);
              }
            }}
            onPageSizeChange={(nextPageSize) => {
              updateFilter("limit", String(nextPageSize));
            }}
            loading={isPageTransitionLoading}
            disabled={logsQuery.isFetching}
          />
        )}

        {showSkeleton ? (
          <LogTableSkeleton />
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/70">
            {isPageTransitionLoading ? (
              <div className="absolute inset-0 z-10 bg-neutral-950/60 backdrop-blur-[1px]">
                <LogTableSkeleton />
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-neutral-800 bg-neutral-900/90 text-neutral-400">
                  <tr>
                    <th className="px-3 py-3">Time</th>
                    <th className="px-3 py-3">Level</th>
                    <th className="px-3 py-3">Kind</th>
                    <th className="px-3 py-3">Event</th>
                    <th className="px-3 py-3">Source</th>
                    <th className="px-3 py-3">Method</th>
                    <th className="px-3 py-3">Endpoint</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Duration</th>
                    <th className="px-3 py-3">Message</th>
                    <th className="px-3 py-3">Correlation</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className={`cursor-pointer border-b border-neutral-800/80 transition ${logRowGlowClass(
                        item,
                      )}`}
                      onClick={() => setSelected(item)}
                    >
                      <td className="px-3 py-3 whitespace-nowrap text-neutral-300">
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-3">
                        <DataBadge
                          value={item.level}
                          className={badgeClassForLevel(item.level)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <DataBadge
                          value={item.kind}
                          className={badgeClassForKind(item.kind)}
                        />
                      </td>
                      <td className="px-3 py-3 font-medium text-neutral-100">
                        {item.event}
                      </td>
                      <td className="px-3 py-3 text-neutral-300">
                        {item.source || "-"}
                      </td>
                      <td className="px-3 py-3">
                        <DataBadge
                          value={item.method || "-"}
                          className={badgeClassForMethod(item.method)}
                        />
                      </td>
                      <td className="px-3 py-3 text-neutral-200">
                        {item.endpoint || item.path || "-"}
                      </td>
                      <td className="px-3 py-3">
                        <DataBadge
                          value={item.statusCode != null ? String(item.statusCode) : "-"}
                          className={badgeClassForStatus(item.statusCode)}
                        />
                      </td>
                      <td className="px-3 py-3 text-neutral-300">
                        {item.durationMs != null ? `${item.durationMs} ms` : "-"}
                      </td>
                      <td className="max-w-[26rem] px-3 py-3 text-neutral-200">
                        <div className="truncate">{item.message}</div>
                      </td>
                      <td className="px-3 py-3 text-neutral-400">
                        {item.correlationId || "-"}
                      </td>
                    </tr>
                  ))}
                  {!logsQuery.isLoading && !items.length ? (
                    <tr>
                      <td
                        colSpan={11}
                        className="px-4 py-14 text-center text-sm text-neutral-500"
                      >
                        No logs matched the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <Modal
          open={!!selected}
          onClose={() => setSelected(null)}
          title={selected?.event || "Log details"}
          size="xl"
        >
          {selected ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-neutral-800 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_24%),#0a0a0a] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <DataBadge
                    value={selected.level}
                    className={badgeClassForLevel(selected.level)}
                  />
                  <DataBadge
                    value={selected.kind}
                    className={badgeClassForKind(selected.kind)}
                  />
                  <DataBadge
                    value={selected.method || "-"}
                    className={badgeClassForMethod(selected.method)}
                  />
                  <DataBadge
                    value={
                      selected.statusCode != null ? String(selected.statusCode) : "-"
                    }
                    className={badgeClassForStatus(selected.statusCode)}
                  />
                </div>
                <p className="mt-3 text-base font-medium text-white">
                  {selected.message}
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  {new Date(selected.createdAt).toLocaleString()}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    void handleCopy(
                      selected.correlationId || "",
                      "Correlation ID copied successfully.",
                    )
                  }
                >
                  Copy correlation ID
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void handleCopy(
                      selected.message,
                      "Message copied successfully.",
                    )
                  }
                >
                  Copy message
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void handleCopy(
                      JSON.stringify(selected, null, 2),
                      "Log JSON copied successfully.",
                    )
                  }
                >
                  Copy log JSON
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <DetailField label="Event" value={selected.event} mono />
                <DetailField
                  label="Source"
                  value={selected.source || "-"}
                  mono
                />
                <DetailField
                  label="Endpoint"
                  value={selected.endpoint || "-"}
                  mono
                />
                <DetailField label="Path" value={selected.path || "-"} mono />
                <DetailField
                  label="Correlation ID"
                  value={selected.correlationId || "-"}
                  mono
                />
                <DetailField
                  label="Request ID"
                  value={selected.requestId || "-"}
                  mono
                />
                <DetailField
                  label="Duration"
                  value={
                    selected.durationMs != null ? `${selected.durationMs} ms` : "-"
                  }
                />
                <DetailField
                  label="Workspace User"
                  value={selected.user?.name || selected.user?.email || "-"}
                />
              </div>

              {selected.metadata ? (
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                    Metadata
                  </p>
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-black/50 p-3 text-xs text-neutral-200">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                </div>
              ) : null}

              {selected.stack ? (
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                    Stack trace
                  </p>
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-black/50 p-3 text-xs text-neutral-200">
                    {selected.stack}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </Modal>

        <ConfirmDeleteModal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={() => clearMutation.mutateAsync()}
          entityName="DELETE LOGS"
          label="Delete all logs"
          description="This removes every application log in the current workspace."
        />
      </div>
    </AppShell>
  );
}
