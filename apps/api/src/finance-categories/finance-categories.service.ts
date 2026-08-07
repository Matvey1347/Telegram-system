import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { iconToResolvedEmoji } from '../common/icons/resolved-emoji';
import { CreateFinanceCategoryDto, UpdateFinanceCategoryDto } from './dto';

@Injectable()
export class FinanceCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private async ensureEmojiIcon(
    workspaceId: string,
    name: string,
    emoji: string,
    tx?: PrismaClient,
  ) {
    const client = tx ?? this.prisma;
    const icon = await (client as any).icon.upsert({
      where: {
        workspaceId_type_name: {
          workspaceId,
          type: 'emoji',
          name,
        },
      },
      update: { emoji },
      create: {
        workspaceId,
        type: 'emoji',
        name,
        emoji,
      },
      select: { id: true },
    });
    return icon.id as string;
  }

  async ensureSystemCategories(workspaceId: string, tx?: PrismaClient) {
    const client = tx ?? this.prisma;
    const channelAdvertisingRevenueIconId = await this.ensureEmojiIcon(
      workspaceId,
      'channel-advertising-revenue',
      '👛',
      client,
    );
    const telegramAdSalesReversalIconId = await this.ensureEmojiIcon(
      workspaceId,
      'telegram-ad-sales-reversal',
      '↩️',
      client,
    );
    const buyChannelsCandidates = await (client as any).transactionCategory.findMany({
      where: {
        workspaceId,
        type: 'expense',
        OR: [
          { key: 'buy_channels' },
          { name: { equals: 'Buy Channels', mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    const existingBuyChannels =
      buyChannelsCandidates.find(
        (category: { key?: string | null }) => category.key === 'buy_channels',
      ) ?? buyChannelsCandidates[0];

    await (client as any).transactionCategory.upsert({
      where: {
        workspaceId_type_key: {
          workspaceId,
          type: 'income',
          key: 'investment',
        },
      },
      update: { isSystem: true, name: 'Investment' },
      create: {
        workspaceId,
        type: 'income',
        key: 'investment',
        isSystem: true,
        name: 'Investment',
        iconId: undefined,
      },
    });

    const channelAdvertisingRevenueCategory = await (client as any).transactionCategory.upsert({
      where: {
        workspaceId_type_key: {
          workspaceId,
          type: 'income',
          key: 'channel_advertising_revenue',
        },
      },
      update: {
        isSystem: true,
        name: 'Channel Advertising Revenue',
        iconId: channelAdvertisingRevenueIconId,
      },
      create: {
        workspaceId,
        type: 'income',
        key: 'channel_advertising_revenue',
        isSystem: true,
        name: 'Channel Advertising Revenue',
        iconId: channelAdvertisingRevenueIconId,
      },
    });
    const telegramAdSalesCandidates = await (client as any).transactionCategory.findMany({
      where: {
        workspaceId,
        type: 'income',
        OR: [
          { key: 'telegram_ad_sales' },
          { name: { equals: 'Telegram Ad Sales', mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    const duplicateTelegramAdSalesIds = telegramAdSalesCandidates
      .map((category: { id: string }) => category.id)
      .filter((id: string) => id !== channelAdvertisingRevenueCategory.id);
    if (duplicateTelegramAdSalesIds.length) {
      await (client as any).transaction.updateMany({
        where: {
          workspaceId,
          OR: [
            { categoryId: { in: duplicateTelegramAdSalesIds } },
            { category: 'Telegram Ad Sales' },
          ],
        },
        data: {
          categoryId: channelAdvertisingRevenueCategory.id,
          category: channelAdvertisingRevenueCategory.name,
        },
      });
      await (client as any).transactionCategory.deleteMany({
        where: { id: { in: duplicateTelegramAdSalesIds } },
      });
    }

    await (client as any).transactionCategory.upsert({
      where: {
        workspaceId_type_key: {
          workspaceId,
          type: 'expense',
          key: 'telegram_ad_sales_reversal',
        },
      },
      update: {
        isSystem: true,
        name: 'Telegram Ad Sales Reversal',
        iconId: telegramAdSalesReversalIconId,
      },
      create: {
        workspaceId,
        type: 'expense',
        key: 'telegram_ad_sales_reversal',
        isSystem: true,
        name: 'Telegram Ad Sales Reversal',
        iconId: telegramAdSalesReversalIconId,
      },
    });

    await (client as any).transactionCategory.upsert({
      where: {
        workspaceId_type_key: {
          workspaceId,
          type: 'expense',
          key: 'advertising',
        },
      },
      update: { isSystem: true, name: 'Advertising' },
      create: {
        workspaceId,
        type: 'expense',
        key: 'advertising',
        isSystem: true,
        name: 'Advertising',
        iconId: undefined,
      },
    });

    if (existingBuyChannels) {
      await (client as any).transactionCategory.update({
        where: { id: existingBuyChannels.id },
        data: {
          key: 'buy_channels',
          isSystem: true,
          name: 'Buy Channels',
        },
      });
    } else {
      await (client as any).transactionCategory.upsert({
        where: {
          workspaceId_type_key: {
            workspaceId,
            type: 'expense',
            key: 'buy_channels',
          },
        },
        update: { isSystem: true, name: 'Buy Channels' },
        create: {
          workspaceId,
          type: 'expense',
          key: 'buy_channels',
          isSystem: true,
          name: 'Buy Channels',
          iconId: undefined,
        },
      });
    }

    const duplicateBuyChannels = buyChannelsCandidates.filter(
      (category: { id: string }) => category.id !== existingBuyChannels?.id,
    );
    for (const duplicate of duplicateBuyChannels) {
      await (client as any).transactionCategory.update({
        where: { id: duplicate.id },
        data: {
          key: null,
          name: 'Buy Channels (legacy)',
          isSystem: false,
        },
      });
    }
  }

  async list(userId: string, type?: 'income' | 'expense') {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.ensureSystemCategories(workspaceId);

    const categories = await (this.prisma as any).transactionCategory.findMany({
      where: { workspaceId, type },
      include: {
        icon: {
          select: {
            id: true,
            type: true,
            name: true,
            emoji: true,
            imageUrl: true,
          },
        },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return categories.map((category: { icon?: Parameters<typeof iconToResolvedEmoji>[0] }) => ({
      ...category,
      iconPresentation: iconToResolvedEmoji(category.icon),
    }));
  }

  async create(userId: string, dto: CreateFinanceCategoryDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.ensureSystemCategories(workspaceId);
    const category = await (this.prisma as any).transactionCategory.create({
      data: {
        workspaceId,
        type: dto.type,
        name: dto.name.trim(),
        iconId: dto.iconId ?? undefined,
      },
      include: {
        icon: {
          select: {
            id: true,
            type: true,
            name: true,
            emoji: true,
            imageUrl: true,
          },
        },
      },
    });
    return {
      ...category,
      iconPresentation: iconToResolvedEmoji(category.icon),
    };
  }

  async update(userId: string, id: string, dto: UpdateFinanceCategoryDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const category = await (this.prisma as any).transactionCategory.findFirst({
      where: { id, workspaceId },
    });
    if (!category) throw new NotFoundException('Category not found');

    if (
      category.isSystem &&
      dto.name === undefined &&
      dto.iconId === undefined
    ) {
      throw new BadRequestException('System category fields are protected');
    }

    if (dto.iconId !== undefined && dto.iconId !== null) {
      const icon = await this.prisma.icon.findFirst({
        where: { id: dto.iconId, workspaceId },
      });
      if (!icon) throw new NotFoundException('Icon not found');
    }

    const updated = await (this.prisma as any).transactionCategory.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        iconId: dto.iconId === undefined ? undefined : dto.iconId,
      },
      include: {
        icon: {
          select: {
            id: true,
            type: true,
            name: true,
            emoji: true,
            imageUrl: true,
          },
        },
      },
    });
    return {
      ...updated,
      iconPresentation: iconToResolvedEmoji(updated.icon),
    };
  }

  async remove(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const category = await (this.prisma as any).transactionCategory.findFirst({
      where: { id, workspaceId },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category.isSystem) {
      throw new BadRequestException('System categories cannot be deleted');
    }

    const count = await (this.prisma as any).transaction.count({
      where: { workspaceId, categoryId: id },
    });
    if (count > 0) {
      throw new BadRequestException(
        'Category is used by existing transactions and cannot be deleted',
      );
    }

    return (this.prisma as any).transactionCategory.delete({ where: { id } });
  }
}
