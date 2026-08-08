"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  TelegramAdAvailabilitySlot,
  TelegramAdPriceQuote,
  TelegramAdProduct,
  TelegramAdSale,
  TelegramAdvertiser,
  TelegramAdStructuredError,
} from "@telegram-system/shared";
import type {
  Account,
  TelegramChannel,
  TelegramChannelNetwork,
} from "@/lib/api";
import { accountDisplayName } from "@/lib/account-display";
import {
  buildUnderpricingSummary,
  channelLocalDateKey,
  channelLocalTime,
  expandNetworkChannelIds,
  getChannelOptionLabel,
  toNumber,
  zonedDateTimeToUtc,
} from "@/lib/telegram-ad-sales";
import {
  Button,
  CustomSelect,
  DateInput,
  FormField,
  Input,
  Modal,
  MultiSelect,
  Select,
  Skeleton,
  Textarea,
  TimeInput,
} from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "@/components/telegram/telegram-entity-avatar";
import { MemberSelect } from "@/components/workspace/member-select";

export type SalePlacementDraft = {
  key: string;
  channelId: string;
  date: string;
  time: string;
  timezone: string;
  productId: string;
  expectedViews: number | null;
  targetCpm: string;
  recommendedPrice: string;
  minimumPrice: string;
  agreedPrice: string;
  pricingMode: "CPM" | "FIXED" | "MANUAL";
  manualPriceReason: string;
  warnings: string[];
  conflict: string | null;
  agreedPriceManuallyEdited: boolean;
  inventoryOpportunityKey?: string | null;
  telegramPostId?: string | null;
};

type PublishedPostOption = {
  id: string;
  title: string;
  publishedAt: string;
};

type QuoteRequestDraft = {
  key: string;
  channelId: string;
  productId: string;
  pricingMode: SalePlacementDraft["pricingMode"];
  date: string;
  time: string;
  timezone: string;
};

function channelKey(channelId: string) {
  return `placement:${channelId}`;
}

function productPrice(product: TelegramAdProduct | undefined) {
  return product?.estimatedPrice ?? product?.defaultFixedPrice ?? "0";
}

function createPlacementDraft(params: {
  channelId: string;
  product?: TelegramAdProduct;
  date: string;
  time: string;
  timezone: string;
  inventoryOpportunityKey?: string | null;
}): SalePlacementDraft {
  const price = productPrice(params.product);
  return {
    key: channelKey(params.channelId),
    channelId: params.channelId,
    date: params.date,
    time: params.time,
    timezone: params.timezone,
    productId: params.product?.id ?? "",
    expectedViews: params.product?.estimatedViews ?? 0,
    targetCpm: params.product?.defaultCpm ?? "0",
    recommendedPrice: price,
    minimumPrice: params.product?.minimumPrice ?? price,
    agreedPrice: price,
    pricingMode: params.product?.defaultPricingMode ?? "CPM",
    manualPriceReason: "",
    warnings: [],
    conflict: null,
    agreedPriceManuallyEdited: false,
    inventoryOpportunityKey: params.inventoryOpportunityKey ?? null,
    telegramPostId: null,
  };
}

export function AdSaleModal({
  open,
  onClose,
  accounts,
  channels,
  networks,
  productsByChannelId,
  defaultCurrency,
  workspaceTimezone,
  onLoadAvailableSlots,
  onLoadPublishedPosts,
  onRequestQuote,
  onSearchAdvertisers,
  onSubmit,
  busy = false,
  initialChannelId,
  initialScheduledAt,
  initialInventoryOpportunityKey,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  channels: TelegramChannel[];
  networks: TelegramChannelNetwork[];
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  defaultCurrency: string;
  workspaceTimezone: string;
  onLoadAvailableSlots: (params: {
    channelId: string;
    productId?: string;
    from: string;
    to: string;
  }) => Promise<TelegramAdAvailabilitySlot[]>;
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
  onSearchAdvertisers: (query: string) => Promise<TelegramAdvertiser[]>;
  onSubmit: (payload: {
    advertiserId?: string | null;
    createAdvertiser?: boolean;
    advertiserName: string;
    advertiserTelegram?: string;
    advertiserContact?: string;
    notes?: string;
    assignedMemberId?: string | null;
    accountId: string;
    paymentAmount: number;
    paymentCurrency: string;
    placements: Array<{
      channelId: string;
      productId?: string;
      inventoryOpportunityKey?: string | null;
      scheduledAt: string;
      timezone: string;
      agreedPrice: number;
      recommendedPrice: number;
      minimumPrice: number;
      expectedViews: number;
      pricingMode: "CPM" | "FIXED" | "MANUAL";
      manualPriceReason?: string;
      telegramPostId?: string | null;
    }>;
  }) => Promise<{ sale: TelegramAdSale; conflicts?: TelegramAdStructuredError[] }>;
  busy?: boolean;
  initialChannelId?: string | null;
  initialScheduledAt?: string | null;
  initialInventoryOpportunityKey?: string | null;
}) {
  const [advertiserTelegram, setAdvertiserTelegram] = useState("");
  const [advertiserContact, setAdvertiserContact] = useState("");
  const [selectedAdvertiser, setSelectedAdvertiser] = useState<TelegramAdvertiser | null>(null);
  const [selectedAdvertiserId, setSelectedAdvertiserId] = useState<string | null>(null);
  const [advertiserMatches, setAdvertiserMatches] = useState<TelegramAdvertiser[]>([]);
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [channelSelectionMode, setChannelSelectionMode] = useState<"network" | "channels">(
    "network",
  );
  const [selectedNetworkId, setSelectedNetworkId] = useState("");
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [placements, setPlacements] = useState<SalePlacementDraft[]>([]);
  const [submissionError, setSubmissionError] = useState("");
  const [slotPickerPlacementKey, setSlotPickerPlacementKey] = useState<string | null>(null);
  const [slotPickerSlots, setSlotPickerSlots] = useState<TelegramAdAvailabilitySlot[]>([]);
  const [slotPickerLoading, setSlotPickerLoading] = useState(false);
  const [slotPickerError, setSlotPickerError] = useState("");
  const [publishedPostsByPlacement, setPublishedPostsByPlacement] = useState<Record<string, PublishedPostOption[]>>({});
  const [postsLoadingByPlacement, setPostsLoadingByPlacement] = useState<Record<string, boolean>>({});
  const modalInitializedRef = useRef(false);
  const loadedQuoteKeyRef = useRef("");
  const publishedPostRequestsRef = useRef(new Map<string, symbol>());
  const paymentCurrency =
    accounts.find((account) => account.id === accountId)?.currency ?? defaultCurrency;
  const paymentAmount = useMemo(
    () => placements.reduce((sum, placement) => sum + toNumber(placement.agreedPrice), 0),
    [placements],
  );

  useEffect(() => {
    if (!open) {
      modalInitializedRef.current = false;
      return;
    }
    if (modalInitializedRef.current) return;
    modalInitializedRef.current = true;
    setAdvertiserTelegram("");
    setAdvertiserContact("");
    setSelectedAdvertiser(null);
    setSelectedAdvertiserId(null);
    setAdvertiserMatches([]);
    setAssignedMemberId("");
    const preferredAccount = accounts.find((account) => account.isActive) ?? accounts[0];
    setAccountId(preferredAccount?.id ?? "");
    setChannelSelectionMode(initialChannelId ? "channels" : "network");
    setSelectedNetworkId("");
    setSelectedChannelIds(initialChannelId ? [initialChannelId] : []);
    setPlacements(
      initialChannelId
        ? [
            createPlacementDraft({
              channelId: initialChannelId,
              product: productsByChannelId[initialChannelId]?.[0],
              date: initialScheduledAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
              time: initialScheduledAt
                ? new Date(initialScheduledAt).toISOString().slice(11, 16)
                : "12:00",
              timezone: workspaceTimezone,
              inventoryOpportunityKey: initialInventoryOpportunityKey ?? null,
            }),
          ]
        : [],
    );
    setSubmissionError("");
    loadedQuoteKeyRef.current = "";
    setSlotPickerPlacementKey(null);
    setSlotPickerSlots([]);
    setSlotPickerError("");
    setPublishedPostsByPlacement({});
    setPostsLoadingByPlacement({});
    publishedPostRequestsRef.current.clear();
  }, [
    accounts,
    defaultCurrency,
    initialChannelId,
    initialInventoryOpportunityKey,
    initialScheduledAt,
    open,
    productsByChannelId,
    workspaceTimezone,
  ]);

  useEffect(() => {
    if (!open) return;
    const search = advertiserContact.trim();
    if (search.length < 2 || selectedAdvertiserId) {
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      const matches = await onSearchAdvertisers(search);
      if (!cancelled) {
        setAdvertiserMatches(matches);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [advertiserContact, onSearchAdvertisers, open, selectedAdvertiserId]);

  const effectiveChannelIds = useMemo(
    () =>
      expandNetworkChannelIds({
        selectedChannelIds,
        selectedNetworkId,
        networks,
      }),
    [networks, selectedChannelIds, selectedNetworkId],
  );

  useEffect(() => {
    // Placement rows are derived from selected channels and products can arrive after opening.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlacements((current) => {
      if (!effectiveChannelIds.length) return [];
      const byChannelId = new Map(current.map((item) => [item.channelId, item] as const));
      return effectiveChannelIds.map((channelId) => {
        const existing = byChannelId.get(channelId);
        const defaultProduct = productsByChannelId[channelId]?.[0];
        if (existing) {
          if (existing.productId || !defaultProduct) return existing;
          const price = productPrice(defaultProduct);
          return {
            ...existing,
            productId: defaultProduct.id,
            expectedViews: defaultProduct.estimatedViews ?? 0,
            targetCpm: defaultProduct.defaultCpm ?? "0",
            recommendedPrice: price,
            minimumPrice: defaultProduct.minimumPrice ?? price,
            agreedPrice: existing.agreedPriceManuallyEdited ? existing.agreedPrice : price,
            pricingMode: defaultProduct.defaultPricingMode,
          };
        }
        return createPlacementDraft({
          channelId,
          product: defaultProduct,
          date: new Date().toISOString().slice(0, 10),
          time: "12:00",
          timezone: workspaceTimezone,
        });
      });
    });
  }, [effectiveChannelIds, productsByChannelId, workspaceTimezone]);

  const loadPublishedPosts = async (placement: SalePlacementDraft) => {
    const cacheKey = `${placement.channelId}:${placement.date}`;
    if (publishedPostRequestsRef.current.has(cacheKey)) return;

    const requestToken = Symbol(cacheKey);
    let requestFailed = false;
    publishedPostRequestsRef.current.set(cacheKey, requestToken);
    setPostsLoadingByPlacement((current) => ({ ...current, [cacheKey]: true }));

    try {
      const posts = await onLoadPublishedPosts({
        channelId: placement.channelId,
        date: placement.date,
        timezone: placement.timezone,
      });
      if (publishedPostRequestsRef.current.get(cacheKey) === requestToken) {
        setPublishedPostsByPlacement((current) => ({ ...current, [cacheKey]: posts }));
      }
    } catch {
      requestFailed = true;
      if (publishedPostRequestsRef.current.get(cacheKey) === requestToken) {
        setPublishedPostsByPlacement((current) => ({ ...current, [cacheKey]: [] }));
      }
    } finally {
      if (publishedPostRequestsRef.current.get(cacheKey) === requestToken) {
        setPostsLoadingByPlacement((current) => ({ ...current, [cacheKey]: false }));
        if (requestFailed) publishedPostRequestsRef.current.delete(cacheKey);
      }
    }
  };

  const quoteRequests = useMemo<QuoteRequestDraft[]>(
    () =>
      placements.map((placement) => ({
        key: placement.key,
        channelId: placement.channelId,
        productId: placement.productId,
        pricingMode: placement.pricingMode,
        date: placement.date,
        time: placement.time,
        timezone: placement.timezone,
      })),
    [placements],
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
      for (const placement of quoteRequests) {
        const quote = await onRequestQuote({
          channelId: placement.channelId,
          productId: placement.productId || undefined,
          pricingMode: placement.pricingMode,
          currency: paymentCurrency,
          scheduledAt: zonedDateTimeToUtc(
            placement.date,
            placement.time,
            placement.timezone,
          ).toISOString(),
        });
        if (cancelled) return;
        setPlacements((current) => {
          let changed = false;
          const next = current.map((item) => {
            if (item.key !== placement.key) return item;
            const product = productsByChannelId[item.channelId]?.find(
              (candidate) => candidate.id === item.productId,
            );
            const nextRecommendedPrice =
              toNumber(quote.recommendedPrice) > 0
                ? quote.recommendedPrice
                : productPrice(product);
            const nextMinimumPrice =
              toNumber(quote.minimumPrice) > 0
                ? quote.minimumPrice
                : product?.minimumPrice ?? nextRecommendedPrice;
            const nextAgreedPrice = item.agreedPriceManuallyEdited
              ? item.agreedPrice
              : nextRecommendedPrice;
            const nextWarnings = quote.warnings.map((warning) => warning.message);
            const hasChanged =
              item.expectedViews !== quote.expectedViews ||
              item.targetCpm !== quote.targetCpm ||
              item.recommendedPrice !== nextRecommendedPrice ||
              item.minimumPrice !== nextMinimumPrice ||
              item.agreedPrice !== nextAgreedPrice ||
              item.warnings.join("|") !== nextWarnings.join("|");
            if (!hasChanged) return item;
            changed = true;
            return {
              ...item,
              expectedViews: quote.expectedViews,
              targetCpm: quote.targetCpm,
              recommendedPrice: nextRecommendedPrice,
              minimumPrice: nextMinimumPrice,
              agreedPrice: nextAgreedPrice,
              warnings: nextWarnings,
            };
          });
          return changed ? next : current;
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
  }, [onRequestQuote, paymentCurrency, productsByChannelId, quoteRequestKey, quoteRequests]);

  const canSubmit =
    !!accountId &&
    paymentAmount > 0 &&
    effectiveChannelIds.length > 0 &&
    placements.length > 0;

  async function openSlotPicker(placement: SalePlacementDraft) {
    setSlotPickerPlacementKey(placement.key);
    setSlotPickerSlots([]);
    setSlotPickerError("");
    setSlotPickerLoading(true);
    try {
      const start = new Date(`${placement.date}T00:00:00`);
      start.setDate(start.getDate() - 7);
      const end = new Date(`${placement.date}T23:59:59`);
      end.setDate(end.getDate() + 21);
      const slots = await onLoadAvailableSlots({
        channelId: placement.channelId,
        productId: placement.productId || undefined,
        from: start.toISOString(),
        to: end.toISOString(),
      });
      setSlotPickerSlots(slots);
    } catch (error) {
      setSlotPickerError(error instanceof Error ? error.message : "Could not load available slots.");
    } finally {
      setSlotPickerLoading(false);
    }
  }

  function applySlot(slot: TelegramAdAvailabilitySlot) {
    if (!slotPickerPlacementKey) return;
    setPlacements((current) =>
      current.map((item) =>
        item.key === slotPickerPlacementKey
          ? {
              ...item,
              date: slot.date,
              timezone: slot.timezone,
              inventoryOpportunityKey: null,
              conflict: null,
              telegramPostId: null,
            }
          : item,
      ),
    );
    setSlotPickerPlacementKey(null);
  }

  async function submit() {
    setSubmissionError("");
    try {
      const normalizedContact = advertiserContact.trim();
      const derivedAdvertiserName = selectedAdvertiser?.displayName || normalizedContact || "Advertiser";
      const submission = onSubmit({
        advertiserId: selectedAdvertiserId,
        createAdvertiser: !selectedAdvertiserId,
        advertiserName: derivedAdvertiserName,
        advertiserTelegram:
          normalizedContact.startsWith("@") && !advertiserTelegram.trim()
            ? normalizedContact
            : advertiserTelegram.trim() || undefined,
        advertiserContact: normalizedContact || undefined,
        assignedMemberId: assignedMemberId || null,
        accountId,
        paymentAmount,
        paymentCurrency,
        placements: placements.map((placement) => ({
          channelId: placement.channelId,
          productId: placement.productId || undefined,
          inventoryOpportunityKey: placement.inventoryOpportunityKey ?? undefined,
          scheduledAt: new Date(`${placement.date}T${placement.time}:00`).toISOString(),
          timezone: placement.timezone,
          agreedPrice: toNumber(placement.agreedPrice),
          recommendedPrice: toNumber(placement.recommendedPrice),
          minimumPrice: toNumber(placement.minimumPrice),
          expectedViews: placement.expectedViews ?? 0,
          pricingMode: placement.pricingMode,
          manualPriceReason: placement.manualPriceReason.trim() || undefined,
          telegramPostId: placement.telegramPostId ?? null,
        })),
      });
      onClose();
      const result = await submission;

      if (result.conflicts?.length) {
        const byPlacementId = new Map(
          result.conflicts.map((conflict) => [
            String(((conflict.details?.conflictPlacement as { id?: string } | undefined)?.id ?? "")),
            conflict.message,
          ]),
        );
        setPlacements((current) =>
          current.map((placement) => ({
            ...placement,
            conflict: byPlacementId.get(placement.key) ?? "Scheduling conflict detected",
          })),
        );
        setSubmissionError("Some placements conflict with existing reservations.");
        return;
      }
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Could not create sale");
    }
  }

  const slotPickerPlacement = placements.find((item) => item.key === slotPickerPlacementKey) ?? null;
  const slotsByDate = Array.from(
    slotPickerSlots.reduce((groups, slot) => {
      const items = groups.get(slot.date) ?? [];
      items.push(slot);
      groups.set(slot.date, items);
      return groups;
    }, new Map<string, TelegramAdAvailabilitySlot[]>()),
  ).sort(([left], [right]) => left.localeCompare(right));

  return (
    <>
      <Modal open={open} onClose={onClose} title="New ad sale" size="xl">
      <div className="max-h-[78vh] space-y-6 overflow-y-auto pr-1">
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-neutral-400">
              Sale details
            </h3>
            <p className="mt-1 text-sm text-neutral-500">
              Fill contact and payment once, then configure placements for each selected channel on
              the same screen.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Contact" required>
              <div className="space-y-2">
                <Input
                  value={advertiserContact}
                  onChange={(event) => {
                    setAdvertiserContact(event.target.value);
                    setSelectedAdvertiser(null);
                    setSelectedAdvertiserId(null);
                    setAdvertiserMatches([]);
                  }}
                  placeholder="@username, phone, email"
                />
                {selectedAdvertiserId ? (
                  <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
                    Linked to existing advertiser.
                    <button
                      type="button"
                      className="ml-2 text-emerald-100 underline"
                      onClick={() => {
                        setSelectedAdvertiser(null);
                        setSelectedAdvertiserId(null);
                      }}
                    >
                      Unlink
                    </button>
                  </div>
                ) : null}
                {!selectedAdvertiserId && advertiserMatches.length ? (
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950">
                    {advertiserMatches.slice(0, 5).map((advertiser) => (
                      <button
                        key={advertiser.id}
                        type="button"
                        className="flex w-full items-start justify-between gap-3 border-b border-neutral-800 px-3 py-2 text-left last:border-b-0 hover:bg-neutral-900"
                        onClick={() => {
                          setSelectedAdvertiser(advertiser);
                          setSelectedAdvertiserId(advertiser.id);
                          setAdvertiserTelegram(advertiser.telegramUsername ?? "");
                          setAdvertiserContact(
                            advertiser.telegramUsername ??
                              advertiser.email ??
                              advertiser.phone ??
                              advertiser.contacts?.find((item) => item.isPrimary)?.value ??
                              "",
                          );
                          setAdvertiserMatches([]);
                        }}
                      >
                        <span>
                          <span className="block text-sm text-white">{advertiser.displayName}</span>
                          <span className="block text-xs text-neutral-400">
                            {advertiser.companyName ||
                              advertiser.telegramUsername ||
                              advertiser.email ||
                              advertiser.phone ||
                              "Existing advertiser"}
                          </span>
                        </span>
                        <span className="text-xs text-neutral-500">{advertiser.totalSalesCount} sales</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </FormField>

            <FormField label="Financial account" required>
              <CustomSelect
                value={accountId}
                onChange={setAccountId}
                placeholder="Select account"
                options={accounts
                  .filter((account) => account.isActive)
                  .map((account) => ({
                    value: account.id,
                    label: `${accountDisplayName(account)} (${account.currency})`,
                    iconUrl: account.iconPresentation?.type === 'image' ? account.iconPresentation.url : undefined,
                    iconEmoji: account.iconPresentation?.type === 'unicode' ? account.iconPresentation.value : undefined,
                    iconFallback: account.name,
                  }))}
              />
              <p className="mt-2 text-xs text-neutral-500">
                Currency is taken automatically from the selected account.
              </p>
            </FormField>

          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <FormField label="Responsible member">
            <MemberSelect value={assignedMemberId} onChange={setAssignedMemberId} defaultToCurrent />
          </FormField>
          <FormField label="Placement source">
            <div className="space-y-2">
              <div className="inline-grid grid-cols-2 rounded-lg border border-neutral-700 bg-neutral-950 p-1">
                {(["network", "channels"] as const).map((mode) => {
                  const selected = channelSelectionMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setChannelSelectionMode(mode);
                        if (mode === "network") {
                          setSelectedChannelIds([]);
                        } else {
                          setSelectedNetworkId("");
                        }
                      }}
                      className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                        selected
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                      }`}
                    >
                      {mode === "network" ? "Network" : "Channels"}
                    </button>
                  );
                })}
              </div>
              {channelSelectionMode === "network" ? (
                <Select
                  value={selectedNetworkId}
                  onChange={(event) => setSelectedNetworkId(event.target.value)}
                >
                  <option value="">Choose network</option>
                  {networks.map((network) => (
                    <option key={network.id} value={network.id}>
                      {network.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <MultiSelect
                  value={selectedChannelIds}
                  onChange={setSelectedChannelIds}
                  placeholder="Choose channels"
                  options={channels.map((channel) => ({
                    value: channel.id,
                    label: getChannelOptionLabel(channel),
                    selectedLabel: channel.title,
                    iconUrl: channel.photoUrl,
                    iconFallback: channel.title,
                  }))}
                />
              )}
            </div>
          </FormField>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-neutral-400">
                Placements
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                One booking card appears for every selected channel. No extra steps.
              </p>
            </div>
            <div className="rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs text-neutral-400">
              {placements.length} placement{placements.length === 1 ? "" : "s"}
            </div>
          </div>

          {placements.length ? (
            <div className="space-y-3">
              {placements.map((placement) => {
                const channel = channels.find((item) => item.id === placement.channelId);
                const products = productsByChannelId[placement.channelId] ?? [];
                const priceSummary = buildUnderpricingSummary({
                  agreedPrice: placement.agreedPrice,
                  recommendedPrice: placement.recommendedPrice,
                  minimumPrice: placement.minimumPrice,
                });

                return (
                  <div key={placement.key} className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <TelegramEntityAvatar
                          imageUrl={channel?.photoUrl}
                          alt={channel?.title ?? placement.channelId}
                          kind="channel"
                          size="sm"
                        />
                        <p className="truncate font-medium text-white">{channel?.title ?? placement.channelId}</p>
                      </div>
                      <Button onClick={() => void openSlotPicker(placement)}>
                        Find nearby date
                      </Button>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-4">
                      <FormField label="Date">
                        <DateInput
                          value={placement.date}
                          onChange={(event) =>
                            setPlacements((current) =>
                              current.map((item) =>
                                item.key === placement.key
                                  ? {
                                      ...item,
                                      date: event.target.value,
                                      inventoryOpportunityKey: null,
                                      telegramPostId: null,
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </FormField>
                      <FormField label="Time">
                        <TimeInput
                          value={placement.time}
                          onChange={(event) =>
                            setPlacements((current) =>
                              current.map((item) =>
                                item.key === placement.key ? { ...item, time: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </FormField>
                      <FormField label="Format">
                        <Select
                          value={placement.productId}
                          onChange={(event) => {
                            const product = products.find(
                              (candidate) => candidate.id === event.target.value,
                            );
                            const price = productPrice(product);
                            setPlacements((current) =>
                              current.map((item) =>
                                item.key === placement.key
                                  ? {
                                      ...item,
                                      productId: event.target.value,
                                      pricingMode: product?.defaultPricingMode ?? "CPM",
                                      expectedViews: product?.estimatedViews ?? 0,
                                      targetCpm: product?.defaultCpm ?? "0",
                                      recommendedPrice: price,
                                      minimumPrice: product?.minimumPrice ?? price,
                                      agreedPrice: price,
                                      agreedPriceManuallyEdited: false,
                                    }
                                  : item,
                              ),
                            );
                          }}
                        >
                          <option value="">Default</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                      <FormField label="Price">
                        <div className="space-y-1">
                          <Input
                            value={placement.agreedPrice}
                            inputMode="decimal"
                            onChange={(event) =>
                              setPlacements((current) =>
                                current.map((item) =>
                                  item.key === placement.key
                                    ? {
                                        ...item,
                                        agreedPrice: event.target.value,
                                        agreedPriceManuallyEdited: true,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                          <p className="text-xs text-emerald-300">
                            Recommended: {placement.recommendedPrice} {paymentCurrency}
                          </p>
                        </div>
                      </FormField>
                    </div>

                    {(() => {
                      const postsKey = `${placement.channelId}:${placement.date}`;
                      const posts = publishedPostsByPlacement[postsKey] ?? [];
                      const postsLoading = postsLoadingByPlacement[postsKey] ?? false;
                      return (
                        <div className="mt-3">
                          <FormField label="Advertising post">
                            <div
                              onClickCapture={(event) => {
                                const trigger = event.currentTarget.querySelector("button");
                                const clickedButton = (event.target as HTMLElement).closest("button");
                                const selectorIsClosed =
                                  event.currentTarget.querySelectorAll("button").length === 1;
                                if (clickedButton === trigger && selectorIsClosed) {
                                  void loadPublishedPosts(placement);
                                }
                              }}
                            >
                              <Select
                                value={placement.telegramPostId ?? ""}
                                onChange={(event) => {
                                  const selectedPost = posts.find(
                                    (post) => post.id === event.target.value,
                                  );
                                  setPlacements((current) =>
                                    current.map((item) =>
                                      item.key === placement.key
                                        ? {
                                            ...item,
                                            telegramPostId: selectedPost?.id ?? null,
                                            time: selectedPost
                                              ? channelLocalTime(
                                                  selectedPost.publishedAt,
                                                  item.timezone,
                                                )
                                              : item.time,
                                          }
                                        : item,
                                    ),
                                  );
                                }}
                              >
                                <option value="">Not linked to a published post</option>
                                {postsLoading ? (
                                  <option value="__loading" disabled>
                                    Loading posts...
                                  </option>
                                ) : null}
                                {posts.map((post) => (
                                  <option key={post.id} value={post.id}>
                                    {channelLocalTime(post.publishedAt, placement.timezone)} · {post.title}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          </FormField>
                        </div>
                      );
                    })()}

                    {priceSummary.isBelowMinimum ? (
                      <div className="mt-3">
                        <FormField label="Reason for low price" required>
                          <Textarea
                            rows={2}
                            value={placement.manualPriceReason}
                            onChange={(event) =>
                              setPlacements((current) =>
                                current.map((item) =>
                                  item.key === placement.key
                                    ? { ...item, manualPriceReason: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </FormField>
                      </div>
                    ) : null}

                    {placement.conflict ? (
                      <p className="mt-3 rounded-lg border border-rose-700 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
                        {placement.conflict}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-950/50 p-4 text-sm text-neutral-400">
              Select a network or one or more channels to generate booking rows.
            </div>
          )}
        </section>

      </div>

      {submissionError ? (
        <p className="mt-4 rounded-lg border border-rose-700 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
          {submissionError}
        </p>
      ) : null}

      <div className="mt-5 flex justify-end gap-2">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !canSubmit}>
            Create sale
          </Button>
        </div>
      </div>
      </Modal>

      <Modal
        open={Boolean(slotPickerPlacement)}
        onClose={() => setSlotPickerPlacementKey(null)}
        title="Choose a nearby date"
        size="xl"
      >
        <p className="mb-4 text-sm text-neutral-400">
          {slotPickerPlacement
            ? `Available dates for ${channels.find((channel) => channel.id === slotPickerPlacement.channelId)?.title ?? "this channel"}. Choose the time manually in the placement.`
            : "Choose an available date. Time stays unchanged."}
        </p>
        {slotPickerLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-24" />)}
          </div>
        ) : slotPickerError ? (
          <p className="rounded-lg border border-rose-700 bg-rose-950/30 p-3 text-sm text-rose-200">{slotPickerError}</p>
        ) : slotsByDate.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {slotsByDate.map(([date, slots]) => {
              const isToday = date === channelLocalDateKey(new Date(), workspaceTimezone);
              const isPast = date < channelLocalDateKey(new Date(), workspaceTimezone);
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => applySlot(slots[0])}
                  className={`rounded-xl border p-3 text-left transition hover:-translate-y-0.5 ${
                    isPast
                      ? "border-rose-700/80 bg-rose-950/30 hover:border-rose-500"
                      : "border-emerald-700/80 bg-emerald-950/30 hover:border-emerald-500"
                  } ${isToday ? "ring-1 ring-emerald-400" : ""}`}
                >
                  <span className="block text-sm font-medium text-white">
                    {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                  <span className={`mt-2 block text-xs ${isPast ? "text-rose-300" : "text-emerald-300"}`}>
                    {isToday ? "Today · Available" : isPast ? "Past date" : "Available"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-neutral-700 p-4 text-sm text-neutral-400">No available slots were found in this period.</p>
        )}
      </Modal>
    </>
  );
}
