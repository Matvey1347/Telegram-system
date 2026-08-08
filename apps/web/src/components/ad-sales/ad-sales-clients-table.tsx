"use client";

import type { ReactNode } from "react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { EmptyState } from "@/components/ui/primitives";
import { MoneyStack } from "@/components/ui/money-stack";
import type { CurrencySettings, ExchangeRate, TelegramAdCrmAdvertiserListItem } from "@/lib/api";

type MoneySettings = Pick<
  CurrencySettings,
  "primaryCurrency" | "secondaryCurrency" | "tertiaryCurrency" | "currencyDisplayMode"
>;

const panelClass = "rounded-[22px] border border-neutral-800 bg-[#171717]";
const cardClass =
  "rounded-lg border border-neutral-800 bg-neutral-950 p-4 transition-colors";

export function AdSalesClientsTable({
  clients,
  settings,
  rates,
  overdueTaskCount,
}: {
  clients: TelegramAdCrmAdvertiserListItem[];
  settings: MoneySettings;
  rates?: ExchangeRate[];
  overdueTaskCount: number;
}) {
  if (!clients.length) {
    return (
      <div className={panelClass}>
        <div className="p-4">
          <EmptyState text="No clients matched the current filters." />
        </div>
      </div>
    );
  }

  return (
    <div className={`${panelClass} p-4`}>
      {overdueTaskCount ? (
        <div className="mb-4 rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          {overdueTaskCount} client{overdueTaskCount === 1 ? "" : "s"} have
          overdue next tasks on this page.
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {clients.map((client) => (
          <ClientCard
            key={client.id}
            client={client}
            settings={settings}
            rates={rates}
          />
        ))}
      </div>
    </div>
  );
}

function ClientCard({
  client,
  settings,
  rates,
}: {
  client: TelegramAdCrmAdvertiserListItem;
  settings: MoneySettings;
  rates?: ExchangeRate[];
}) {
  const unspecified = isUnspecifiedClient(client);
  return (
    <article
      className={`${cardClass} ${
        unspecified ? "" : cardAccentClass(client)
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-white">
              {unspecified ? "No client" : client.displayName}
            </h3>
            {!unspecified ? (
              <Pill
                label={formatEnum(client.status)}
                className={statusTone(client.status)}
              />
            ) : null}
          </div>
          {!unspecified ? (
            <>
              <p className="mt-1 text-xs text-neutral-500">
                {client.companyName || client.telegramUsername || "No company"}
              </p>
              {formatContact(client) !== "-" ? (
                <p className="mt-1 text-xs text-neutral-400">
                  {formatContact(client)}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
        {!unspecified ? (
          <Pill
            label={formatEnum(client.urgency || "normal")}
            className={urgencyTone(client.urgency)}
          />
        ) : null}
      </div>

      {!unspecified || hasClientStats(client) ? (
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Metric label="Revenue" value={<MoneyStack amount={client.totalRevenueInPrimaryCurrency} currency={settings.primaryCurrency} settings={settings} rates={rates} mainClassName="font-medium text-white" subClassName="text-xs text-neutral-500" />} />
          <Metric label="AOV" value={<MoneyStack amount={client.averageOrderValueInPrimaryCurrency} currency={settings.primaryCurrency} settings={settings} rates={rates} mainClassName="font-medium text-white" subClassName="text-xs text-neutral-500" />} />
          <Metric label="Sales" value={`${client.completedSalesCount}/${client.totalSalesCount}`} />
          <Metric label="Placements" value={String(client.totalPlacementsCount ?? 0)} />
          {client.lastPurchaseAt ? (
            <Metric label="Last purchase" value={formatDate(client.lastPurchaseAt)} />
          ) : null}
        </div>
      ) : null}

      {!unspecified ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill
            label={client.rfmSegment || "Unsegmented"}
            className={
              client.isHighValue
                ? "border-emerald-700 bg-emerald-900/30 text-emerald-200"
                : "border-neutral-700 bg-neutral-900 text-neutral-300"
            }
          />
          <span className="text-xs text-neutral-500">
            R {client.recencyBucket || "-"} · F {client.frequencyBucket || "-"} · Rank {client.priorityRank ?? "-"}
          </span>
        </div>
      ) : null}

      <div className="mt-4 border-t border-neutral-900 pt-3 text-xs">
        <OwnerRow owner={client.ownerMember} />
        {client.lastContactAt ? (
          <InfoRow label="Last contact" value={formatDate(client.lastContactAt)} />
        ) : null}
        {client.nextContactAt ? (
          <InfoRow label="Next contact" value={formatDate(client.nextContactAt)} />
        ) : null}
        {client.nextOpenTask ? (
          <InfoRow
            label="Next task"
            value={`${client.nextOpenTask.title} · ${formatEnum(client.nextOpenTask.type)} · ${formatDate(client.nextOpenTask.dueAt)}`}
          />
        ) : null}
        {client.lostReason || client.lostAt ? (
          <p className="mt-2 text-rose-300">
            Lost {formatDate(client.lostAt)}
            {client.lostReason ? `: ${client.lostReason}` : ""}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase text-neutral-500">{label}</p>
      <div className="mt-1 font-medium text-white">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="shrink-0 text-neutral-500">{label}</span>
      <span className="min-w-0 truncate text-right text-neutral-300">{value}</span>
    </div>
  );
}

function OwnerRow({
  owner,
}: {
  owner: TelegramAdCrmAdvertiserListItem["ownerMember"];
}) {
  if (!owner) return <InfoRow label="Owner" value="Unassigned" />;
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="shrink-0 text-neutral-500">Owner</span>
      <span className="inline-flex min-w-0 items-center justify-end gap-2 text-right text-neutral-300">
        <IconAvatar
          icon={owner.avatarPresentation}
          label={owner.name}
          size="xs"
        />
        <span className="min-w-0 truncate">
          {owner.name}
        </span>
      </span>
    </div>
  );
}

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

function formatEnum(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatContact(client: TelegramAdCrmAdvertiserListItem) {
  if (client.primaryContact) {
    const label = client.primaryContact.label
      ? `${client.primaryContact.label}: `
      : "";
    return `${label}${client.primaryContact.value}`;
  }
  return client.telegramUsername || "-";
}

function isUnspecifiedClient(client: TelegramAdCrmAdvertiserListItem) {
  return (
    client.displayName.trim().toLowerCase() === "advertiser" &&
    !client.companyName &&
    !client.telegramUsername &&
    !client.primaryContact
  );
}

function hasClientStats(client: TelegramAdCrmAdvertiserListItem) {
  return (
    Number(client.totalRevenueInPrimaryCurrency) > 0 ||
    Number(client.averageOrderValueInPrimaryCurrency) > 0 ||
    client.completedSalesCount > 0 ||
    client.totalSalesCount > 0 ||
    (client.totalPlacementsCount ?? 0) > 0 ||
    Boolean(client.lastPurchaseAt)
  );
}

function cardAccentClass(client: TelegramAdCrmAdvertiserListItem) {
  const urgency = String(client.urgency ?? "NONE").toUpperCase();
  if (urgency === "HIGH") return "border-amber-800/70";
  if (client.isHighValue) return "border-emerald-800/70";
  return "";
}

function statusTone(status: string) {
  if (status === "ACTIVE")
    return "border-emerald-700 bg-emerald-900/30 text-emerald-200";
  if (status === "LEAD") return "border-blue-700 bg-blue-900/30 text-blue-200";
  if (status === "LOST" || status === "BLOCKED")
    return "border-rose-700 bg-rose-900/30 text-rose-200";
  return "border-neutral-700 bg-neutral-900 text-neutral-300";
}

function urgencyTone(urgency: string | null) {
  const value = String(urgency ?? "NORMAL").toUpperCase();
  if (value === "URGENT") return "border-rose-700 bg-rose-900/30 text-rose-200";
  if (value === "HIGH")
    return "border-amber-700 bg-amber-900/30 text-amber-200";
  if (value === "MEDIUM") return "border-blue-700 bg-blue-900/30 text-blue-200";
  return "border-neutral-700 bg-neutral-900 text-neutral-300";
}
