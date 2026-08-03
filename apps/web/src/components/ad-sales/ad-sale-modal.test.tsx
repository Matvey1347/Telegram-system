import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { AdSaleModal } from "./ad-sale-modal";

function renderModal(overrides: Partial<ComponentProps<typeof AdSaleModal>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const props: ComponentProps<typeof AdSaleModal> = {
    open: true,
    onClose: vi.fn(),
    accounts: [
      {
        id: "account-1",
        name: "Operating account",
        currency: "UAH",
        isActive: true,
      },
    ] as never,
    channels: [
      {
        id: "channel-1",
        title: "Example channel",
        photoUrl: "https://example.test/channel.png",
      },
    ] as never,
    networks: [],
    productsByChannelId: {
      "channel-1": [
        {
          id: "format-1",
          name: "1/24",
          currency: "UAH",
          defaultPricingMode: "CPM",
          defaultCpm: "100",
          defaultFixedPrice: null,
          minimumPrice: "125",
          estimatedViews: 1_250,
          estimatedPrice: "125",
          isActive: true,
          position: 0,
        },
        {
          id: "format-2",
          name: "2/48",
          currency: "UAH",
          defaultPricingMode: "CPM",
          defaultCpm: "100",
          defaultFixedPrice: null,
          minimumPrice: "250",
          estimatedViews: 2_500,
          estimatedPrice: "250",
          isActive: true,
          position: 1,
        },
      ] as never,
    },
    defaultCurrency: "UAH",
    workspaceTimezone: "Europe/Warsaw",
    initialChannelId: "channel-1",
    onLoadAvailableSlots: vi.fn().mockResolvedValue([]),
    onLoadPublishedPosts: vi.fn().mockResolvedValue([]),
    onRequestQuote: vi.fn().mockImplementation(({ productId }) =>
      Promise.resolve({
        expectedViews: productId === "format-2" ? 2_500 : 1_250,
        targetCpm: "100",
        recommendedPrice: productId === "format-2" ? "250" : "125",
        minimumPrice: productId === "format-2" ? "250" : "125",
        warnings: [],
      }),
    ),
    onSearchAdvertisers: vi.fn().mockResolvedValue([]),
    onSubmit: vi.fn().mockResolvedValue({}),
    ...overrides,
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <AdSaleModal {...props} />
    </QueryClientProvider>,
  );
}

describe("AdSaleModal", () => {
  it("uses one toggled field for network or channel selection", () => {
    renderModal();

    const responsibleMember = screen.getByText("Responsible member");
    const detailsRow = responsibleMember.parentElement?.parentElement;
    expect(detailsRow?.textContent).toContain("Placement source");
    expect(detailsRow?.textContent).toContain("Network");
    expect(detailsRow?.textContent).toContain("Channels");
    expect(screen.getByRole("button", { name: "Channels" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Example channel" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Network" }));
    expect(screen.getByRole("button", { name: "Choose network" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Example channel" })).toBeNull();
    expect(screen.queryByText(/Expected views:/)).toBeNull();
    expect(screen.queryByText(/Minimum:/)).toBeNull();
    expect(screen.queryByText(/Warning:/)).toBeNull();
  });

  it("fills the calculated Setup price and refreshes it when the format changes", async () => {
    renderModal();

    const firstRecommendation = await screen.findByText("Recommended: 125 UAH");
    expect(firstRecommendation.parentElement?.querySelector("input")?.value).toBe("125");

    fireEvent.click(screen.getByRole("button", { name: "1/24" }));
    fireEvent.click(await screen.findByRole("button", { name: "2/48" }));

    const secondRecommendation = await screen.findByText("Recommended: 250 UAH");
    expect(secondRecommendation.parentElement?.querySelector("input")?.value).toBe("250");
  });

  it("uses nearby only for the date and marks past and available dates", async () => {
    renderModal({
      onLoadAvailableSlots: vi.fn().mockResolvedValue([
        {
          channelId: "channel-1",
          date: "2000-01-01",
          scheduledAt: "2000-01-01T08:00:00.000Z",
          timezone: "Europe/Warsaw",
          state: "PAST",
        },
        {
          channelId: "channel-1",
          date: "2099-01-01",
          scheduledAt: "2099-01-01T18:00:00.000Z",
          timezone: "Europe/Warsaw",
          state: "AVAILABLE",
        },
      ] as never),
    });

    fireEvent.click(screen.getByText("Find nearby date"));
    const pastDate = await screen.findByText("Past date");
    const availableDate = await screen.findByText("Available");
    expect(pastDate.closest("button")?.className).toContain("rose");
    expect(availableDate.closest("button")?.className).toContain("emerald");

    fireEvent.click(availableDate.closest("button")!);
    expect(screen.getByDisplayValue("2099-01-01")).toBeTruthy();
    expect(screen.getByDisplayValue("12:00")).toBeTruthy();
  });

  it("loads published posts on open and uses the selected post time", async () => {
    const onLoadPublishedPosts = vi.fn().mockResolvedValue([
      {
        id: "post-1",
        title: "Published campaign post",
        publishedAt: "2026-08-02T17:00:00+02:00",
      },
    ]);
    renderModal({
      onLoadPublishedPosts,
    });

    expect(await screen.findByText("Advertising post")).toBeTruthy();
    expect(onLoadPublishedPosts).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("12:00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Not linked to a published post" }));
    expect(onLoadPublishedPosts).toHaveBeenCalledTimes(1);

    const postOption = await screen.findByRole("button", {
      name: /17:00 · Published campaign post/,
    });
    fireEvent.click(postOption);

    expect(screen.getByDisplayValue("17:00")).toBeTruthy();
    expect(screen.getByRole("button", { name: /17:00 · Published campaign post/ })).toBeTruthy();
  });

  it("keeps the post selector available and retries after a loading failure", async () => {
    const onLoadPublishedPosts = vi.fn().mockRejectedValue(new Error("Telegram unavailable"));
    renderModal({ onLoadPublishedPosts });

    const selector = await screen.findByRole("button", {
      name: "Not linked to a published post",
    });
    fireEvent.click(selector);
    await waitFor(() => expect(screen.queryByText("Loading posts...")).toBeNull());

    fireEvent.click(selector);
    expect(onLoadPublishedPosts).toHaveBeenCalledTimes(1);
    fireEvent.click(selector);
    await waitFor(() => expect(onLoadPublishedPosts).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Advertising post")).toBeTruthy();
  });
});
