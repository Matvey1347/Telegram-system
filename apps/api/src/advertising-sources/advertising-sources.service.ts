import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateAdvertisingSourceDto, UpdateAdvertisingSourceDto } from './dto';

@Injectable()
export class AdvertisingSourcesService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
  ) {}

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private toView(row: any) {
    return {
      id: row.id,
      title: row.name,
      telegramUrl: row.url,
      username: row.telegramUsername,
      notes: row.notes,
      imageUrl: row.imageUrl,
      subscribersCount: row.subscribersCount ?? 0,
      channelTags: Array.isArray(row.channelTags) ? row.channelTags : [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findAll(userId: string) {
    const workspaceId = await this.workspace(userId);
    const rows = await this.prisma.advertisingSource.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toView(row));
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const row = await this.prisma.advertisingSource.findFirst({
      where: { id, workspaceId },
    });
    if (!row) throw new NotFoundException('Advertising channel not found');
    return this.toView(row);
  }

  async create(userId: string, dto: CreateAdvertisingSourceDto) {
    const workspaceId = await this.workspace(userId);
    const row = await (this.prisma as any).advertisingSource.create({
      data: {
        workspaceId,
        name: dto.title,
        type: 'telegram_channel',
        url: dto.telegramUrl,
        telegramUsername: dto.username,
        notes: dto.notes,
        imageUrl: dto.imageUrl,
        subscribersCount: dto.subscribersCount ?? 0,
        channelTags: dto.channelTags ?? [],
      },
    });
    return this.toView(row);
  }

  async update(userId: string, id: string, dto: UpdateAdvertisingSourceDto) {
    await this.findOne(userId, id);
    const row = await (this.prisma as any).advertisingSource.update({
      where: { id },
      data: {
        name: dto.title,
        url: dto.telegramUrl,
        telegramUsername: dto.username,
        notes: dto.notes,
        imageUrl: dto.imageUrl,
        subscribersCount: dto.subscribersCount,
        channelTags: dto.channelTags,
      },
    });
    return this.toView(row);
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.advertisingSource.delete({ where: { id } });
  }

  async analytics(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.prisma.advertisingSource.findFirst({ where: { id, workspaceId } });
    if (!channel) throw new NotFoundException('Advertising channel not found');

    const placements = await (this.prisma as any).adCampaignAdvertisingChannel.findMany({
      where: { advertisingSourceId: id },
      include: { adCampaign: { include: { advertisingChannels: true, inviteLinks: true } } },
    });

    const clean = placements.filter((p) => p.adCampaign.advertisingChannels.length === 1);
    const mixed = placements.filter((p) => p.adCampaign.advertisingChannels.length > 1);

    const totalCost = clean.reduce((s, p) => s + Number(p.adCampaign.price || 0), 0);
    const totalJoined = clean.reduce(
      (sum, placement) =>
        sum +
        placement.adCampaign.inviteLinks.reduce(
          (linkSum: number, link: { joinedCount: number }) =>
            linkSum + link.joinedCount,
          0,
        ),
      0,
    );

    return {
      id: channel.id,
      title: channel.name,
      campaignsCount: clean.length,
      mixedCampaignsCount: mixed.length,
      totalCost,
      totalJoined,
      totalLeft: null,
      totalNetGrowth: null,
      averageCostPerJoinedSubscriber: totalJoined > 0 ? totalCost / totalJoined : null,
      averageCostPerNetSubscriber: null,
      attributionSource: 'mtproto_invite_link_usage',
      mixedCampaignsTotalCost: mixed.reduce((s, p) => s + Number(p.adCampaign.price || 0), 0),
    };
  }

  async analyticsSummary(userId: string) {
    const workspaceId = await this.workspace(userId);
    const channels = await this.prisma.advertisingSource.findMany({ where: { workspaceId } });
    return Promise.all(channels.map((c) => this.analytics(userId, c.id)));
  }
}
