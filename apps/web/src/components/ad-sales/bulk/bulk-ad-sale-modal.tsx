"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ResolvedEmoji,
  TelegramAdPriceQuote,
  TelegramAdProduct,
  TelegramAdSalesBulkCreateRequest,
} from "@telegram-system/shared";
import type { Account, TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import { accountDisplayName } from "@/lib/account-display";
import { expandBulkDateSelections, type BulkDateSelection } from "@/lib/ad-sales-bulk-date-builder";
import { channelLocalTime, toNumber, zonedDateTimeToUtc } from "@/lib/telegram-ad-sales";
import {
  Button,
  CustomSelect,
  DateRangeInput,
  FormField,
  Input,
  Modal,
  Select,
  TimeInput,
} from "@/components/ui/primitives";
import { MemberSelect } from "@/components/workspace/member-select";
import { IconAvatar } from "@/components/icons/icon-avatar";

type PublishedPostOption = {
  id: string;
  title: string;
  publishedAt: string;
};

type QuoteRequestDraft = {
  key: string;
  placementKey: string;
  channelId: string;
  productId: string;
  date: string;
  time: string;
};

type PlacementDraft = {
  key: string;
  clientRowId: string;
  date: string;
  channelId: string;
  price: string;
  time: string;
  productId: string;
  telegramPostId: string;
  recommendedPrice: string;
  minimumPrice: string;
};

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function productPrice(product: TelegramAdProduct | undefined) {
  return product?.estimatedPrice ?? product?.defaultFixedPrice ?? "0";
}

type ChannelCellData = {
  title: string;
  photoUrl?: string | null;
  iconPresentation?: ResolvedEmoji | null;
};

function ChannelCell({ channel }: { channel?: ChannelCellData }) {
  if (!channel) return <span className="text-neutral-500">Unknown channel</span>;
  const icon: ResolvedEmoji | null = channel.iconPresentation ?? (channel.photoUrl
    ? { type: "image", id: channel.photoUrl, url: channel.photoUrl, name: channel.title }
    : null);
  return (
    <div className="flex min-w-0 max-w-[180px] items-center gap-2">
      <IconAvatar icon={icon} label={channel.title} size="xs" />
      <span className="min-w-0 truncate font-medium text-white" title={channel.title}>
        {channel.title}
      </span>
    </div>
  );
}

export function BulkAdSaleModal({
  open,
  onClose,
  accounts,
  channels,
  networks,
  productsByChannelId,
  defaultCurrency,
  workspaceTimezone,
  onLoadPublishedPosts,
  onRequestQuote,
  onSubmit,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  channels: TelegramChannel[];
  networks: TelegramChannelNetwork[];
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  defaultCurrency: string;
  workspaceTimezone: string;
  onLoadPublishedPosts: (params: {
    channelId: string;
    date: string;
    timezone: string;
  }) => Promise<PublishedPostOption[]>;
  onRequestQuote: (params: {
    channelId: string;
    productId?: string;
    pricingMode?: "CPM" | "FIXED" | "MANUAL";
    currency?: string;
    scheduledAt?: string;
  }) => Promise<TelegramAdPriceQuote>;
  onSubmit: (
    payload: TelegramAdSalesBulkCreateRequest,
    options: { paymentAccountId: string },
  ) => Promise<void>;
  busy?: boolean;
}) {
  const [targetType, setTargetType] = useState<"CHANNEL" | "NETWORK">("CHANNEL");
  const [channelId, setChannelId] = useState("");
  const [networkId, setNetworkId] = useState("");
  const [selections, setSelections] = useState<BulkDateSelection[]>([]);
  const [range, setRange] = useState({ from: "", to: "" });
  const [buyerContact, setBuyerContact] = useState("");
  const [price, setPrice] = useState("");
  const [time, setTime] = useState("12:00");
  const [accountId, setAccountId] = useState("");
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [rowOverrides, setRowOverrides] = useState<Record<string, Partial<PlacementDraft>>>({});
  const [postsByKey, setPostsByKey] = useState<Record<string, PublishedPostOption[]>>({});
  const [postsLoadingByKey, setPostsLoadingByKey] = useState<Record<string, boolean>>({});
  const [postsErrorByKey, setPostsErrorByKey] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const postRequestsRef = useRef(new Set<string>());
  const loadedQuoteKeyRef = useRef("");
  const priceManuallyEditedRef = useRef(false);

  useEffect(() => {
    if (open) return;
    setTargetType("CHANNEL");
    setChannelId("");
    setNetworkId("");
    setSelections([]);
    setRange({ from: "", to: "" });
    setBuyerContact("");
    setPrice("");
    priceManuallyEditedRef.current = false;
    setTime("12:00");
    setAccountId("");
    setAssignedMemberId("");
    setRowOverrides({});
    setPostsByKey({});
    setPostsLoadingByKey({});
    setPostsErrorByKey({});
    setSubmitting(false);
    setError("");
    postRequestsRef.current.clear();
    loadedQuoteKeyRef.current = "";
  }, [open]);

  useEffect(() => {
    if (!open || accountId) return;
    const firstActiveAccount = accounts.find((account) => account.isActive);
    if (firstActiveAccount) setAccountId(firstActiveAccount.id);
  }, [accountId, accounts, open]);

  const selectedDates = useMemo(
    () => expandBulkDateSelections(selections, 400, { preserveDuplicates: true }),
    [selections],
  );
  const paymentCurrency = accounts.find((account) => account.id === accountId)?.currency ?? defaultCurrency;
  const targetChannels = useMemo(() => {
    if (targetType === "CHANNEL") {
      return channels.filter((channel) => channel.id === channelId);
    }
    return networks.find((network) => network.id === networkId)?.channels ?? [];
  }, [channelId, channels, networkId, networks, targetType]);

  const placements = useMemo<PlacementDraft[]>(
    () =>
      selectedDates.dates.flatMap((date, dateIndex) =>
        targetChannels.map((channel) => {
          const key = `${date}:${dateIndex}:${channel.id}`;
          return {
            key,
            clientRowId: `row:${date}:${dateIndex}`,
            date,
            channelId: channel.id,
            price,
            time,
            productId: productsByChannelId[channel.id]?.[0]?.id ?? "",
            telegramPostId: "",
            recommendedPrice: "",
            minimumPrice: "",
            ...rowOverrides[key],
          };
        }),
      ),
    [price, productsByChannelId, rowOverrides, selectedDates.dates, targetChannels, time],
  );

  const quoteRequests = useMemo<QuoteRequestDraft[]>(
    () =>
      placements.map((placement) => ({
        key: `${placement.key}:${placement.productId}:${placement.time}:${paymentCurrency}`,
        placementKey: placement.key,
        channelId: placement.channelId,
        productId: placement.productId,
        date: placement.date,
        time: placement.time,
      })),
    [paymentCurrency, placements],
  );

  const quoteRequestKey = useMemo(
    () =>
      open && quoteRequests.length
        ? JSON.stringify({
            currency: paymentCurrency,
            requests: quoteRequests,
          })
        : "",
    [open, paymentCurrency, quoteRequests],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadQuotes() {
      const lastKnownByGroup = new Map<string, { recommendedPrice: string; minimumPrice: string }>();
      const sortedRequests = [...quoteRequests].sort((left, right) => {
        const dateCompare = left.date.localeCompare(right.date);
        if (dateCompare !== 0) return dateCompare;
        return left.time.localeCompare(right.time);
      });
      for (const request of sortedRequests) {
        const product = productsByChannelId[request.channelId]?.find(
          (candidate) => candidate.id === request.productId,
        );
        const quote = await onRequestQuote({
          channelId: request.channelId,
          productId: request.productId || undefined,
          pricingMode: product?.defaultPricingMode,
          currency: paymentCurrency,
          scheduledAt: zonedDateTimeToUtc(request.date, request.time || time, workspaceTimezone).toISOString(),
        });
        if (cancelled) return;
        const groupKey = `${request.channelId}:${request.productId || "default"}:${paymentCurrency}`;
        const quotedPrice =
          toNumber(quote.recommendedPrice) > 0
            ? quote.recommendedPrice
            : productPrice(product);
        const quotedMinimumPrice =
          toNumber(quote.minimumPrice) > 0
            ? quote.minimumPrice
            : product?.minimumPrice ?? quotedPrice;
        const knownPrice = lastKnownByGroup.get(groupKey);
        const fallbackPrice = toNumber(quotedPrice) > 0
          ? quotedPrice
          : knownPrice?.recommendedPrice ?? "0";
        const fallbackMinimumPrice = toNumber(quotedMinimumPrice) > 0
          ? quotedMinimumPrice
          : knownPrice?.minimumPrice ?? fallbackPrice;
        if (toNumber(fallbackPrice) <= 0) continue;
        lastKnownByGroup.set(groupKey, {
          recommendedPrice: String(fallbackPrice),
          minimumPrice: String(fallbackMinimumPrice),
        });
        setPrice((current) => (priceManuallyEditedRef.current || toNumber(current) > 0 ? current : String(fallbackPrice)));
        setRowOverrides((current) => {
          const next = { ...current };
          const placement = placements.find((item) => item.key === request.placementKey);
          if (!placement) return current;
          const shouldFillPrice =
            !priceManuallyEditedRef.current &&
            current[placement.key]?.price === undefined &&
            toNumber(placement.price) <= 0;
          next[placement.key] = {
            ...next[placement.key],
            ...(shouldFillPrice ? { price: String(fallbackPrice) } : {}),
            recommendedPrice: String(fallbackPrice),
            minimumPrice: String(fallbackMinimumPrice),
          };
          return next;
        });
      }
    }
    if (quoteRequestKey && loadedQuoteKeyRef.current !== quoteRequestKey) {
      loadedQuoteKeyRef.current = quoteRequestKey;
      void loadQuotes();
    }
    return () => {
      cancelled = true;
    };
  }, [
    onRequestQuote,
    paymentCurrency,
    placements,
    productsByChannelId,
    quoteRequestKey,
    quoteRequests,
    time,
    workspaceTimezone,
  ]);

  async function loadPosts(placement: PlacementDraft) {
    const cacheKey = `${placement.channelId}:${placement.date}`;
    if (postRequestsRef.current.has(cacheKey)) return;
    postRequestsRef.current.add(cacheKey);
    setPostsLoadingByKey((current) => ({ ...current, [cacheKey]: true }));
    try {
      const posts = await onLoadPublishedPosts({
        channelId: placement.channelId,
        date: placement.date,
        timezone: workspaceTimezone,
      });
      setPostsByKey((current) => ({ ...current, [cacheKey]: posts }));
      setPostsErrorByKey((current) => ({ ...current, [cacheKey]: "" }));
    } catch {
      postRequestsRef.current.delete(cacheKey);
      setPostsByKey((current) => ({ ...current, [cacheKey]: [] }));
      setPostsErrorByKey((current) => ({ ...current, [cacheKey]: "Could not load published posts." }));
    } finally {
      setPostsLoadingByKey((current) => ({ ...current, [cacheKey]: false }));
    }
  }

  function updatePlacement(key: string, patch: Partial<PlacementDraft>) {
    const placement = placements.find((item) => item.key === key);
    if (placement && "price" in patch) {
      priceManuallyEditedRef.current = true;
      setRowOverrides((current) => {
        const next = { ...current };
        for (const item of placements.filter((candidate) => candidate.clientRowId === placement.clientRowId)) {
          next[item.key] = { ...next[item.key], price: patch.price };
        }
        return next;
      });
      return;
    }
    setRowOverrides((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  }

  function updateGlobalPrice(nextPrice: string) {
    priceManuallyEditedRef.current = true;
    setPrice(nextPrice);
    setRowOverrides((current) => {
      const next = { ...current };
      for (const placement of placements) {
        next[placement.key] = { ...next[placement.key], price: nextPrice };
      }
      return next;
    });
  }

  async function submit() {
    setError("");
    if (submitting) return;
    if (selectedDates.errors.length) {
      setError(selectedDates.errors[0]);
      return;
    }
    const defaultAdvertiserName = buyerContact.trim() || "Advertiser";
    if (!targetChannels.length || toNumber(price) <= 0 || !accountId || !placements.length) {
      setError("Choose a target, dates, price and payment account.");
      return;
    }
    const rowsByClientRowId = new Map<string, PlacementDraft[]>();
    for (const placement of placements) {
      rowsByClientRowId.set(
        placement.clientRowId,
        [...(rowsByClientRowId.get(placement.clientRowId) ?? []), placement],
      );
    }
    const rows = [...rowsByClientRowId.entries()].map(([clientRowId, items]) => {
      const representative = items[0];
      return {
        clientRowId,
        date: representative.date,
        agreedPriceOverride:
          toNumber(representative.price) !== toNumber(price)
            ? toNumber(representative.price)
            : undefined,
        channelOverrides: items.map((item) => ({
          channelId: item.channelId,
          productId: item.productId || null,
          time: item.time,
          telegramPostId: item.telegramPostId || null,
          manualPriceReason:
            toNumber(item.minimumPrice) > 0 && toNumber(item.price) < toNumber(item.minimumPrice)
              ? "Bulk price override"
              : null,
          recommendedPrice: toNumber(item.recommendedPrice) > 0 ? toNumber(item.recommendedPrice) : null,
          minimumPrice: toNumber(item.minimumPrice) > 0 ? toNumber(item.minimumPrice) : null,
        })),
      };
    });
    setSubmitting(true);
    try {
      await onSubmit({
        target: targetType === "CHANNEL" ? { type: "CHANNEL", channelId } : { type: "NETWORK", networkId },
        defaults: {
          advertiserId: null,
          advertiserName: defaultAdvertiserName,
          advertiserTelegram: null,
          advertiserContact: buyerContact.trim() || null,
          createAdvertiser: true,
          agreedPrice: toNumber(price),
          time,
          timezone: workspaceTimezone,
          settlementCurrency: paymentCurrency,
          assignedMemberId: assignedMemberId || null,
        },
        rows,
      }, { paymentAccountId: accountId });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create ads.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Mass add ads" size="xl">
      <div className="max-h-[78vh] space-y-5 overflow-y-auto pr-1">
        <section className="grid gap-3 md:grid-cols-3">
          <FormField label="Target">
            <Select value={targetType} onChange={(event) => setTargetType(event.target.value as "CHANNEL" | "NETWORK")}>
              <option value="CHANNEL">Channel</option>
              <option value="NETWORK">Network</option>
            </Select>
          </FormField>
          {targetType === "CHANNEL" ? (
            <FormField label="Channel" required>
              <CustomSelect
                value={channelId}
                onChange={setChannelId}
                placeholder="Choose channel"
                options={channels.map((channel) => ({
                  value: channel.id,
                  label: channel.title,
                  iconUrl: channel.photoUrl,
                  iconFallback: channel.title,
                }))}
              />
            </FormField>
          ) : (
            <FormField label="Network" required>
              <Select value={networkId} onChange={(event) => setNetworkId(event.target.value)}>
                <option value="">Choose network</option>
                {networks.map((network) => (
                  <option key={network.id} value={network.id}>{network.name}</option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label="Assigned member">
            <MemberSelect value={assignedMemberId} onChange={setAssignedMemberId} defaultToCurrent />
          </FormField>
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(280px,1.2fr)_minmax(180px,1fr)_minmax(260px,1.2fr)_minmax(160px,1fr)_minmax(160px,1fr)] xl:items-end">
          <FormField label="Add dates">
            <div className="flex min-w-0 gap-2">
              <DateRangeInput
                from={range.from}
                to={range.to}
                onChange={(next) => setRange(next)}
                className="min-w-0 flex-1"
              />
              <Button variant="secondary" className="shrink-0" onClick={() => {
                if (!range.from || !range.to) return;
                setSelections((current) => [
                  ...current,
                  range.from === range.to
                    ? { id: newId("single"), type: "single", date: range.from }
                    : { id: newId("range"), type: "range", from: range.from, to: range.to },
                ]);
                setRange({ from: "", to: "" });
              }}>Add</Button>
            </div>
          </FormField>
          <FormField label="Contact">
            <Input value={buyerContact} onChange={(event) => setBuyerContact(event.target.value)} />
          </FormField>
          <FormField label="Payment account" required>
            <CustomSelect
              value={accountId}
              onChange={setAccountId}
              placeholder="Select account"
              options={accounts
                .filter((account) => account.isActive)
                .map((account) => ({
                  value: account.id,
                  label: `${accountDisplayName(account)} (${account.currency})`,
                  iconUrl: account.iconPresentation?.type === "image" ? account.iconPresentation.url : undefined,
                  iconEmoji: account.iconPresentation?.type === "unicode" ? account.iconPresentation.value : undefined,
                  iconFallback: account.name,
                }))}
            />
          </FormField>
          <FormField label={`Price (${paymentCurrency})`} required>
            <Input
              value={price}
              inputMode="decimal"
              onChange={(event) => updateGlobalPrice(event.target.value)}
            />
          </FormField>
          <FormField label="Time" required>
            <TimeInput value={time} onChange={(event) => setTime(event.target.value)} />
          </FormField>
        </section>

        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
          <span>Selected: {selectedDates.dates.length} days</span>
          {selections.map((selection) => (
            <button
              key={selection.id}
              type="button"
              className="rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-900"
              onClick={() => setSelections((current) => current.filter((item) => item.id !== selection.id))}
            >
              {selection.type === "single" ? selection.date : `${selection.from} - ${selection.to}`} ×
            </button>
          ))}
        </div>

        <section className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead className="bg-neutral-950 text-xs uppercase text-neutral-500">
              <tr>
                <th className="w-[116px] px-3 py-2">Date</th>
                <th className="w-[210px] px-3 py-2">Channel</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Format</th>
                <th className="px-3 py-2">Advertising post</th>
              </tr>
            </thead>
            <tbody>
              {placements.length ? placements.map((placement) => {
                const channel = targetChannels.find((item) => item.id === placement.channelId);
                const products = productsByChannelId[placement.channelId] ?? [];
                const postsKey = `${placement.channelId}:${placement.date}`;
                const posts = postsByKey[postsKey] ?? [];
                const postError = postsErrorByKey[postsKey];
                return (
                  <tr key={placement.key} className="border-t border-neutral-800">
                    <td className="whitespace-nowrap px-3 py-2 text-neutral-300">{placement.date}</td>
                    <td className="px-3 py-2"><ChannelCell channel={channel} /></td>
                    <td className="px-3 py-2">
                      <div className="flex min-w-[180px] items-center gap-2">
                        <Input
                          value={placement.price}
                          inputMode="decimal"
                          onChange={(event) => updatePlacement(placement.key, { price: event.target.value })}
                        />
                        <span className="shrink-0 whitespace-nowrap text-xs text-neutral-400">
                          Should be {toNumber(placement.recommendedPrice) > 0 ? placement.recommendedPrice : "—"} {paymentCurrency}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2"><TimeInput value={placement.time} onChange={(event) => updatePlacement(placement.key, { time: event.target.value })} /></td>
                    <td className="px-3 py-2">
                      <Select value={placement.productId} onChange={(event) => updatePlacement(placement.key, { productId: event.target.value })}>
                        <option value="">Default</option>
                        {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={placement.telegramPostId}
                        onClick={() => void loadPosts(placement)}
                        onChange={(event) => {
                          const post = posts.find((item) => item.id === event.target.value);
                          updatePlacement(placement.key, {
                            telegramPostId: post?.id ?? "",
                            time: post ? channelLocalTime(post.publishedAt, workspaceTimezone) : placement.time,
                          });
                        }}
                      >
                        <option value="">Not linked to a published post</option>
                        {postsLoadingByKey[postsKey] ? <option value="__loading">Loading posts...</option> : null}
                        {posts.map((post) => <option key={post.id} value={post.id}>{channelLocalTime(post.publishedAt, workspaceTimezone)} · {post.title}</option>)}
                      </Select>
                      {postError ? <p className="mt-1 text-xs text-rose-300">{postError}</p> : null}
                    </td>
                  </tr>
                );
              }) : (
                <tr><td className="px-3 py-6 text-center text-neutral-500" colSpan={6}>Choose target and dates to generate placements.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {error || selectedDates.errors.length ? (
          <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
            {error || selectedDates.errors[0]}
          </div>
        ) : null}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy || submitting}>
            {submitting ? "Creating..." : `Create ${placements.length || ""} ads`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
