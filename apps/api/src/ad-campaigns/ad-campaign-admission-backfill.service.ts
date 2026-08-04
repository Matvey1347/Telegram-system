import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdmissionAnalyticsStageResult,
  AdCampaignAdmissionAnalyticsService,
} from './ad-campaign-admission-analytics.service';

@Injectable()
export class AdCampaignAdmissionBackfillService {
  constructor(
    private prisma: PrismaService,
    private admissionAnalytics: AdCampaignAdmissionAnalyticsService,
  ) {}

  async backfillChannelCampaigns(params: {
    workspaceId: string;
    telegramChannelId: string;
    cutoffAt: Date;
  }): Promise<AdmissionAnalyticsStageResult> {
    const existing = await this.prisma.adCampaignAdmissionBackfillState.findUnique({
      where: {
        workspaceId_telegramChannelId_version: {
          workspaceId: params.workspaceId,
          telegramChannelId: params.telegramChannelId,
          version: 1,
        },
      },
    });
    if (existing) {
      return {
        status: 'processed',
        backfilledCampaigns: 0,
        createdBatches: 0,
        createdPoints: 0,
        reason: 'already backfilled',
      };
    }

    const result = await this.admissionAnalytics.processHistoricalEvents({
      workspaceId: params.workspaceId,
      telegramChannelId: params.telegramChannelId,
      cutoffAt: params.cutoffAt,
    });
    const lastSnapshot = await this.prisma.telegramInviteLinkSnapshot.findFirst({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.telegramChannelId,
        syncedAt: { lte: params.cutoffAt },
      },
      orderBy: { syncedAt: 'desc' },
      select: { syncedAt: true },
    });

    await this.prisma.adCampaignAdmissionBackfillState.upsert({
      where: {
        workspaceId_telegramChannelId_version: {
          workspaceId: params.workspaceId,
          telegramChannelId: params.telegramChannelId,
          version: 1,
        },
      },
      create: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.telegramChannelId,
        completedAt: new Date(),
        lastProcessedInviteSnapshotAt: lastSnapshot?.syncedAt ?? params.cutoffAt,
        version: 1,
      },
      update: {
        completedAt: new Date(),
        lastProcessedInviteSnapshotAt: lastSnapshot?.syncedAt ?? params.cutoffAt,
      },
    });

    return {
      status: 'processed',
      backfilledCampaigns: result.processedCampaigns,
      createdBatches: result.createdBatches,
      createdPoints: result.createdPoints,
    };
  }
}
