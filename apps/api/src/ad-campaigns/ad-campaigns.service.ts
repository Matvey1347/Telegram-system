import { Currency } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateAdCampaignDto, GenerateInviteLinkDto, UpdateAdCampaignDto } from './dto';
import { TelegramApiError, TelegramBotApiClient } from '../telegram/shared/telegram-bot-api.client';

@Injectable()
export class AdCampaignsService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private telegramApi: TelegramBotApiClient,
  ) {}

  private metrics(priceInPrimaryCurrency: number, joinedCount = 0, sourcePostViews?: number | null) {
    const cpa = joinedCount > 0 ? priceInPrimaryCurrency / joinedCount : null;
    const cpm = sourcePostViews && sourcePostViews > 0 ? (priceInPrimaryCurrency / sourcePostViews) * 1000 : null;
    return { cpa, cpm };
  }

  async findAll(userId: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    return this.prisma.adCampaign.findMany({ where: { workspaceId }, include: { telegramChannel: true, advertisingSource: true, promo: true, account: true }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const row = await this.prisma.adCampaign.findFirst({ where: { id, workspaceId } });
    if (!row) throw new NotFoundException('Campaign not found');
    return row;
  }

  async create(userId: string, dto: CreateAdCampaignDto) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    let currency: Currency = workspace.primaryCurrency;
    if (dto.accountId) {
      const account = await this.prisma.account.findFirst({ where: { id: dto.accountId, workspaceId } });
      if (!account) throw new NotFoundException('Account not found');
      currency = account.currency;
    }
    const priceInPrimaryCurrency = dto.price * dto.exchangeRateToPrimary;
    const metrics = this.metrics(priceInPrimaryCurrency, dto.joinedCount ?? 0, dto.sourcePostViews);

    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.adCampaign.create({
        data: {
          ...dto,
          workspaceId,
          currency,
          startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
          endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
          priceInPrimaryCurrency,
          cpa: metrics.cpa,
          cpm: metrics.cpm,
          netGrowthCount: (dto.joinedCount ?? 0) - (dto.leftCount ?? 0),
        },
      });
      if (dto.accountId) {
        await tx.transaction.create({
          data: {
            workspaceId,
            accountId: dto.accountId,
            adCampaignId: campaign.id,
            type: 'expense',
            category: 'advertising',
            amount: dto.price,
            currency,
            exchangeRateToPrimary: dto.exchangeRateToPrimary,
            amountInPrimaryCurrency: priceInPrimaryCurrency,
            date: dto.startedAt ? new Date(dto.startedAt) : new Date(),
          },
        });
      }
      return campaign;
    });
  }

  async update(userId: string, id: string, dto: UpdateAdCampaignDto) {
    const existing = await this.findOne(userId, id);
    const price = dto.price ?? Number(existing.price);
    const rate = dto.exchangeRateToPrimary ?? Number(existing.exchangeRateToPrimary);
    const priceInPrimaryCurrency = price * rate;
    const joined = dto.joinedCount ?? existing.joinedCount;
    const views = dto.sourcePostViews ?? existing.sourcePostViews;
    const metrics = this.metrics(priceInPrimaryCurrency, joined, views);
    return this.prisma.adCampaign.update({ where: { id }, data: { ...dto, startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined, endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined, priceInPrimaryCurrency, cpa: metrics.cpa, cpm: metrics.cpm, netGrowthCount: joined - (dto.leftCount ?? existing.leftCount ?? 0) } });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    const linked = await this.prisma.transaction.findFirst({ where: { adCampaignId: id } });
    if (linked) return this.prisma.adCampaign.update({ where: { id }, data: { status: 'archived' } });
    return this.prisma.adCampaign.delete({ where: { id } });
  }

  async generateInviteLink(userId: string, campaignId: string, dto: GenerateInviteLinkDto) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const campaign = await this.prisma.adCampaign.findFirst({
      where: { id: campaignId, workspaceId },
      include: { telegramChannel: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const botIntegrationId = dto.telegramBotIntegrationId || campaign.telegramChannel.telegramBotIntegrationId;
    if (!botIntegrationId) throw new BadRequestException('No bot selected. Assign a bot to channel or pass telegramBotIntegrationId.');

    const bot = await this.prisma.telegramBotIntegration.findFirst({ where: { id: botIntegrationId, workspaceId, isActive: true } });
    if (!bot) throw new NotFoundException('Telegram bot not found');

    const target = campaign.telegramChannel.telegramChatId || campaign.telegramChannel.username;
    if (!target) throw new BadRequestException('Channel has no username or chatId.');
    const chatId = target.startsWith('@') || target.startsWith('-') ? target : `@${target}`;

    const linkName = `Campaign: ${campaign.title}`.slice(0, 32);

    try {
      const link = await this.telegramApi.createChatInviteLink(bot.botToken, chatId, { name: linkName });

      const updated = await this.prisma.$transaction(async (tx) => {
        const invite = await tx.telegramInviteLink.create({
          data: {
            workspaceId,
            telegramChannelId: campaign.telegramChannelId,
            telegramBotIntegrationId: bot.id,
            adCampaignId: campaign.id,
            url: link.invite_link,
            name: link.name || linkName,
            joinedCount: 0,
            createsJoinRequest: link.creates_join_request || false,
            expireDate: link.expire_date ? new Date(link.expire_date * 1000) : undefined,
            memberLimit: link.member_limit,
          },
        });
        const updatedCampaign = await tx.adCampaign.update({
          where: { id: campaign.id },
          data: { inviteLink: link.invite_link, telegramInviteLinkId: invite.id },
        });
        return { invite, campaign: updatedCampaign };
      });

      return updated;
    } catch (error) {
      const message = error instanceof TelegramApiError ? error.message : 'Failed to generate invite link';
      if (message.toLowerCase().includes('not enough rights') || message.toLowerCase().includes('administrator')) {
        throw new BadRequestException('Bot must be admin and have Add Subscribers / invite users permission.');
      }
      throw new BadRequestException(message);
    }
  }
}
