import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CalendarSlotCard } from "./calendar-slot-card";

describe("CalendarSlotCard", () => {
  it("renders busy sale state and hides technical slot labels", () => {
    render(
      <CalendarSlotCard
        slot={{
          id: "slot-1",
          channelId: "channel-1",
          date: "2026-08-04",
          inventoryOpportunityKey: "cadence:channel-1:1:2026-08-04",
          scheduledAt: "2026-08-04T18:15:00.000Z",
          timezone: "UTC",
          source: "1 hour before organic post",
          state: "SOLD",
          tone: "SOLD",
          blockingReason: null,
          nextOrganicPostAt: null,
          productId: "product-1",
          expectedViews: 1200,
          recommendedPrice: "180",
          minimumPrice: "140",
          currency: "USD",
          existingPlacement: {
            id: "placement-1",
            saleId: "sale-1",
            status: "PUBLISHED",
          },
          organicPostsCountForDay: 3,
          adsCountForDay: 1,
        }}
        advertiserName="Acme"
        saleTitle="August package"
        paymentStatus="PAID"
        agreedPrice="175"
      />,
    );

    expect(screen.getByText("Ad placement")).toBeTruthy();
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.queryByText("Product")).toBeNull();
    expect(screen.queryByText("Slot")).toBeNull();
    expect(screen.queryByText(/Recommended/)).toBeNull();
  });

  it("renders available and missed opportunities in user-facing language", () => {
    const base = {
      id: "slot-2",
      channelId: "channel-1",
      date: "2026-08-04",
      scheduledAt: "2026-08-04T12:00:00.000Z",
      timezone: "Europe/Warsaw",
      source: "cadence",
      blockingReason: null,
      nextOrganicPostAt: null,
      productId: null,
      expectedViews: 1200,
      recommendedPrice: "180",
      minimumPrice: "140",
      currency: "USD",
      existingPlacement: null,
      organicPostsCountForDay: 3,
      adsCountForDay: 0,
    } as const;

    render(
      <>
        <CalendarSlotCard slot={{ ...base, state: "AVAILABLE", tone: "AVAILABLE" }} />
        <CalendarSlotCard slot={{ ...base, id: "slot-3", state: "PAST", tone: "PAST" }} />
      </>,
    );

    expect(screen.getByText("Add Ad Slot")).toBeTruthy();
    expect(screen.getByText("Missed ad slot")).toBeTruthy();
    expect(screen.queryByText("Create deal")).toBeNull();
    expect(screen.queryByText("Record sold slot")).toBeNull();
  });
});
