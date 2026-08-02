"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  TelegramAdPriceQuote,
  TelegramAdProduct,
  TelegramAdSale,
  TelegramAdvertiser,
  TelegramAdStructuredError,
} from "@telegram-system/shared";
import type {
  TelegramChannel,
  TelegramChannelNetwork,
} from "@/lib/api";
import {
  buildUnderpricingSummary,
  expandNetworkChannelIds,
  getChannelOptionLabel,
  toNumber,
} from "@/lib/telegram-ad-sales";
import {
  Button,
  CurrencySelect,
  DateInput,
  FormField,
  Input,
  Modal,
  MultiSelect,
  Select,
  Textarea,
  TimeInput,
} from "@/components/ui/primitives";
import { MemberSelect } from "@/components/workspace/member-select";

type WizardStep = 0 | 1 | 2 | 3;

export type SalePlacementDraft = {
  key: string;
  channelId: string;
  date: string;
  time: string;
  timezone: string;
  productId: string;
  expectedViews: number;
  targetCpm: string;
  recommendedPrice: string;
  minimumPrice: string;
  agreedPrice: string;
  pricingMode: "CPM" | "FIXED" | "MANUAL";
  manualPriceReason: string;
  warnings: string[];
  conflict: string | null;
};

type QuoteMap = Record<string, TelegramAdPriceQuote | undefined>;

function channelKey(channelId: string) {
  return `placement:${channelId}`;
}

export function SaleWizardModal({
  open,
  onClose,
  channels,
  networks,
  productsByChannelId,
  defaultCurrency,
  supportedCurrencies,
  workspaceTimezone,
  onFindNearestSlot,
  onRequestQuote,
  onSearchAdvertisers,
  onSubmit,
  busy = false,
  initialChannelId,
  initialScheduledAt,
}: {
  open: boolean;
  onClose: () => void;
  channels: TelegramChannel[];
  networks: TelegramChannelNetwork[];
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  defaultCurrency: string;
  supportedCurrencies: string[];
  workspaceTimezone: string;
  onFindNearestSlot: (params: {
    channelId: string;
    productId?: string;
    from: string;
  }) => Promise<{
    scheduledAt: string;
    recommendedPrice: string;
    minimumPrice: string;
    expectedViews: number;
  } | null>;
  onRequestQuote: (params: {
    channelId: string;
    productId?: string;
    pricingMode?: "CPM" | "FIXED" | "MANUAL";
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
    settlementCurrency: string;
    placements: Array<{
      channelId: string;
      productId?: string;
      scheduledAt: string;
      timezone: string;
      agreedPrice: number;
      recommendedPrice: number;
      minimumPrice: number;
      expectedViews: number;
      pricingMode: "CPM" | "FIXED" | "MANUAL";
      manualPriceReason?: string;
    }>;
  }) => Promise<{ sale: TelegramAdSale; conflicts?: TelegramAdStructuredError[] }>;
  busy?: boolean;
  initialChannelId?: string | null;
  initialScheduledAt?: string | null;
}) {
  const [step, setStep] = useState<WizardStep>(0);
  const [advertiserTelegram, setAdvertiserTelegram] = useState("");
  const [advertiserContact, setAdvertiserContact] = useState("");
  const [selectedAdvertiser, setSelectedAdvertiser] = useState<TelegramAdvertiser | null>(null);
  const [selectedAdvertiserId, setSelectedAdvertiserId] = useState<string | null>(null);
  const [advertiserMatches, setAdvertiserMatches] = useState<TelegramAdvertiser[]>([]);
  const [notes, setNotes] = useState("");
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [settlementCurrency, setSettlementCurrency] = useState(defaultCurrency);
  const [selectedNetworkId, setSelectedNetworkId] = useState("");
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [placements, setPlacements] = useState<SalePlacementDraft[]>([]);
  const [_quoteMap, setQuoteMap] = useState<QuoteMap>({});
  const [submissionError, setSubmissionError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setAdvertiserTelegram("");
    setAdvertiserContact("");
    setSelectedAdvertiser(null);
    setSelectedAdvertiserId(null);
    setAdvertiserMatches([]);
    setNotes("");
    setAssignedMemberId("");
    setSettlementCurrency(defaultCurrency);
    setSelectedNetworkId("");
    setSelectedChannelIds(initialChannelId ? [initialChannelId] : []);
    setPlacements(
      initialChannelId
        ? [
            {
              key: channelKey(initialChannelId),
              channelId: initialChannelId,
              date: initialScheduledAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
              time: initialScheduledAt
                ? new Date(initialScheduledAt).toISOString().slice(11, 16)
                : "12:00",
              timezone: workspaceTimezone,
              productId: productsByChannelId[initialChannelId]?.[0]?.id ?? "",
              expectedViews: 0,
              targetCpm: "0",
              recommendedPrice: "0",
              minimumPrice: "0",
              agreedPrice: "0",
              pricingMode: "CPM",
              manualPriceReason: "",
              warnings: [],
              conflict: null,
            },
          ]
        : [],
    );
    setQuoteMap({});
    setSubmissionError("");
  }, [
    defaultCurrency,
    initialChannelId,
    initialScheduledAt,
    open,
    productsByChannelId,
    workspaceTimezone,
  ]);

  useEffect(() => {
    if (!open) return;
    const search = advertiserContact.trim();
    if (search.length < 2 || selectedAdvertiserId) {
      setAdvertiserMatches([]);
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
    if (!effectiveChannelIds.length) {
      setPlacements([]);
      return;
    }
    setPlacements((current) => {
      const byChannelId = new Map(current.map((item) => [item.channelId, item] as const));
      return effectiveChannelIds.map((channelId) => {
        const existing = byChannelId.get(channelId);
        if (existing) return existing;
        return {
          key: channelKey(channelId),
          channelId,
          date: new Date().toISOString().slice(0, 10),
          time: "12:00",
          timezone: workspaceTimezone,
          productId: productsByChannelId[channelId]?.[0]?.id ?? "",
          expectedViews: 0,
          targetCpm: "0",
          recommendedPrice: "0",
          minimumPrice: "0",
          agreedPrice: "0",
          pricingMode: "CPM",
          manualPriceReason: "",
          warnings: [],
          conflict: null,
        };
      });
    });
  }, [effectiveChannelIds, productsByChannelId, workspaceTimezone]);

  useEffect(() => {
    let cancelled = false;
    async function loadQuotes() {
      for (const placement of placements) {
        const quote = await onRequestQuote({
          channelId: placement.channelId,
          productId: placement.productId || undefined,
          pricingMode: placement.pricingMode,
        });
        if (cancelled) return;
        setQuoteMap((current) => ({ ...current, [placement.key]: quote }));
        setPlacements((current) =>
          current.map((item) =>
            item.key !== placement.key
              ? item
              : {
                  ...item,
                  expectedViews: quote.expectedViews,
                  targetCpm: quote.targetCpm,
                  recommendedPrice: quote.recommendedPrice,
                  minimumPrice: quote.minimumPrice,
                  agreedPrice:
                    toNumber(item.agreedPrice) > 0 ? item.agreedPrice : quote.recommendedPrice,
                  warnings: quote.warnings.map((warning) => warning.message),
                },
          ),
        );
      }
    }
    if (open && placements.length) {
      void loadQuotes();
    }
    return () => {
      cancelled = true;
    };
  }, [onRequestQuote, open, placements]);

  const summary = useMemo(() => {
    const totals = placements.reduce(
      (acc, placement) => {
        acc.expectedViews += placement.expectedViews;
        acc.recommended += toNumber(placement.recommendedPrice);
        acc.minimum += toNumber(placement.minimumPrice);
        acc.agreed += toNumber(placement.agreedPrice);
        const underpricing = buildUnderpricingSummary({
          recommendedPrice: placement.recommendedPrice,
          minimumPrice: placement.minimumPrice,
          agreedPrice: placement.agreedPrice,
        });
        acc.underpricing += underpricing.minimumDelta;
        return acc;
      },
      { expectedViews: 0, recommended: 0, minimum: 0, agreed: 0, underpricing: 0 },
    );
    return {
      ...totals,
      blendedCpm:
        totals.expectedViews > 0 ? Number(((totals.agreed / totals.expectedViews) * 1000).toFixed(2)) : 0,
    };
  }, [placements]);

  async function submit() {
    setSubmissionError("");
    try {
      const normalizedContact = advertiserContact.trim();
      const derivedAdvertiserName = selectedAdvertiser?.displayName || normalizedContact;
      const result = await onSubmit({
        advertiserId: selectedAdvertiserId,
        createAdvertiser: !selectedAdvertiserId,
        advertiserName: derivedAdvertiserName,
        advertiserTelegram:
          normalizedContact.startsWith("@") && !advertiserTelegram.trim()
            ? normalizedContact
            : advertiserTelegram.trim() || undefined,
        advertiserContact: normalizedContact || undefined,
        notes: notes.trim() || undefined,
        assignedMemberId: assignedMemberId || null,
        settlementCurrency,
        placements: placements.map((placement) => ({
          channelId: placement.channelId,
          productId: placement.productId || undefined,
          scheduledAt: new Date(`${placement.date}T${placement.time}:00`).toISOString(),
          timezone: placement.timezone,
          agreedPrice: toNumber(placement.agreedPrice),
          recommendedPrice: toNumber(placement.recommendedPrice),
          minimumPrice: toNumber(placement.minimumPrice),
          expectedViews: placement.expectedViews,
          pricingMode: placement.pricingMode,
          manualPriceReason: placement.manualPriceReason.trim() || undefined,
        })),
      });

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
        setStep(2);
        return;
      }

      onClose();
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Could not create sale");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New ad sale" size="xl">
      <div className="mb-4 flex flex-wrap gap-2">
        {["Contact", "Channels", "Booking", "Review"].map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index as WizardStep)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              step === index
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-neutral-700 bg-neutral-900 text-neutral-300"
            }`}
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Contact" required>
            <div className="space-y-2">
              <Input
                value={advertiserContact}
                onChange={(event) => {
                  setAdvertiserContact(event.target.value);
                  setSelectedAdvertiser(null);
                  setSelectedAdvertiserId(null);
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

          <FormField label="Settlement currency">
            <CurrencySelect
              value={settlementCurrency}
              onChange={setSettlementCurrency}
              currencies={supportedCurrencies}
            />
          </FormField>

          <FormField label="Responsible member">
            <MemberSelect value={assignedMemberId} onChange={setAssignedMemberId} />
          </FormField>

          <div className="md:col-span-2">
            <FormField label="Notes">
              <Textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </FormField>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <FormField label="Network">
            <Select value={selectedNetworkId} onChange={(event) => setSelectedNetworkId(event.target.value)}>
              <option value="">No network</option>
              {networks.map((network) => (
                <option key={network.id} value={network.id}>
                  {network.name}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="font-medium text-white">Channels</h4>
              <p className="text-xs text-neutral-400">
                Network channels are added automatically, but you can remove or add more.
              </p>
            </div>
            <MultiSelect
              value={selectedChannelIds}
              onChange={setSelectedChannelIds}
              placeholder="Choose channels"
              options={channels.map((channel) => ({
                value: channel.id,
                label: getChannelOptionLabel(channel),
                iconUrl: channel.photoUrl,
                iconFallback: channel.title,
              }))}
            />
          </div>
        </div>
      ) : null}

      {step === 2 ? (
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
                  <div>
                    <p className="font-medium text-white">{channel?.title ?? placement.channelId}</p>
                    <p className="text-xs text-neutral-500">{channel?.username || "No username"}</p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      const nearest = await onFindNearestSlot({
                        channelId: placement.channelId,
                        productId: placement.productId || undefined,
                        from: new Date(`${placement.date}T${placement.time}:00`).toISOString(),
                      });
                      if (!nearest) return;
                      setPlacements((current) =>
                        current.map((item) =>
                          item.key !== placement.key
                            ? item
                            : {
                                ...item,
                                date: nearest.scheduledAt.slice(0, 10),
                                time: new Date(nearest.scheduledAt).toISOString().slice(11, 16),
                                expectedViews: nearest.expectedViews,
                                recommendedPrice: nearest.recommendedPrice,
                                minimumPrice: nearest.minimumPrice,
                                conflict: null,
                              },
                        ),
                      );
                    }}
                  >
                    Find nearest slot
                  </Button>
                </div>

                <div className="grid gap-3 lg:grid-cols-6">
                  <FormField label="Date">
                    <DateInput
                      value={placement.date}
                      onChange={(event) =>
                        setPlacements((current) =>
                          current.map((item) =>
                            item.key === placement.key ? { ...item, date: event.target.value } : item,
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
                  <FormField label="Timezone">
                    <Input value={placement.timezone} disabled />
                  </FormField>
                  <FormField label="Format">
                    <Select
                      value={placement.productId}
                      onChange={(event) =>
                        setPlacements((current) =>
                          current.map((item) =>
                            item.key === placement.key ? { ...item, productId: event.target.value } : item,
                          ),
                        )
                      }
                    >
                      <option value="">Default</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Booked price">
                    <Input
                      value={placement.agreedPrice}
                      onChange={(event) =>
                        setPlacements((current) =>
                          current.map((item) =>
                            item.key === placement.key ? { ...item, agreedPrice: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </FormField>
                  <FormField label="Pricing mode">
                    <Select
                      value={placement.pricingMode}
                      onChange={(event) =>
                        setPlacements((current) =>
                          current.map((item) =>
                            item.key === placement.key
                              ? { ...item, pricingMode: event.target.value as SalePlacementDraft["pricingMode"] }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="CPM">CPM</option>
                      <option value="FIXED">Fixed</option>
                      <option value="MANUAL">Manual</option>
                    </Select>
                  </FormField>
                </div>

                <p className="mt-2 text-xs text-neutral-500">
                  Timezone comes from workspace settings and is reused across the whole ad-sales flow.
                </p>

                <div className="mt-3 grid gap-2 text-xs text-neutral-300 md:grid-cols-5">
                  <div>Expected views: {placement.expectedViews.toLocaleString()}</div>
                  <div>Target CPM: {placement.targetCpm}</div>
                  <div>Recommended: {placement.recommendedPrice}</div>
                  <div>Minimum: {placement.minimumPrice}</div>
                  <div>
                    Warning:{" "}
                    {priceSummary.isBelowMinimum
                      ? `Critical · -${priceSummary.minimumDelta} · ${priceSummary.discountPercent}%`
                      : priceSummary.isBelowRecommended
                        ? "Below recommended"
                        : "OK"}
                  </div>
                </div>

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
      ) : null}

      {step === 3 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4">
            <h4 className="font-medium text-white">Summary</h4>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-neutral-400">Channels</dt><dd>{effectiveChannelIds.length}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-neutral-400">Placements</dt><dd>{placements.length}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-neutral-400">Expected views</dt><dd>{summary.expectedViews.toLocaleString()}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-neutral-400">Recommended total</dt><dd>{summary.recommended.toFixed(2)} {settlementCurrency}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-neutral-400">Minimum total</dt><dd>{summary.minimum.toFixed(2)} {settlementCurrency}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-neutral-400">Agreed total</dt><dd>{summary.agreed.toFixed(2)} {settlementCurrency}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-neutral-400">Underpricing</dt><dd>{summary.underpricing.toFixed(2)} {settlementCurrency}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-neutral-400">Blended CPM</dt><dd>{summary.blendedCpm.toFixed(2)}</dd></div>
            </dl>
          </div>
          <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-950/50 p-4 text-sm text-neutral-400">
            Final reservation and conflict validation still runs on the backend. If a slot became busy during editing, the form stays open and only conflicting placement rows are marked.
          </div>
        </div>
      ) : null}

      {submissionError ? (
        <p className="mt-4 rounded-lg border border-rose-700 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
          {submissionError}
        </p>
      ) : null}

      <div className="mt-5 flex justify-between gap-2">
        <Button
          variant="secondary"
          onClick={() => setStep((current) => Math.max(0, current - 1) as WizardStep)}
          disabled={step === 0 || busy}
        >
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {step < 3 ? (
            <Button
              onClick={() => setStep((current) => Math.min(3, current + 1) as WizardStep)}
              disabled={busy || (step === 0 && !advertiserContact.trim()) || (step === 1 && !effectiveChannelIds.length)}
            >
              Next
            </Button>
          ) : (
            <Button onClick={() => void submit()} disabled={busy || !placements.length}>
              Create sale
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
