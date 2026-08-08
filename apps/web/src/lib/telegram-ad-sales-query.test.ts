import { describe, expect, it, vi } from "vitest";
import { invalidateTelegramAdSalesQueries } from "./telegram-ad-sales-query";

describe("telegram-ad-sales query invalidation", () => {
  it("invalidates sale, dashboard, finance and channel queries", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = {
      invalidateQueries,
    } as never;

    await invalidateTelegramAdSalesQueries(queryClient, {
      saleId: "sale-1",
      channelIds: ["channel-1"],
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["telegram-ad-sales"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["telegram-ad-analytics"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["telegram-ad-sale", "sale-1"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["dashboard-summary"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["transactions"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["telegram-managed-posts-calendar", "channel-1"],
    });
  });
});
