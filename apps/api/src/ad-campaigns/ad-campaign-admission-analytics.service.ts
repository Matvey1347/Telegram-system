import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  AdCampaignAdmissionBaselineMethod,
  AdCampaignAdmissionBatchStatus,
  AdCampaignAdmissionDataQuality,
  AdCampaignAdmissionDetectionMode,
  AdCampaignAdmissionTimeBoundarySource,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AdmissionAnalyticsStageResult = {
  status: 'processed' | 'skipped' | 'failed';
  backfilledCampaigns: number;
  createdBatches: number;
  createdPoints: number;
  reason?: string;
};

type SourceLinkDelta = {
  telegramInviteLinkId: string;
  inviteLink: string;
  previousSnapshotAt: Date | null;
  currentSnapshotAt: Date;
  joinedBefore: number;
  joinedAfter: number;
  joinedDelta: number;
  requestedBefore: number;
  requestedAfter: number;
  createsJoinRequest: boolean;
};

type AdmissionEvent = {
  adCampaignId: string;
  telegramChannelId: string;
  detectionMode: AdCampaignAdmissionDetectionMode;
  previousSnapshotAt: Date | null;
  currentSnapshotAt: Date;
  analysisStartedAt?: Date;
  timeBoundarySource?: AdCampaignAdmissionTimeBoundarySource;
  sourceLinks: SourceLinkDelta[];
};

type BatchCreateResult = {
  batchId: string | null;
  created: boolean;
  pointsCreated: number;
};

@Injectable()
export class AdCampaignAdmissionAnalyticsService {
  private readonly logger = new Logger(AdCampaignAdmissionAnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  async processCompletedChannelSync(params: {
    workspaceId: string;
    telegramChannelId: string;
    syncStartedAt: Date;
    syncCompletedAt: Date;
    inviteLinksSynced: boolean;
    postMetricsSynced: boolean;
    backfill: (params: {
      workspaceId: string;
      telegramChannelId: string;
      cutoffAt: Date;
    }) => Promise<AdmissionAnalyticsStageResult>;
  }): Promise<AdmissionAnalyticsStageResult> {
    if (!params.inviteLinksSynced || !params.postMetricsSynced) {
      return {
        status: 'skipped',
        backfilledCampaigns: 0,
        createdBatches: 0,
        createdPoints: 0,
        reason: !params.inviteLinksSynced
          ? 'invite-link sync disabled'
          : 'post-metric sync disabled',
      };
    }

    let backfillResult: AdmissionAnalyticsStageResult = {
      status: 'processed',
      backfilledCampaigns: 0,
      createdBatches: 0,
      createdPoints: 0,
    };
    const state = await this.prisma.adCampaignAdmissionBackfillState.findUnique({
      where: {
        workspaceId_telegramChannelId_version: {
          workspaceId: params.workspaceId,
          telegramChannelId: params.telegramChannelId,
          version: 1,
        },
      },
    });
    if (!state) {
      backfillResult = await params.backfill({
        workspaceId: params.workspaceId,
        telegramChannelId: params.telegramChannelId,
        cutoffAt: params.syncStartedAt,
      });
    }

    const runtime = await this.processSnapshotRange({
      workspaceId: params.workspaceId,
      telegramChannelId: params.telegramChannelId,
      fromExclusive: params.syncStartedAt,
      toInclusive: params.syncCompletedAt,
    });

    return {
      status: 'processed',
      backfilledCampaigns: backfillResult.backfilledCampaigns,
      createdBatches: backfillResult.createdBatches + runtime.createdBatches,
      createdPoints: backfillResult.createdPoints + runtime.createdPoints,
      reason: backfillResult.reason,
    };
  }

  async processHistoricalEvents(params: {
    workspaceId: string;
    telegramChannelId: string;
    cutoffAt?: Date;
    adCampaignIds?: string[];
  }) {
    return this.processSnapshotRange({
      workspaceId: params.workspaceId,
      telegramChannelId: params.telegramChannelId,
      toInclusive: params.cutoffAt,
      adCampaignIds: params.adCampaignIds,
    });
  }

  private async processSnapshotRange(params: {
    workspaceId: string;
    telegramChannelId: string;
    fromExclusive?: Date;
    toInclusive?: Date;
    adCampaignIds?: string[];
  }) {
    const campaigns = await this.prisma.adCampaign.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.telegramChannelId,
        ...(params.adCampaignIds?.length ? { id: { in: params.adCampaignIds } } : {}),
        inviteLinks: { some: {} },
      },
      select: {
        id: true,
        workspaceId: true,
        telegramChannelId: true,
        startedAt: true,
        placementDate: true,
        createdAt: true,
        inviteLinks: {
          select: {
            id: true,
            url: true,
            createsJoinRequest: true,
            createdAt: true,
            telegramCreatedAt: true,
          },
        },
      },
    });

    let createdBatches = 0;
    let createdPoints = 0;
    for (const campaign of campaigns) {
      const snapshots = await this.prisma.telegramInviteLinkSnapshot.findMany({
        where: {
          workspaceId: params.workspaceId,
          telegramChannelId: params.telegramChannelId,
          adCampaignId: campaign.id,
          ...(params.toInclusive ? { syncedAt: { lte: params.toInclusive } } : {}),
        },
        orderBy: [{ syncedAt: 'asc' }, { inviteLinkId: 'asc' }],
        select: {
          inviteLinkId: true,
          syncedAt: true,
          joinedCount: true,
          requestedCount: true,
        },
      });
      const events = this.detectEventsForCampaign({
        campaign,
        snapshots,
        fromExclusive: params.fromExclusive,
      });
      for (const event of events) {
        const result = await this.createBatchAndPoints({
          workspaceId: params.workspaceId,
          campaign,
          event,
        });
        if (result.created) createdBatches += 1;
        createdPoints += result.pointsCreated;
      }
    }

    await this.reconcileChannelBatchWindows({
      workspaceId: params.workspaceId,
      telegramChannelId: params.telegramChannelId,
    });

    const batches = await this.prisma.adCampaignAdmissionBatch.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.telegramChannelId,
        ...(params.adCampaignIds?.length ? { adCampaignId: { in: params.adCampaignIds } } : {}),
      },
      select: { id: true },
    });
    for (const batch of batches) {
      createdPoints += await this.createViewPointsForBatch(batch.id);
    }
    return { createdBatches, createdPoints, processedCampaigns: campaigns.length };
  }

  private detectEventsForCampaign(params: {
    campaign: {
      id: string;
      telegramChannelId: string;
      startedAt: Date | null;
      placementDate: Date | null;
      createdAt: Date;
      inviteLinks: Array<{
        id: string;
        url: string;
        createsJoinRequest: boolean | null;
        createdAt: Date;
        telegramCreatedAt: Date | null;
      }>;
    };
    snapshots: Array<{
      inviteLinkId: string;
      syncedAt: Date;
      joinedCount: number;
      requestedCount: number;
    }>;
    fromExclusive?: Date;
  }) {
    const linkById = new Map(params.campaign.inviteLinks.map((link) => [link.id, link]));
    const groupedByLink = new Map<string, typeof params.snapshots>();
    for (const snapshot of params.snapshots) {
      const list = groupedByLink.get(snapshot.inviteLinkId) ?? [];
      list.push(snapshot);
      groupedByLink.set(snapshot.inviteLinkId, list);
    }

    const deltasByObservedAt = new Map<
      string,
      {
        detectionMode: AdCampaignAdmissionDetectionMode;
        previousSnapshotAt: Date | null;
        currentSnapshotAt: Date;
        sourceLinks: SourceLinkDelta[];
      }
    >();

    for (const [inviteLinkId, rows] of groupedByLink.entries()) {
      const link = linkById.get(inviteLinkId);
      if (!link) continue;
      const createsJoinRequest = Boolean(link.createsJoinRequest);
      const first = rows[0];
      if (
        first &&
        Number(first.joinedCount || 0) > 0 &&
        createsJoinRequest &&
        (!params.fromExclusive || first.syncedAt > params.fromExclusive)
      ) {
        this.addDelta(deltasByObservedAt, {
          detectionMode: AdCampaignAdmissionDetectionMode.BOOTSTRAPPED_CUMULATIVE,
          previousSnapshotAt: null,
          currentSnapshotAt: first.syncedAt,
          sourceLinks: [
            {
              telegramInviteLinkId: inviteLinkId,
              inviteLink: link.url,
              previousSnapshotAt: null,
              currentSnapshotAt: first.syncedAt,
              joinedBefore: 0,
              joinedAfter: Number(first.joinedCount || 0),
              joinedDelta: Number(first.joinedCount || 0),
              requestedBefore: 0,
              requestedAfter: Number(first.requestedCount || 0),
              createsJoinRequest,
            },
          ],
        });
      }
      for (let index = 1; index < rows.length; index += 1) {
        const previous = rows[index - 1];
        const current = rows[index];
        if (params.fromExclusive && current.syncedAt <= params.fromExclusive) {
          continue;
        }
        const joinedDelta =
          Number(current.joinedCount || 0) - Number(previous.joinedCount || 0);
        if (joinedDelta <= 0) continue;
        if (!createsJoinRequest && Number(previous.requestedCount || 0) <= 0) {
          continue;
        }
        this.addDelta(deltasByObservedAt, {
          detectionMode: AdCampaignAdmissionDetectionMode.EXACT_DELTA,
          previousSnapshotAt: previous.syncedAt,
          currentSnapshotAt: current.syncedAt,
          sourceLinks: [
            {
              telegramInviteLinkId: inviteLinkId,
              inviteLink: link.url,
              previousSnapshotAt: previous.syncedAt,
              currentSnapshotAt: current.syncedAt,
              joinedBefore: Number(previous.joinedCount || 0),
              joinedAfter: Number(current.joinedCount || 0),
              joinedDelta,
              requestedBefore: Number(previous.requestedCount || 0),
              requestedAfter: Number(current.requestedCount || 0),
              createsJoinRequest,
            },
          ],
        });
      }
    }

    return [...deltasByObservedAt.values()]
      .sort((a, b) => a.currentSnapshotAt.getTime() - b.currentSnapshotAt.getTime())
      .map((event) => {
        const bootstrapped =
          event.detectionMode ===
          AdCampaignAdmissionDetectionMode.BOOTSTRAPPED_CUMULATIVE;
        const boundary = bootstrapped
          ? this.resolveBootstrapBoundary(params.campaign, event.sourceLinks)
          : {
              analysisStartedAt: event.currentSnapshotAt,
              timeBoundarySource:
                AdCampaignAdmissionTimeBoundarySource.FIRST_INVITE_SNAPSHOT,
            };
        return {
          adCampaignId: params.campaign.id,
          telegramChannelId: params.campaign.telegramChannelId,
          ...event,
          ...boundary,
        };
      });
  }

  private addDelta(
    target: Map<
      string,
      {
        detectionMode: AdCampaignAdmissionDetectionMode;
        previousSnapshotAt: Date | null;
        currentSnapshotAt: Date;
        sourceLinks: SourceLinkDelta[];
      }
    >,
    event: {
      detectionMode: AdCampaignAdmissionDetectionMode;
      previousSnapshotAt: Date | null;
      currentSnapshotAt: Date;
      sourceLinks: SourceLinkDelta[];
    },
  ) {
    const key = `${event.detectionMode}:${event.currentSnapshotAt.toISOString()}`;
    const current = target.get(key);
    if (current) {
      current.sourceLinks.push(...event.sourceLinks);
      if (
        event.previousSnapshotAt &&
        (!current.previousSnapshotAt ||
          event.previousSnapshotAt < current.previousSnapshotAt)
      ) {
        current.previousSnapshotAt = event.previousSnapshotAt;
      }
      return;
    }
    target.set(key, { ...event, sourceLinks: [...event.sourceLinks] });
  }

  private resolveBootstrapBoundary(
    campaign: {
      startedAt: Date | null;
      placementDate: Date | null;
      createdAt: Date;
      inviteLinks: Array<{ id: string; createdAt: Date; telegramCreatedAt: Date | null }>;
    },
    sourceLinks: SourceLinkDelta[],
  ) {
    if (campaign.startedAt) {
      return {
        analysisStartedAt: campaign.startedAt,
        timeBoundarySource:
          AdCampaignAdmissionTimeBoundarySource.CAMPAIGN_ACTUAL_START,
      };
    }
    if (campaign.placementDate) {
      return {
        analysisStartedAt: campaign.placementDate,
        timeBoundarySource: AdCampaignAdmissionTimeBoundarySource.CAMPAIGN_START,
      };
    }
    const ids = new Set(sourceLinks.map((link) => link.telegramInviteLinkId));
    const linkCreatedAt = campaign.inviteLinks
      .filter((link) => ids.has(link.id))
      .map((link) => link.telegramCreatedAt ?? link.createdAt)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (linkCreatedAt) {
      return {
        analysisStartedAt: linkCreatedAt,
        timeBoundarySource:
          AdCampaignAdmissionTimeBoundarySource.INVITE_LINK_CREATED,
      };
    }
    return {
      analysisStartedAt: sourceLinks[0].currentSnapshotAt,
      timeBoundarySource:
        AdCampaignAdmissionTimeBoundarySource.FIRST_INVITE_SNAPSHOT,
    };
  }

  private async createBatchAndPoints(params: {
    workspaceId: string;
    campaign: {
      id: string;
      telegramChannelId: string;
      startedAt: Date | null;
      placementDate: Date | null;
      createdAt: Date;
    };
    event: AdmissionEvent;
  }): Promise<BatchCreateResult> {
    const releasedSubscribersCount = params.event.sourceLinks.reduce(
      (sum, link) => sum + link.joinedDelta,
      0,
    );
    if (releasedSubscribersCount <= 0) {
      return { batchId: null, created: false, pointsCreated: 0 };
    }
    const fingerprint = this.batchFingerprint(params.campaign.id, params.event);
    const existing = await this.prisma.adCampaignAdmissionBatch.findUnique({
      where: { batchFingerprint: fingerprint },
      select: { id: true },
    });
    if (existing) {
      return {
        batchId: existing.id,
        created: false,
        pointsCreated: await this.createViewPointsForBatch(existing.id),
      };
    }

    const baselineCutoff =
      params.event.detectionMode ===
      AdCampaignAdmissionDetectionMode.EXACT_DELTA
        ? params.event.previousSnapshotAt ?? params.event.currentSnapshotAt
        : params.event.analysisStartedAt ?? params.event.currentSnapshotAt;
    const baseline = await this.buildBaseline({
      workspaceId: params.workspaceId,
      telegramChannelId: params.event.telegramChannelId,
      analysisStartedAt:
        params.event.analysisStartedAt ?? params.event.currentSnapshotAt,
      baselineCutoff,
      allowEarliestObserved:
        params.event.detectionMode ===
        AdCampaignAdmissionDetectionMode.BOOTSTRAPPED_CUMULATIVE,
    });
    const sourceLinks = params.event.sourceLinks;
    const dataQuality = this.combineDataQuality(
      baseline.dataQuality,
      params.event.detectionMode ===
        AdCampaignAdmissionDetectionMode.BOOTSTRAPPED_CUMULATIVE
        ? AdCampaignAdmissionDataQuality.PARTIAL
        : AdCampaignAdmissionDataQuality.GOOD,
    );
    const dataQualityReason = [
      params.event.detectionMode ===
      AdCampaignAdmissionDetectionMode.BOOTSTRAPPED_CUMULATIVE
        ? 'bootstrapped_from_first_snapshot'
        : null,
      baseline.dataQualityReason,
    ]
      .filter(Boolean)
      .join('; ') || null;

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.adCampaignAdmissionBatch.updateMany({
        where: {
          workspaceId: params.workspaceId,
          telegramChannelId: params.event.telegramChannelId,
          status: AdCampaignAdmissionBatchStatus.ACTIVE,
        },
        data: {
          status: AdCampaignAdmissionBatchStatus.CLOSED,
          endedAt: params.event.currentSnapshotAt,
        },
      });
      return tx.adCampaignAdmissionBatch.create({
        data: {
          workspaceId: params.workspaceId,
          adCampaignId: params.campaign.id,
          telegramChannelId: params.event.telegramChannelId,
          status: AdCampaignAdmissionBatchStatus.ACTIVE,
          detectionMode: params.event.detectionMode,
          analysisStartedAt:
            params.event.analysisStartedAt ?? params.event.currentSnapshotAt,
          firstObservedAt: params.event.currentSnapshotAt,
          startedAt: params.event.currentSnapshotAt,
          timeBoundarySource:
            params.event.timeBoundarySource ??
            AdCampaignAdmissionTimeBoundarySource.FIRST_INVITE_SNAPSHOT,
          releasedSubscribersCount,
          joinedBefore: sourceLinks.reduce(
            (sum, link) => sum + link.joinedBefore,
            0,
          ),
          joinedAfter: sourceLinks.reduce(
            (sum, link) => sum + link.joinedAfter,
            0,
          ),
          requestedBefore: sourceLinks.reduce(
            (sum, link) => sum + link.requestedBefore,
            0,
          ),
          requestedAfter: sourceLinks.reduce(
            (sum, link) => sum + link.requestedAfter,
            0,
          ),
          sourceLinks: sourceLinks as unknown as Prisma.InputJsonValue,
          baselineSnapshotAt: baseline.baselineSnapshotAt,
          baselineMethod: baseline.baselineMethod,
          trackedPosts: baseline.trackedPosts as unknown as Prisma.InputJsonValue,
          trackedPostsCount: baseline.originalTrackedPostsCount,
          baselineAvgViews: baseline.baselineAvgViews,
          baselineAvgReactions: baseline.baselineAvgReactions,
          dataQuality,
          dataQualityReason,
          batchFingerprint: fingerprint,
        },
        select: { id: true },
      });
    });

    return {
      batchId: created.id,
      created: true,
      pointsCreated: await this.createViewPointsForBatch(created.id),
    };
  }

  private async reconcileChannelBatchWindows(params: {
    workspaceId: string;
    telegramChannelId: string;
  }) {
    const batches = await this.prisma.adCampaignAdmissionBatch.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.telegramChannelId,
      },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        status: true,
      },
    });
    const startedTimes = [
      ...new Set(batches.map((batch) => batch.startedAt.getTime())),
    ].sort((a, b) => a - b);
    const nextStartedByStartedAt = new Map<number, Date | null>();
    for (let index = 0; index < startedTimes.length; index += 1) {
      nextStartedByStartedAt.set(
        startedTimes[index],
        startedTimes[index + 1] == null ? null : new Date(startedTimes[index + 1]),
      );
    }
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      const nextEndedAt =
        nextStartedByStartedAt.get(batch.startedAt.getTime()) ?? null;
      const nextStatus = nextEndedAt
        ? AdCampaignAdmissionBatchStatus.CLOSED
        : AdCampaignAdmissionBatchStatus.ACTIVE;
      const endedChanged =
        (batch.endedAt?.getTime() ?? null) !==
        (nextEndedAt?.getTime() ?? null);
      const statusChanged = batch.status !== nextStatus;
      if (endedChanged || statusChanged) {
        await this.prisma.adCampaignAdmissionBatch.update({
          where: { id: batch.id },
          data: {
            endedAt: nextEndedAt,
            status: nextStatus,
          },
        });
      }
      if (nextEndedAt) {
        await this.prisma.adCampaignAdmissionViewSnapshot.deleteMany({
          where: {
            batchId: batch.id,
            sourceMetricCollectedAt: { gte: nextEndedAt },
          },
        });
      }
    }
  }

  private async buildBaseline(params: {
    workspaceId: string;
    telegramChannelId: string;
    analysisStartedAt: Date;
    baselineCutoff: Date;
    allowEarliestObserved: boolean;
  }) {
    const channel = await this.prisma.telegramChannel.findFirst({
      where: {
        id: params.telegramChannelId,
        workspaceId: params.workspaceId,
      },
      select: { activeSubscribersWindow: true },
    });
    const take = Math.max(1, Math.min(50, Number(channel?.activeSubscribersWindow || 5)));
    const posts = await this.prisma.telegramPost.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.telegramChannelId,
        excludeFromAnalytics: false,
        postDate: { lt: params.analysisStartedAt },
      },
      orderBy: [{ postDate: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        telegramMessageId: true,
        postDate: true,
      },
    });
    if (!posts.length) {
      return {
        baselineSnapshotAt: null,
        baselineMethod: AdCampaignAdmissionBaselineMethod.UNAVAILABLE,
        trackedPosts: [],
        originalTrackedPostsCount: 0,
        baselineAvgViews: null,
        baselineAvgReactions: null,
        dataQuality: AdCampaignAdmissionDataQuality.INSUFFICIENT,
        dataQualityReason: 'no_eligible_posts',
      };
    }

    const trackedPosts: Array<{
      telegramPostId: string;
      telegramMessageId: string;
      postDate: Date;
      baselineSnapshotAt: Date;
      baselineViews: number | null;
      baselineReactions: number | null;
    }> = [];
    let usedEarliestObserved = false;
    for (const post of posts) {
      let snapshot = await this.prisma.telegramPostMetricSnapshot.findFirst({
        where: {
          telegramPostId: post.id,
          collectedAt: { lte: params.baselineCutoff },
        },
        orderBy: { collectedAt: 'desc' },
        select: { collectedAt: true, viewsCount: true, reactionsCount: true },
      });
      if (!snapshot && params.allowEarliestObserved) {
        snapshot = await this.prisma.telegramPostMetricSnapshot.findFirst({
          where: {
            telegramPostId: post.id,
            collectedAt: { gte: params.analysisStartedAt },
          },
          orderBy: { collectedAt: 'asc' },
          select: { collectedAt: true, viewsCount: true, reactionsCount: true },
        });
        if (snapshot) usedEarliestObserved = true;
      }
      if (!snapshot) continue;
      trackedPosts.push({
        telegramPostId: post.id,
        telegramMessageId: post.telegramMessageId,
        postDate: post.postDate,
        baselineSnapshotAt: snapshot.collectedAt,
        baselineViews: snapshot.viewsCount,
        baselineReactions: snapshot.reactionsCount,
      });
    }
    if (!trackedPosts.length) {
      return {
        baselineSnapshotAt: null,
        baselineMethod: AdCampaignAdmissionBaselineMethod.UNAVAILABLE,
        trackedPosts: posts.map((post) => ({
          telegramPostId: post.id,
          telegramMessageId: post.telegramMessageId,
          postDate: post.postDate,
          baselineSnapshotAt: null,
          baselineViews: null,
          baselineReactions: null,
        })),
        originalTrackedPostsCount: posts.length,
        baselineAvgViews: null,
        baselineAvgReactions: null,
        dataQuality: AdCampaignAdmissionDataQuality.INSUFFICIENT,
        dataQualityReason: 'missing_pre_admission_post_metrics',
      };
    }
    const baselineViews = trackedPosts
      .map((post) => this.numberOrNull(post.baselineViews))
      .filter((value): value is number => value != null);
    const baselineReactions = trackedPosts
      .map((post) => this.numberOrNull(post.baselineReactions))
      .filter((value): value is number => value != null);
    const dataQuality =
      usedEarliestObserved || trackedPosts.length < posts.length
        ? AdCampaignAdmissionDataQuality.PARTIAL
        : AdCampaignAdmissionDataQuality.GOOD;
    const dataQualityReason = usedEarliestObserved
      ? 'using_earliest_observed_metrics'
      : trackedPosts.length < posts.length
        ? 'partial_tracked_post_set'
        : null;
    return {
      baselineSnapshotAt: trackedPosts
        .map((post) => post.baselineSnapshotAt)
        .sort((a, b) => b.getTime() - a.getTime())[0],
      baselineMethod: usedEarliestObserved
        ? AdCampaignAdmissionBaselineMethod.EARLIEST_OBSERVED
        : AdCampaignAdmissionBaselineMethod.PRE_ADMISSION,
      trackedPosts,
      originalTrackedPostsCount: posts.length,
      baselineAvgViews: baselineViews.length ? this.average(baselineViews) : null,
      baselineAvgReactions: baselineReactions.length
        ? this.average(baselineReactions)
        : null,
      dataQuality,
      dataQualityReason,
    };
  }

  async createViewPointsForBatch(batchId: string) {
    const batch = await this.prisma.adCampaignAdmissionBatch.findUnique({
      where: { id: batchId },
      include: {
        telegramChannel: { select: { currentSubscribersCount: true } },
        viewSnapshots: {
          orderBy: { sourceMetricCollectedAt: 'desc' },
          take: 1,
          select: {
            sourceMetricCollectedAt: true,
            cumulativeAvgViewsUplift: true,
          },
        },
      },
    });
    if (!batch) return 0;
    const windowBatches = await this.prisma.adCampaignAdmissionBatch.findMany({
      where: {
        workspaceId: batch.workspaceId,
        telegramChannelId: batch.telegramChannelId,
        startedAt: batch.startedAt,
      },
      select: {
        id: true,
        releasedSubscribersCount: true,
        joinedBefore: true,
      },
    });
    const primaryWindowBatches = windowBatches.filter(
      (item) => item.joinedBefore === 0 && item.releasedSubscribersCount > 0,
    );
    const attributionWindowBatches =
      primaryWindowBatches.length > 1 ? primaryWindowBatches : windowBatches;
    const participatesInAttributionWindow = attributionWindowBatches.some(
      (item) => item.id === batch.id,
    );
    const windowReleasedSubscribers = attributionWindowBatches.reduce(
      (sum, item) => sum + item.releasedSubscribersCount,
      0,
    );
    const trackedPosts = Array.isArray(batch.trackedPosts)
      ? (batch.trackedPosts as Array<{ telegramPostId?: string }>)
      : [];
    const postIds = trackedPosts
      .map((post) => String(post.telegramPostId || ''))
      .filter(Boolean);
    if (!postIds.length) return 0;
    const lastPoint = batch.viewSnapshots[0] ?? null;
    const timestampRows = await this.prisma.$queryRaw<
      Array<{ collectedAt: Date | null }>
    >(
      Prisma.sql`
        SELECT MAX("collectedAt") AS "collectedAt"
        FROM "TelegramPostMetricSnapshot"
        WHERE "telegramPostId" IN (${Prisma.join(postIds)})
          AND "collectedAt" >= ${batch.analysisStartedAt}
          ${batch.endedAt ? Prisma.sql`AND "collectedAt" < ${batch.endedAt}` : Prisma.empty}
          ${
            lastPoint
              ? Prisma.sql`AND "collectedAt" >= ${lastPoint.sourceMetricCollectedAt}`
              : Prisma.empty
          }
      `,
    );
    let previousUplift = lastPoint?.cumulativeAvgViewsUplift ?? 0;
    let created = 0;
    for (const row of timestampRows.filter(
      (item): item is { collectedAt: Date } => Boolean(item.collectedAt),
    )) {
      const values = await this.currentTrackedPostValues(postIds, row.collectedAt);
      const views = values
        .map((value) => this.numberOrNull(value.viewsCount))
        .filter((value): value is number => value != null);
      const reactions = values
        .map((value) => this.numberOrNull(value.reactionsCount))
        .filter((value): value is number => value != null);
      if (!views.length) continue;
      const avgViews = this.average(views);
      const avgReactions = reactions.length ? this.average(reactions) : null;
      const cumulativeAvgViewsUplift =
        batch.baselineAvgViews == null
          ? null
          : Math.max(0, avgViews - batch.baselineAvgViews);
      const attributedAvgViewsUplift = this.attributeWindowViewsUplift({
        rawWindowViewsUplift: cumulativeAvgViewsUplift,
        releasedSubscribersCount: participatesInAttributionWindow
          ? batch.releasedSubscribersCount
          : 0,
        windowReleasedSubscribers,
      });
      const incrementalAvgViewsUplift =
        attributedAvgViewsUplift == null
          ? null
          : Math.max(0, attributedAvgViewsUplift - Number(previousUplift || 0));
      if (attributedAvgViewsUplift != null) previousUplift = attributedAvgViewsUplift;
      const estimatedActiveSubscribers =
        attributedAvgViewsUplift == null
          ? null
          : Math.min(
              batch.releasedSubscribersCount,
              Math.round(attributedAvgViewsUplift),
            );
      const activationRate =
        estimatedActiveSubscribers == null || batch.releasedSubscribersCount <= 0
          ? null
          : (estimatedActiveSubscribers / batch.releasedSubscribersCount) * 100;
      const quality =
        values.length < batch.trackedPostsCount
          ? AdCampaignAdmissionDataQuality.PARTIAL
          : batch.dataQuality;
      const reason =
        values.length < batch.trackedPostsCount
          ? [batch.dataQualityReason, 'tracked_posts_missing']
              .filter(Boolean)
              .join('; ')
          : batch.dataQualityReason;
      try {
        await this.prisma.adCampaignAdmissionViewSnapshot.upsert({
          where: {
            batchId_sourceMetricCollectedAt: {
              batchId: batch.id,
              sourceMetricCollectedAt: row.collectedAt,
            },
          },
          create: {
            batchId: batch.id,
            collectedAt: row.collectedAt,
            sourceMetricCollectedAt: row.collectedAt,
            avgViews,
            avgReactions,
            cumulativeAvgViewsUplift: attributedAvgViewsUplift,
            incrementalAvgViewsUplift,
            estimatedActiveSubscribers,
            activationRate,
            trackedPostsCount: values.length,
            channelSubscribersCount:
              batch.telegramChannel.currentSubscribersCount ?? null,
            joinedCount: batch.joinedAfter,
            requestedCount: batch.requestedAfter,
            dataQuality: quality,
            dataQualityReason: reason || null,
          },
          update: {
            collectedAt: row.collectedAt,
            avgViews,
            avgReactions,
            cumulativeAvgViewsUplift: attributedAvgViewsUplift,
            incrementalAvgViewsUplift,
            estimatedActiveSubscribers,
            activationRate,
            trackedPostsCount: values.length,
            channelSubscribersCount:
              batch.telegramChannel.currentSubscribersCount ?? null,
            joinedCount: batch.joinedAfter,
            requestedCount: batch.requestedAfter,
            dataQuality: quality,
            dataQualityReason: reason || null,
          },
        });
        created += 1;
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;
      }
    }
    return created;
  }

  private async currentTrackedPostValues(postIds: string[], collectedAt: Date) {
    return this.prisma.$queryRaw<
      Array<{
        telegramPostId: string;
        viewsCount: number | null;
        reactionsCount: number | null;
        collectedAt: Date;
      }>
    >(
      Prisma.sql`
        SELECT DISTINCT ON ("telegramPostId")
          "telegramPostId",
          "viewsCount",
          "reactionsCount",
          "collectedAt"
        FROM "TelegramPostMetricSnapshot"
        WHERE "telegramPostId" IN (${Prisma.join(postIds)})
          AND "collectedAt" <= ${collectedAt}
        ORDER BY "telegramPostId" ASC, "collectedAt" DESC
      `,
    );
  }

  private batchFingerprint(campaignId: string, event: AdmissionEvent) {
    const payload = JSON.stringify({
      campaignId,
      detectionMode: event.detectionMode,
      previousSnapshotAt: event.previousSnapshotAt?.toISOString() ?? null,
      currentSnapshotAt: event.currentSnapshotAt.toISOString(),
      sourceLinks: event.sourceLinks
        .map((link) => ({
          telegramInviteLinkId: link.telegramInviteLinkId,
          joinedDelta: link.joinedDelta,
          joinedBefore: link.joinedBefore,
          joinedAfter: link.joinedAfter,
          requestedBefore: link.requestedBefore,
          requestedAfter: link.requestedAfter,
        }))
        .sort((a, b) =>
          a.telegramInviteLinkId.localeCompare(b.telegramInviteLinkId),
        ),
    });
    return createHash('sha256').update(payload).digest('hex');
  }

  private combineDataQuality(
    a: AdCampaignAdmissionDataQuality,
    b: AdCampaignAdmissionDataQuality,
  ) {
    const order = [
      AdCampaignAdmissionDataQuality.GOOD,
      AdCampaignAdmissionDataQuality.PARTIAL,
      AdCampaignAdmissionDataQuality.SUSPICIOUS,
      AdCampaignAdmissionDataQuality.INSUFFICIENT,
    ];
    return order[Math.max(order.indexOf(a), order.indexOf(b))];
  }

  private average(values: number[]) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private attributeWindowViewsUplift(params: {
    rawWindowViewsUplift: number | null;
    releasedSubscribersCount: number;
    windowReleasedSubscribers: number;
  }) {
    if (params.rawWindowViewsUplift == null) return null;
    if (params.rawWindowViewsUplift <= 0) return 0;
    if (params.releasedSubscribersCount <= 0) return 0;
    if (params.windowReleasedSubscribers <= 0) {
      return params.rawWindowViewsUplift;
    }
    return (
      params.rawWindowViewsUplift *
      (params.releasedSubscribersCount / params.windowReleasedSubscribers)
    );
  }

  private numberOrNull(value: unknown) {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private isUniqueViolation(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  logFailure(error: unknown) {
    this.logger.error(
      error instanceof Error ? error.message : 'Admission analytics failed',
      error instanceof Error ? error.stack : undefined,
    );
  }
}
