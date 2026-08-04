import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdCampaignsTable } from "@/components/ad-campaigns/campaigns-table";
import type { AdCampaign } from "@/lib/api";
import { renderWithProviders } from "@/test/render-with-providers";

function campaign(overrides: Partial<AdCampaign> = {}): AdCampaign {
  return {
    id: "campaign-1",
    title: "Campaign",
    telegramChannelId: "channel-1",
    advertisingChannels: [],
    price: 100,
    priceInPrimaryCurrency: 100,
    exchangeRateToPrimary: 1,
    currency: "USD",
    joinedCount: 0,
    inviteLinks: [],
    admissionViewAnalytics: null,
    ...overrides,
  };
}

function renderTable(campaigns: AdCampaign[]) {
  return renderWithProviders(
    <AdCampaignsTable
      campaigns={campaigns}
      moneySettings={{ currencyDisplayMode: "code" }}
      rates={[]}
      showActions={false}
      showHypotheses={false}
    />,
  );
}

describe("AdCampaignsTable admission view analytics", () => {
  it("renders exact batch uplift, estimated active and activation", () => {
    renderTable([
      campaign({
        admissionViewAnalytics: {
          batchesCount: 1,
          latestBatch: {
            id: "batch-1",
            status: "ACTIVE",
            detectionMode: "EXACT_DELTA",
            dataQuality: "GOOD",
            dataQualityReason: null,
            analysisStartedAt: "2026-01-01T00:00:00.000Z",
            firstObservedAt: "2026-01-01T00:00:00.000Z",
            endedAt: null,
            releasedSubscribersCount: 500,
            baselineMethod: "PRE_ADMISSION",
            baselineAvgViews: 200,
            currentAvgViews: 385,
            cumulativeAvgViewsUplift: 185,
            incrementalAvgViewsUplift: 35,
            estimatedActiveSubscribers: 185,
            activationRate: 37,
            trackedPostsCount: 5,
            originalTrackedPostsCount: 5,
            lastCollectedAt: "2026-01-02T00:00:00.000Z",
          },
          points: [
            {
              collectedAt: "2026-01-01T00:00:00.000Z",
              avgViews: 300,
              cumulativeAvgViewsUplift: 100,
              incrementalAvgViewsUplift: 100,
              estimatedActiveSubscribers: 100,
              activationRate: 20,
            },
            {
              collectedAt: "2026-01-02T00:00:00.000Z",
              avgViews: 385,
              cumulativeAvgViewsUplift: 185,
              incrementalAvgViewsUplift: 35,
              estimatedActiveSubscribers: 185,
              activationRate: 37,
            },
          ],
        },
      }),
    ]);

    expect(screen.getAllByText("View uplift").length).toBeGreaterThan(0);
    expect(screen.getByText("Exact")).toBeInTheDocument();
    expect(screen.getByText(/\+500/)).toBeInTheDocument();
    expect(screen.getByText(/\+185/)).toBeInTheDocument();
    expect(screen.getByText(/185 \/ 500/)).toBeInTheDocument();
    expect(screen.getByText(/Activation 37.0%/)).toBeInTheDocument();
  });

  it("renders bootstrap batch as reconstructed observed growth", () => {
    renderTable([
      campaign({
        admissionViewAnalytics: {
          batchesCount: 1,
          latestBatch: {
            id: "batch-1",
            status: "ACTIVE",
            detectionMode: "BOOTSTRAPPED_CUMULATIVE",
            dataQuality: "PARTIAL",
            dataQualityReason: "using_earliest_observed_metrics",
            analysisStartedAt: "2026-01-01T00:00:00.000Z",
            firstObservedAt: "2026-01-02T00:00:00.000Z",
            endedAt: null,
            releasedSubscribersCount: 500,
            baselineMethod: "EARLIEST_OBSERVED",
            baselineAvgViews: 240,
            currentAvgViews: 385,
            cumulativeAvgViewsUplift: 145,
            incrementalAvgViewsUplift: 50,
            estimatedActiveSubscribers: 145,
            activationRate: 29,
            trackedPostsCount: 5,
            originalTrackedPostsCount: 5,
            lastCollectedAt: "2026-01-03T00:00:00.000Z",
          },
          points: [],
        },
      }),
    ]);

    expect(screen.getByText("Reconstructed")).toBeInTheDocument();
    expect(screen.getByText(/Joined before first tracked sync/)).toBeInTheDocument();
    expect(screen.getByText(/Observed view growth/)).toBeInTheDocument();
    expect(screen.getByText(/Activation estimate 29.0%/)).toBeInTheDocument();
  });

  it("shows released group and warning when baseline is insufficient", () => {
    renderTable([
      campaign({
        admissionViewAnalytics: {
          batchesCount: 1,
          latestBatch: {
            id: "batch-1",
            status: "ACTIVE",
            detectionMode: "EXACT_DELTA",
            dataQuality: "INSUFFICIENT",
            dataQualityReason: "missing_pre_admission_post_metrics",
            analysisStartedAt: "2026-01-01T00:00:00.000Z",
            firstObservedAt: "2026-01-02T00:00:00.000Z",
            endedAt: null,
            releasedSubscribersCount: 500,
            baselineMethod: "UNAVAILABLE",
            baselineAvgViews: null,
            currentAvgViews: null,
            cumulativeAvgViewsUplift: null,
            incrementalAvgViewsUplift: null,
            estimatedActiveSubscribers: null,
            activationRate: null,
            trackedPostsCount: 0,
            originalTrackedPostsCount: 0,
            lastCollectedAt: null,
          },
          points: [],
        },
      }),
    ]);

    expect(screen.getByText(/\+500/)).toBeInTheDocument();
    expect(
      screen.getByText(/View growth: not enough historical post data/),
    ).toBeInTheDocument();
    expect(screen.getByText("missing_pre_admission_post_metrics")).toBeInTheDocument();
  });

  it("does not render the block when no batch exists", () => {
    renderTable([campaign()]);

    expect(screen.queryByText("View uplift")).not.toBeInTheDocument();
  });
});
