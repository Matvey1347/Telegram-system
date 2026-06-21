"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { TelegramEntityAvatar } from "@/components/telegram/telegram-entity-avatar";
import {
  Button,
  ConfirmDeleteModal,
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
  type TelegramChannelNetwork,
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

function requestErrorMessage(error: unknown, fallback: string) {
  const responseError = error as { response?: { data?: { message?: string } } };
  return responseError?.response?.data?.message || fallback;
}

function isOwnChannel(channel: TelegramChannel) {
  return Array.isArray(channel.adminLinks) && channel.adminLinks.length > 0;
}

export default function TelegramChannelNetworksPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TelegramChannelNetwork | null>(null);
  const [deleting, setDeleting] = useState<TelegramChannelNetwork | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pushToast = (
    message: string,
    tone: ToastItem["tone"] = "info",
    durationMs = 3500,
  ) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((toast) => toast.id !== id)),
      durationMs,
    );
  };

  const { data: networks = [], isLoading, error } = useQuery({
    queryKey: ["telegram-channel-networks"],
    queryFn: telegramChannelNetworksApi.list,
  });
  const { data: channels = [] } = useQuery({
    queryKey: ["telegram-channels"],
    queryFn: telegramChannelsApi.list,
  });

  const ownChannels = useMemo(() => channels.filter(isOwnChannel), [channels]);

  const createMutation = useMutation({
    mutationFn: telegramChannelNetworksApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-channel-networks"] });
      setFormOpen(false);
      pushToast("Network created.", "success");
    },
    onError: (requestError) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to create network."),
        "error",
      ),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        name?: string;
        description?: string | null;
        telegramChannelIds?: string[];
      };
    }) => telegramChannelNetworksApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-channel-networks"] });
      setEditing(null);
      setFormOpen(false);
      pushToast("Network updated.", "success");
    },
    onError: (requestError) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to update network."),
        "error",
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => telegramChannelNetworksApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-channel-networks"] });
      setDeleting(null);
      pushToast("Network deleted.", "success");
    },
    onError: (requestError) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to delete network."),
        "error",
      ),
  });

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <AppShell>
      <PageHeader
        title="Telegram Channel Networks"
        subtitle="Grouped Telegram channel analytics"
        action={<Button onClick={openCreate}>Create network</Button>}
      />
      {isLoading ? <LoadingState /> : null}
      {error ? (
        <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load networks.
        </div>
      ) : null}
      {!isLoading && !networks.length ? (
        <EmptyState text="No channel networks yet." />
      ) : null}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {networks.map((network) => (
          <NetworkCard
            key={network.id}
            network={network}
            onEdit={() => {
              setEditing(network);
              setFormOpen(true);
            }}
            onDelete={() => setDeleting(network)}
          />
        ))}
      </div>
      <NetworkFormModal
        open={formOpen}
        network={editing}
        channels={ownChannels}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(payload) => {
          if (editing) {
            updateMutation.mutate({ id: editing.id, payload });
          } else {
            createMutation.mutate(payload);
          }
        }}
      />
      <ConfirmDeleteModal
        open={!!deleting}
        entityName={deleting?.name ?? ""}
        description="This deletes only the network. Telegram channels remain untouched."
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        label="Delete"
      />
      <ToastStack
        items={toasts}
        onClose={(id) =>
          setToasts((prev) => prev.filter((toast) => toast.id !== id))
        }
      />
    </AppShell>
  );
}

function NetworkCard({
  network,
  onEdit,
  onDelete,
}: {
  network: TelegramChannelNetwork;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const summary = network.summary;
  return (
    <EntityCard
      title={network.name}
      actions={
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          <Button type="button" variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      }
    >
      {network.description ? (
        <p className="mb-3 text-sm text-slate-400">{network.description}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
        <MiniStat label="Channels" value={formatNumber(summary.channelsCount)} />
        <MiniStat
          label="Subscribers"
          value={formatNumber(summary.totalSubscribers)}
        />
        <MiniStat
          label="Active"
          value={formatNumber(summary.activeSubscribersEstimate)}
        />
        <MiniStat label="View rate" value={formatPercent(summary.viewRate)} />
        <MiniStat label="Spend" value={formatNumber(summary.totalAdSpend, 2)} />
        <MiniStat
          label="Avg CPA"
          value={formatNumber(summary.avgCpa, 2)}
        />
        <MiniStat
          label="Active CPA"
          value={formatNumber(summary.activeCpa, 2)}
        />
        <div>
          <p className="text-xs text-slate-500">KPI</p>
          <span
            className={`mt-1 inline-flex rounded border px-2 py-0.5 text-xs ${kpiBadgeClass(summary.kpiStatus)}`}
          >
            {summary.kpiLabel || "-"}
          </span>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Link
          href={`/telegram-channel-networks/${network.id}`}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          Open
        </Link>
      </div>
    </EntityCard>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/30 p-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-100">{value}</p>
    </div>
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
  network: TelegramChannelNetwork | null;
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
  const toggleChannel = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
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
    <Modal
      open={open}
      onClose={onClose}
      title={network ? "Edit network" : "Create network"}
    >
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
