import { describe, expect, it } from "vitest";
import {
  autoAllocatePayment,
  buildUnderpricingSummary,
  channelLocalTime,
  expandNetworkChannelIds,
} from "./telegram-ad-sales";

describe("telegram-ad-sales helpers", () => {
  it("calculates underpricing boundaries", () => {
    const result = buildUnderpricingSummary({
      recommendedPrice: "180",
      minimumPrice: "150",
      agreedPrice: "120",
    });

    expect(result.recommendedDelta).toBe(60);
    expect(result.minimumDelta).toBe(30);
    expect(result.discountPercent).toBe(20);
    expect(result.isBelowRecommended).toBe(true);
    expect(result.isBelowMinimum).toBe(true);
  });

  it("auto allocates payment to unpaid placements only", () => {
    const result = autoAllocatePayment({
      amount: 160,
      placements: [
        { id: "a", agreedPrice: "100", paidAllocatedAmount: "20" },
        { id: "b", agreedPrice: "90", paidAllocatedAmount: "10" },
        { id: "c", agreedPrice: "50", paidAllocatedAmount: "50" },
      ],
    });

    expect(result.allocations).toEqual([
      { placementId: "a", amount: 80 },
      { placementId: "b", amount: 80 },
    ]);
    expect(result.allocatedTotal).toBe(160);
    expect(result.unallocatedAmount).toBe(0);
  });

  it("warns when payment remains unallocated", () => {
    const result = autoAllocatePayment({
      amount: 250,
      placements: [{ id: "a", agreedPrice: "100", paidAllocatedAmount: "0" }],
    });

    expect(result.allocations).toEqual([{ placementId: "a", amount: 100 }]);
    expect(result.unallocatedAmount).toBe(150);
  });

  it("expands network into unique channels", () => {
    const result = expandNetworkChannelIds({
      selectedChannelIds: ["channel-3"],
      selectedNetworkId: "network-1",
      networks: [
        {
          id: "network-1",
          name: "Network",
          description: null,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
          summary: {
            channelsCount: 2,
            totalSubscribers: 0,
            activeSubscribersEstimate: 0,
            paidActiveSubscribersEstimate: 0,
            viewRate: null,
            totalAdSpend: 0,
            campaignsCount: 0,
            totalJoinedSubscribers: 0,
            avgCpa: null,
            activeCpa: null,
            kpiStatus: "unknown",
            kpiLabel: "Unknown",
          },
          channels: [
            { id: "channel-1", title: "A" },
            { id: "channel-2", title: "B" },
          ],
        } as never,
      ],
    });

    expect(result).toEqual(["channel-3", "channel-1", "channel-2"]);
  });

  it("formats local time consistently", () => {
    expect(channelLocalTime("2026-08-05T18:15:00.000Z")).toMatch(/^\d{2}:\d{2}$/);
  });
});
