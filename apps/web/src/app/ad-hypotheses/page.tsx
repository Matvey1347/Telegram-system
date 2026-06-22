"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { MoneyStack } from "@/components/ui/money-stack";
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
  adCampaignsApi,
  adHypothesesApi,
  currenciesApi,
  workspacesApi,
  type AdCampaign,
  type AdHypothesis,
  type AdHypothesisKpiStatus,
  type AdHypothesisStatus,
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

function statusBadgeClass(status?: AdHypothesisStatus) {
  if (status === "winner") return "border-emerald-700 text-emerald-200";
  if (status === "loser") return "border-rose-700 text-rose-200";
  if (status === "paused") return "border-yellow-700 text-yellow-200";
  if (status === "archived") return "border-slate-700 text-slate-400";
  return "border-blue-700 text-blue-200";
}

function kpiBadgeClass(status?: AdHypothesisKpiStatus) {
  if (status === "good") return "border-emerald-700 text-emerald-200";
  if (status === "acceptable") return "border-yellow-700 text-yellow-200";
  if (status === "bad") return "border-rose-700 text-rose-200";
  return "border-slate-700 text-slate-300";
}

function requestErrorMessage(error: unknown, fallback: string) {
  const message = (error as any)?.response?.data?.message;
  if (Array.isArray(message)) return message.join(", ");
  return typeof message === "string" && message.trim() ? message : fallback;
}

export default function AdHypothesesPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdHypothesis | null>(null);
  const [deleting, setDeleting] = useState<AdHypothesis | null>(null);
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

  const { data: hypotheses = [], isLoading, error } = useQuery({
    queryKey: ["ad-hypotheses"],
    queryFn: adHypothesesApi.list,
  });
  const { data: campaigns = [] } = useQuery({
    queryKey: ["ad-campaigns"],
    queryFn: () => adCampaignsApi.list(),
  });
  const { data: workspace } = useQuery({
    queryKey: ["workspace-selected"],
    queryFn: workspacesApi.selected,
  });
  const { data: currencySettings } = useQuery({
    queryKey: ["currency-settings"],
    queryFn: currenciesApi.getSettings,
  });
  const { data: rates } = useQuery({
    queryKey: ["currency-rates"],
    queryFn: currenciesApi.listRates,
  });

  const createMutation = useMutation({
    mutationFn: adHypothesesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-hypotheses"] });
      queryClient.invalidateQueries({ queryKey: ["ad-campaigns"] });
      setFormOpen(false);
      pushToast("Hypothesis created.", "success");
    },
    onError: (requestError) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to create hypothesis."),
        "error",
      ),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: any) => adHypothesesApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-hypotheses"] });
      queryClient.invalidateQueries({ queryKey: ["ad-campaigns"] });
      setEditing(null);
      setFormOpen(false);
      pushToast("Hypothesis updated.", "success");
    },
    onError: (requestError) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to update hypothesis."),
        "error",
      ),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adHypothesesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-hypotheses"] });
      queryClient.invalidateQueries({ queryKey: ["ad-campaigns"] });
      setDeleting(null);
      pushToast("Hypothesis deleted.", "success");
    },
    onError: (requestError) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to delete hypothesis."),
        "error",
      ),
  });

  return (
    <AppShell>
      <PageHeader
        title="Ad Hypotheses"
        subtitle="Group advertising campaigns by theory and compare results"
        action={
          <div className="flex gap-2">
            <Link
              href="/ad-campaigns"
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Campaigns
            </Link>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Create hypothesis
            </Button>
          </div>
        }
      />
      {isLoading ? <LoadingState /> : null}
      {error ? (
        <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load hypotheses.
        </div>
      ) : null}
      {!isLoading && !hypotheses.length ? (
        <EmptyState text="No hypotheses yet." />
      ) : null}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-4">
        {hypotheses.map((hypothesis) => (
          <HypothesisCard
            key={hypothesis.id}
            hypothesis={hypothesis}
            onEdit={() => {
              setEditing(hypothesis);
              setFormOpen(true);
            }}
            onDelete={() => setDeleting(hypothesis)}
          />
        ))}
      </div>
      <HypothesisFormModal
        open={formOpen}
        hypothesis={editing}
        campaigns={campaigns}
        moneySettings={currencySettings ?? workspace}
        rates={rates}
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
        description="This deletes only the hypothesis. Campaigns remain untouched."
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

function HypothesisCard({
  hypothesis,
  onEdit,
  onDelete,
}: {
  hypothesis: AdHypothesis;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const summary = hypothesis.summary;
  return (
    <EntityCard
      title={hypothesis.name}
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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${statusBadgeClass(hypothesis.status)}`}
        >
          {hypothesis.status}
        </span>
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${kpiBadgeClass(summary.kpiStatus)}`}
        >
          {summary.kpiStatus}
        </span>
      </div>
      {hypothesis.description ? (
        <p className="mb-3 text-sm text-slate-400">{hypothesis.description}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
        <MiniStat label="Campaigns" value={formatNumber(summary.campaignsCount)} />
        <MiniStat label="Spend" value={formatNumber(summary.totalSpend, 2)} />
        <MiniStat
          label="Joined"
          value={formatNumber(summary.totalJoinedSubscribers)}
        />
        <MiniStat label="Avg CPA" value={formatNumber(summary.avgCpa, 2)} />
        <MiniStat label="Active CPA" value={formatNumber(summary.activeCpa, 2)} />
      </div>
      <p className="mt-3 text-sm text-slate-300">{summary.decision}</p>
      <div className="mt-4 flex justify-end">
        <Link
          href={`/ad-hypotheses/${hypothesis.id}`}
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

function HypothesisFormModal({
  open,
  hypothesis,
  campaigns,
  moneySettings,
  rates,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  hypothesis: AdHypothesis | null;
  campaigns: AdCampaign[];
  moneySettings: any;
  rates: any[] | undefined;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    description?: string | null;
    adCampaignIds: string[];
  }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(hypothesis?.name || "");
    setDescription(hypothesis?.description || "");
    setSelectedIds([]);
    setError("");
  }, [hypothesis, open]);

  useEffect(() => {
    if (!open || !hypothesis) return;
    adHypothesesApi.get(hypothesis.id).then((detail) => {
      setSelectedIds(detail.campaigns.map((campaign) => campaign.id));
    });
  }, [hypothesis, open]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const toggleCampaign = (id: string) => {
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
    if (!selectedIds.length) {
      setError("Hypothesis must contain at least 1 campaign.");
      return;
    }
    onSubmit({
      name: trimmedName,
      description: description.trim() || null,
      adCampaignIds: selectedIds,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={hypothesis ? "Edit hypothesis" : "Create hypothesis"}
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
          <p className="mb-2 text-sm font-medium text-slate-200">Campaigns</p>
          <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-slate-800 p-2">
            {campaigns.map((campaign) => (
              <CampaignSelectRow
                key={campaign.id}
                campaign={campaign}
                checked={selectedSet.has(campaign.id)}
                moneySettings={moneySettings}
                rates={rates}
                onToggle={() => toggleCampaign(campaign.id)}
              />
            ))}
            {!campaigns.length ? (
              <p className="p-2 text-sm text-slate-400">No campaigns available.</p>
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

function CampaignSelectRow({
  campaign,
  checked,
  moneySettings,
  rates,
  onToggle,
}: {
  campaign: AdCampaign;
  checked: boolean;
  moneySettings: any;
  rates: any[] | undefined;
  onToggle: () => void;
}) {
  const joined = campaign.analytics?.joinedCount ?? campaign.joinedCount ?? 0;
  const price = Number(campaign.price ?? campaign.costAmount ?? 0);
  const primaryPrice = Number(campaign.priceInPrimaryCurrency ?? 0);
  return (
    <label
      className={`flex items-center gap-3 rounded-md border p-2 text-sm ${
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
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-100">
          {campaign.title}
        </p>
        <MoneyStack
          amount={price}
          currency={campaign.currency}
          settings={moneySettings}
          rates={rates}
          amountInPrimary={primaryPrice}
          mainClassName="mt-0.5 truncate text-xs text-slate-400"
          subClassName="text-xs text-slate-500"
        />
        <p className="mt-0.5 text-xs text-slate-400">{joined} joined</p>
      </div>
    </label>
  );
}
