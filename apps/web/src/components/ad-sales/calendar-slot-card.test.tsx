import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CalendarSlotCard } from "./calendar-slot-card";

describe("CalendarSlotCard", () => {
  it("renders busy sale slot state and payment badge", () => {
    render(
      <CalendarSlotCard
        slot={{
          id: "slot-1",
          channelId: "channel-1",
          date: "2026-08-04",
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

    expect(screen.getByText("Sold")).toBeTruthy();
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.getByText(/UTC/)).toBeTruthy();
  });
});
