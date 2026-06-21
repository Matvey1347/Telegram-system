"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { TelegramEntityAvatar } from "@/components/telegram/telegram-entity-avatar";
import {
  Button,
  EmptyState,
  EntityCard,
  FormField,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Textarea,
  ToastStack,
  type ToastItem,
} from "@/components/ui/primitives";
import {
  telegramChannelNetworksApi,
  telegramChannelsApi,
  type TelegramChannel,
  type TelegramChannelNetworkChannelSummary,
  type TelegramChannelNetworkKpiStatus,
} from "@/lib/api";

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: unknown, decimals = 0) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return toNumber(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function formatPercent(value: unknown, decimals = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `${formatNumber(value, decimals)}%`;
}

function kpiBadgeClass(status?: TelegramChannelNetworkKpiStatus) {
  if (status === "good") return "border-emerald-700 text-emerald-200";
  if (status === "acceptable") return "border-yellow-700 text-yellow-200";
  if (status === "bad") return "border-rose-700 text-rose-200";
  return "border-slate-700 text-slate-300";
}

function decisionText(status?: TelegramChannelNetworkKpiStatus) {
  if (status === "good") return "Network performs well. Candidate for scaling.";
  if (status === "acceptable")
    return "Network is acceptable. Continue testing carefully.";
  if (status === "bad")
    return "Network has weak KPI. Do not scale before fixing traffic/source/content.";
  return "Not enough data yet.";
}

function isOwnChannel(channel: TelegramChannel) {
  return Array.isArray(channel.adminLinks) && channel.adminLinks.length > 0;
}

export default function TelegramChannelNetworkDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id;
  const [formOpen, setFormOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pushToast = (
    message: string,
    tone: ToastItem["tone"] = "info",
    durationMs = 3500,
  ) => {
    const toastId = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id: toastId, message, tone }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((toast) => toast.id !== toastId)),
      durationMs,
    );
  };

  const { data: network, isLoading, error } = useQuery({
    queryKey: ["telegram-channel-network", id],
    queryFn: () => telegramChannelNetworksApi.get(id),
  });
  const { data: channels = [] } = useQuery({
    queryKey: ["telegram-channels"],
    queryFn: telegramChannelsApi.list,
  });
  const updateMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      description?: string | null;
      telegramChannelIds: string[];
    }) => telegramChannelNetworksApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-channel-networks"] });
      queryClient.invalidateQueries({ queryKey: ["telegram-channel-network", id] });
      setFormOpen(false);
      pushToast("Network updated.", "success");
    },
    onError: () => pushToast("Failed to update network.", "error"),
  });
  const deleteMutation = useMutation({
    mutationFn: () => telegramChannelNetworksApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-channel-networks"] });
      router.push("/telegram-channel-networks");
    },
    onError: () => pushToast("Failed to delete network.", "error"),
  });

  const summary = network?.summary;
  const ownChannels = useMemo(() => channels.filter(isOwnChannel), [channels]);

  return (
    <AppShell>
      <PageHeader
        title={network?.name || "Telegram Channel Network"}
        subtitle={network?.description || "Network analytics"}
        action={
          <div className="flex gap-2">
            <Link
              href="/telegram-channel-networks"
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Back
            </Link>
            <Button
              type="button"
              variant="secondary"
              disabled={!network}
              onClick={() => setFormOpen(true)}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Delete
            </Button>
          </div>
        }
      />
      {isLoading ? <LoadingState /> : null}
      {error ? (
        <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load network.
        </div>
      ) : null}
      {summary ? (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Channels count" value={formatNumber(summary.channelsCount)} />
            <MetricCard
              title="Total subscribers"
              value={formatNumber(summary.totalSubscribers)}
            />
            <MetricCard
              title="Active subscribers"
              value={formatNumber(summary.activeSubscribersEstimate)}
            />
            <MetricCard title="View rate" value={formatPercent(summary.viewRate)} />
            <MetricCard
              title="Total ad spend"
              value={formatNumber(summary.totalAdSpend, 2)}
            />
            <MetricCard title="Avg CPA" value={formatNumber(summary.avgCpa, 2)} />
            <MetricCard
              title="Active CPA"
              value={formatNumber(summary.activeCpa, 2)}
            />
            <EntityCard title="KPI status" actions={null}>
              <span
                className={`inline-flex rounded border px-2 py-0.5 text-xs ${kpiBadgeClass(summary.kpiStatus)}`}
              >
                {summary.kpiLabel || "-"}
              </span>
            </EntityCard>
          </section>
          <section className="mt-6">
            <EntityCard title="Decision" actions={null}>
              <p className="text-sm text-slate-300">
                {decisionText(summary.kpiStatus)}
              </p>
            </EntityCard>
          </section>
          <section className="mt-6">
            <h3 className="mb-3 text-lg font-semibold">Channels</h3>
            {network?.channelSummaries?.length ? (
              <ChannelsTable channels={network.channelSummaries} />
            ) : (
              <EmptyState text="No channels in this network." />
            )}
          </section>
        </>
      ) : null}
      <NetworkFormModal
        open={formOpen}
        network={network ?? null}
        channels={ownChannels}
        isSubmitting={updateMutation.isPending}
        onClose={() => setFormOpen(false)}
        onSubmit={(payload) => updateMutation.mutate(payload)}
      />
      <ToastStack
        items={toasts}
        onClose={(toastId) =>
          setToasts((prev) => prev.filter((toast) => toast.id !== toastId))
        }
      />
    </AppShell>
  );
}

function NetworkFormModal({
  open,
  network,
  channels,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  network: {
    name: string;
    description?: string | null;
    channels: { id: string }[];
  } | null;
  channels: TelegramChannel[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    description?: string | null;
    telegramChannelIds: string[];
  }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(network?.name || "");
    setDescription(network?.description || "");
    setSelectedIds(network?.channels.map((channel) => channel.id) || []);
    setError("");
  }, [network, open]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const toggleChannel = (channelId: string) => {
    setSelectedIds((prev) =>
      prev.includes(channelId)
        ? prev.filter((item) => item !== channelId)
        : [...prev, channelId],
    );
  };
  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (selectedIds.length < 2) {
      setError("Network must contain at least 2 channels.");
      return;
    }
    onSubmit({
      name: trimmedName,
      description: description.trim() || null,
      telegramChannelIds: selectedIds,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit network">
      <div className="space-y-4">
        <FormField label="Name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField label="Description">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormField>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-200">Channels</p>
          <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-slate-800 p-2">
            {channels.map((channel) => (
              <ChannelSelectRow
                key={channel.id}
                channel={channel}
                checked={selectedSet.has(channel.id)}
                onToggle={() => toggleChannel(channel.id)}
              />
            ))}
            {!channels.length ? (
              <p className="p-2 text-sm text-slate-400">No own channels available.</p>
            ) : null}
          </div>
          {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={isSubmitting} onClick={submit}>
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ChannelSelectRow({
  channel,
  checked,
  onToggle,
}: {
  channel: TelegramChannel;
  checked: boolean;
  onToggle: () => void;
}) {
  const username = channel.username ? `@${String(channel.username).replace(/^@/, "")}` : "";
  return (
    <label
      className={`flex items-center gap-3 rounded-md border p-2 text-sm transition ${
        checked
          ? "border-blue-700 bg-slate-900"
          : "border-slate-800 bg-slate-900/30 hover:border-slate-700"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 shrink-0"
      />
      <TelegramEntityAvatar
        imageUrl={channel.photoUrl}
        kind="channel"
        alt={channel.title}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold leading-tight text-slate-100">
          {channel.title}
        </p>
        {username ? (
          <p className="mt-0.5 truncate text-xs text-slate-400">{username}</p>
        ) : null}
      </div>
    </label>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <EntityCard title={title} actions={null}>
      <p className="text-2xl font-semibold">{value}</p>
    </EntityCard>
  );
}

function ChannelsTable({
  channels,
}: {
  channels: TelegramChannelNetworkChannelSummary[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full min-w-[1120px] table-fixed text-sm">
        <thead className="bg-slate-900/60 text-slate-300">
          <tr>
            <th className="w-56 px-3 py-2 text-left">Channel</th>
            <th className="w-40 px-3 py-2 text-left">Username</th>
            <th className="w-28 px-3 py-2 text-right">Subscribers</th>
            <th className="w-32 px-3 py-2 text-right">Active estimate</th>
            <th className="w-36 px-3 py-2 text-right">Paid active estimate</th>
            <th className="w-28 px-3 py-2 text-right">View rate</th>
            <th className="w-28 px-3 py-2 text-right">Spend</th>
            <th className="w-28 px-3 py-2 text-right">Avg CPA</th>
            <th className="w-28 px-3 py-2 text-right">Active CPA</th>
            <th className="w-28 px-3 py-2 text-left">KPI status</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((channel) => (
            <tr key={channel.channelId} className="border-t border-slate-800">
              <td className="px-3 py-2">
                <Link
                  href={`/telegram/channels/${channel.channelId}`}
                  className="block truncate text-blue-300 hover:underline"
                >
                  {channel.title || "-"}
                </Link>
              </td>
              <td className="px-3 py-2 text-slate-300">
                {channel.username ? `@${channel.username}` : "-"}
              </td>
              <td className="px-3 py-2 text-right">
                {formatNumber(channel.subscribersCount)}
              </td>
              <td className="px-3 py-2 text-right">
                {formatNumber(channel.activeSubscribersEstimate)}
              </td>
              <td className="px-3 py-2 text-right">
                {formatNumber(channel.paidActiveSubscribersEstimate)}
              </td>
              <td className="px-3 py-2 text-right">
                {formatPercent(channel.viewRate)}
              </td>
              <td className="px-3 py-2 text-right">
                {formatNumber(channel.totalAdSpend, 2)}
              </td>
              <td className="px-3 py-2 text-right">
                {formatNumber(channel.avgCpa, 2)}
              </td>
              <td className="px-3 py-2 text-right">
                {formatNumber(channel.activeCpa, 2)}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex rounded border px-2 py-0.5 text-xs ${kpiBadgeClass(channel.kpiStatus)}`}
                >
                  {channel.kpiLabel || "-"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
