import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceService } from '../common/workspace.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelAnalyticsService } from '../telegram-channels/telegram-channel-analytics.service';
import { CreateTelegramChannelNetworkDto } from './dto/create-telegram-channel-network.dto';
import { UpdateTelegramChannelNetworkDto } from './dto/update-telegram-channel-network.dto';

type KpiStatus = 'good' | 'acceptable' | 'bad' | 'unknown';

@Injectable()
export class TelegramChannelNetworksService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private analyticsService: TelegramChannelAnalyticsService,
  ) {}

  private workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private dedupeChannelIds(channelIds: string[]) {
    const cleanIds = channelIds.map((id) => String(id || '').trim()).filter(Boolean);
    const uniqueIds = [...new Set(cleanIds)];
    if (uniqueIds.length !== cleanIds.length) {
      throw new BadRequestException('Telegram channel ids must be unique');
    }
    if (uniqueIds.length < 2) {
      throw new BadRequestException('Network must contain at least 2 channels');
    }
    return uniqueIds;
  }

  private async validateChannels(workspaceId: string, channelIds: string[]) {
    const uniqueIds = this.dedupeChannelIds(channelIds);
    const channels = await this.prisma.telegramChannel.findMany({
      where: {
        workspaceId,
        id: { in: uniqueIds },
        isActive: true,
        adminLinks: { some: {} },
      },
      orderBy: { title: 'asc' },
    });
    if (channels.length !== uniqueIds.length) {
      throw new BadRequestException(
        'All channels must be own active channels in selected workspace',
      );
    }
    return { uniqueIds, channels };
  }

  private kpiLabel(status: KpiStatus) {
    if (status === 'good') return 'Good';
    if (status === 'acceptable') return 'Acceptable';
    if (status === 'bad') return 'Stop';
    return '-';
  }

  private aggregateKpiStatus(statuses: KpiStatus[]): KpiStatus {
    if (statuses.includes('bad')) return 'bad';
    if (statuses.includes('acceptable')) return 'acceptable';
    if (statuses.includes('good')) return 'good';
    return 'unknown';
  }

  private async channelSummary(channel: {
    id: string;
    title: string;
    username: string | null;
    photoUrl: string | null;
    currentSubscribersCount: number | null;
  }) {
    const [audience, finance] = await Promise.all([
      this.analyticsService.getActiveAudienceEstimate(channel.id),
      this.analyticsService.getChannelFinancialSummary(channel.id),
    ]);
    return {
      channelId: channel.id,
      id: channel.id,
      title: channel.title,
      name: channel.title,
      username: channel.username,
      photoUrl: channel.photoUrl,
      subscribersCount: audience.subscribersCount,
      currentSubscribersCount: channel.currentSubscribersCount,
      activeSubscribersEstimate: audience.activeSubscribersEstimate,
      paidActiveSubscribersEstimate: audience.paidActiveSubscribersEstimate,
      viewRate: audience.viewRate,
      totalAdSpend: finance.totalAdSpend,
      campaignsCount: finance.campaignsCount,
      totalJoinedSubscribers: finance.totalJoinedSubscribers,
      avgCpa: finance.avgCpa,
      activeCpa: finance.activeCpa,
      kpiStatus: finance.kpiStatus,
      kpiLabel: finance.kpiLabel,
    };
  }

  private aggregateSummary(channelSummaries: Awaited<ReturnType<typeof this.channelSummary>>[]) {
    const totalSubscribers = channelSummaries.reduce(
      (sum, channel) => sum + Number(channel.subscribersCount || 0),
      0,
    );
    const activeSubscribersEstimate = channelSummaries.reduce(
      (sum, channel) => sum + Number(channel.activeSubscribersEstimate || 0),
      0,
    );
    const paidActiveSubscribersEstimate = channelSummaries.reduce(
      (sum, channel) => sum + Number(channel.paidActiveSubscribersEstimate || 0),
      0,
    );
    const totalAdSpend = channelSummaries.reduce(
      (sum, channel) => sum + Number(channel.totalAdSpend || 0),
      0,
    );
    const campaignsCount = channelSummaries.reduce(
      (sum, channel) => sum + Number(channel.campaignsCount || 0),
      0,
    );
    const totalJoinedSubscribers = channelSummaries.reduce(
      (sum, channel) => sum + Number(channel.totalJoinedSubscribers || 0),
      0,
    );
    const kpiStatus = this.aggregateKpiStatus(
      channelSummaries.map((channel) => channel.kpiStatus as KpiStatus),
    );
    return {
      channelsCount: channelSummaries.length,
      totalSubscribers,
      activeSubscribersEstimate,
      paidActiveSubscribersEstimate,
      viewRate:
        totalSubscribers > 0
          ? (activeSubscribersEstimate / totalSubscribers) * 100
          : null,
      totalAdSpend,
      campaignsCount,
      totalJoinedSubscribers,
      avgCpa:
        totalJoinedSubscribers > 0 ? totalAdSpend / totalJoinedSubscribers : null,
      activeCpa:
        paidActiveSubscribersEstimate > 0
          ? totalAdSpend / paidActiveSubscribersEstimate
          : null,
      kpiStatus,
      kpiLabel: this.kpiLabel(kpiStatus),
    };
  }

  private async enrichNetwork(network: any) {
    const channels = network.channels.map((member: any) => member.telegramChannel);
    const channelSummaries = await Promise.all(
      channels.map((channel: any) => this.channelSummary(channel)),
    );
    const summary = this.aggregateSummary(channelSummaries);
    return {
      id: network.id,
      name: network.name,
      description: network.description,
      createdAt: network.createdAt,
      updatedAt: network.updatedAt,
      channels: channelSummaries.map((channel) => ({
        id: channel.id,
        title: channel.title,
        name: channel.name,
        username: channel.username,
        photoUrl: channel.photoUrl,
        subscribersCount: channel.subscribersCount,
        currentSubscribersCount: channel.currentSubscribersCount,
        activeSubscribersEstimate: channel.activeSubscribersEstimate,
      })),
      summary,
      channelSummaries,
    };
  }

  async list(userId: string) {
    const workspaceId = await this.workspace(userId);
    const networks = await this.prisma.telegramChannelNetwork.findMany({
      where: { workspaceId },
      include: {
        channels: {
          include: { telegramChannel: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(networks.map((network) => this.enrichNetwork(network)));
  }

  async getById(userId: string, networkId: string) {
    const workspaceId = await this.workspace(userId);
    const network = await this.prisma.telegramChannelNetwork.findFirst({
      where: { id: networkId, workspaceId },
      include: {
        channels: {
          include: { telegramChannel: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!network) throw new NotFoundException('Telegram channel network not found');
    return this.enrichNetwork(network);
  }

  async create(userId: string, dto: CreateTelegramChannelNetworkDto) {
    const workspaceId = await this.workspace(userId);
    const { uniqueIds } = await this.validateChannels(
      workspaceId,
      dto.telegramChannelIds,
    );
    const network = await this.prisma.telegramChannelNetwork.create({
      data: {
        workspaceId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        channels: {
          create: uniqueIds.map((telegramChannelId) => ({
            workspaceId,
            telegramChannelId,
          })),
        },
      },
    });
    return this.getById(userId, network.id);
  }

  async update(
    userId: string,
    networkId: string,
    dto: UpdateTelegramChannelNetworkDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramChannelNetwork.findFirst({
      where: { id: networkId, workspaceId },
      select: { id: true },
    });
    if (!existing)
      throw new NotFoundException('Telegram channel network not found');

    const uniqueIds = dto.telegramChannelIds
      ? (await this.validateChannels(workspaceId, dto.telegramChannelIds)).uniqueIds
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.telegramChannelNetwork.update({
        where: { id: networkId },
        data: {
          name: dto.name === undefined ? undefined : dto.name.trim(),
          description:
            dto.description === undefined
              ? undefined
              : dto.description?.trim() || null,
        },
      });
      if (uniqueIds) {
        await tx.telegramChannelNetworkMember.deleteMany({
          where: { networkId, workspaceId },
        });
        await tx.telegramChannelNetworkMember.createMany({
          data: uniqueIds.map((telegramChannelId) => ({
            workspaceId,
            networkId,
            telegramChannelId,
          })),
        });
      }
    });

    return this.getById(userId, networkId);
  }

  async remove(userId: string, networkId: string) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramChannelNetwork.findFirst({
      where: { id: networkId, workspaceId },
      select: { id: true },
    });
    if (!existing)
      throw new NotFoundException('Telegram channel network not found');
    await this.prisma.telegramChannelNetwork.delete({ where: { id: networkId } });
    return { success: true };
  }

  async getNetworkSummary(userId: string, networkId: string) {
    const network = await this.getById(userId, networkId);
    return network.summary;
  }
}
