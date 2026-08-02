import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SaleStatusActions, allowedSaleActions } from "./sale-status-actions";

const sale = {
  id: "sale-1",
  workspaceId: "ws-1",
  advertiserName: "Acme",
  advertiserTelegram: null,
  advertiserContact: null,
  title: "Summer pack",
  notes: null,
  status: "RESERVED",
  settlementCurrency: "USD",
  reservedUntil: null,
  createdByUserId: null,
  assignedMemberId: null,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
  placements: [],
  payments: [],
} as const;

describe("allowedSaleActions", () => {
  it("exposes confirm for reserved sale and scheduling actions for reserved placement with post", () => {
    expect(allowedSaleActions(sale as never)).toContain("confirm");
    expect(
      allowedSaleActions(sale as never, {
        id: "placement-1",
        managedPostId: "post-1",
        status: "RESERVED",
        isPermanentSnapshot: false,
        deletedAt: null,
      } as never),
    ).toContain("schedule");
  });
});

describe("SaleStatusActions", () => {
  it("renders only allowed actions", () => {
    const onAction = vi.fn();
    render(
      <SaleStatusActions
        sale={sale as never}
        placement={
          {
            id: "placement-1",
            managedPostId: null,
            status: "DRAFT",
            isPermanentSnapshot: false,
            deletedAt: null,
          } as never
        }
        onAction={onAction}
      />,
    );

    expect(screen.getByRole("button", { name: /create post/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /attach post/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
  });
});
