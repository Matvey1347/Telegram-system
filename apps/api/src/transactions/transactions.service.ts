import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createPaginatedResponse, normalizePagination } from '../common/pagination/pagination.utils';
import { WorkspaceService } from '../common/workspace.service';
import { CurrencyConversionService } from '../common/currency-conversion.service';
import {
  CreateTransactionDto,
  TransactionQueryDto,
  UpdateTransactionDto,
} from './dto';
import { FinanceCategoriesService } from '../finance-categories/finance-categories.service';

@Injectable()
export class TransactionsService {
  private telegramChannelPurchaseColumnsAvailable: boolean | null = null;
  private ensureTelegramChannelPurchaseColumnsPromise: Promise<boolean> | null =
    null;

  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private currencyConversionService: CurrencyConversionService,
    private financeCategoriesService: FinanceCategoriesService,
  ) {}

  private async resolveRateToPrimary(
    workspaceId: string,
    fromCurrency: string,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { primaryCurrency: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const rate = await this.currencyConversionService.getRate(
      fromCurrency,
      workspace.primaryCurrency,
      workspaceId,
    );
    if (rate) return rate;

    throw new BadRequestException(
      `No exchange rate from ${fromCurrency} to ${workspace.primaryCurrency}`,
    );
  }

  private isBuyChannelsCategory(category: {
    key?: string | null;
    name?: string | null;
    type: 'income' | 'expense';
  }) {
    const normalizedCategoryName = String(category.name ?? '')
      .trim()
      .toLowerCase();
    return (
      category.type === 'expense' &&
      (category.key === 'buy_channels' ||
        normalizedCategoryName === 'buy channels' ||
        normalizedCategoryName === 'buy channels (legacy)')
    );
  }

  private isChannelAdvertisingRevenueCategory(category: {
    key?: string | null;
    name?: string | null;
    type: 'income' | 'expense';
  }) {
    const normalizedCategoryName = String(category.name ?? '')
      .trim()
      .toLowerCase();
    return (
      category.type === 'income' &&
      (category.key === 'channel_advertising_revenue' ||
        normalizedCategoryName === 'channel advertising revenue')
    );
  }

  private async validateCategoryAndMember(
    workspaceId: string,
    type: 'income' | 'expense',
    categoryId: string,
    memberId?: string,
  ) {
    const category = await this.prisma.transactionCategory.findFirst({
      where: { id: categoryId, workspaceId },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category.type !== type) {
      throw new BadRequestException(
        `Category type mismatch. Expected ${type} category.`,
      );
    }

    if (type === 'income' && category.key === 'investment' && !memberId) {
      throw new BadRequestException(
        'memberId is required for Investment income category',
      );
    }

    if (memberId) {
      const member = await this.prisma.workspaceMember.findFirst({
        where: { id: memberId, workspaceId },
      });
      if (!member) throw new NotFoundException('Member not found');
    }

    return category;
  }

  private async ensureTelegramChannelPurchaseColumnsAvailable() {
    if (this.telegramChannelPurchaseColumnsAvailable === true) {
      return true;
    }
    if (this.ensureTelegramChannelPurchaseColumnsPromise) {
      return this.ensureTelegramChannelPurchaseColumnsPromise;
    }
    if (typeof this.prisma.$executeRawUnsafe !== 'function') {
      return false;
    }
    this.ensureTelegramChannelPurchaseColumnsPromise = (async () => {
      await this.prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_type
            WHERE typname = 'TelegramChannelAcquisitionType'
          ) THEN
            CREATE TYPE "TelegramChannelAcquisitionType" AS ENUM ('CREATED', 'PURCHASED');
          END IF;
        END
        $$;
      `);
      await this.prisma.$executeRawUnsafe(`
        ALTER TABLE "TelegramChannel"
        ADD COLUMN IF NOT EXISTS "purchaseTransactionId" TEXT
      `);
      await this.prisma.$executeRawUnsafe(`
        ALTER TABLE "TelegramChannel"
        ADD COLUMN IF NOT EXISTS "acquisitionType" "TelegramChannelAcquisitionType" NOT NULL DEFAULT 'CREATED'
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "TelegramChannel_purchaseTransactionId_key"
        ON "TelegramChannel"("purchaseTransactionId")
      `);
      this.telegramChannelPurchaseColumnsAvailable = true;
      return true;
    })();
    try {
      return await this.ensureTelegramChannelPurchaseColumnsPromise;
    } finally {
      this.ensureTelegramChannelPurchaseColumnsPromise = null;
    }
  }

  private async findLinkedPurchaseChannelByTransaction(
    workspaceId: string,
    transactionId: string,
  ) {
    await this.ensureTelegramChannelPurchaseColumnsAvailable();
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        username: string | null;
        photoUrl: string | null;
      }>
    >(Prisma.sql`
      SELECT "id", "title", "username", "photoUrl"
      FROM "TelegramChannel"
      WHERE "workspaceId" = ${workspaceId}
        AND "purchaseTransactionId" = ${transactionId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async findPurchaseChannelById(workspaceId: string, channelId: string) {
    await this.ensureTelegramChannelPurchaseColumnsAvailable();
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        username: string | null;
        photoUrl: string | null;
        purchaseTransactionId: string | null;
      }>
    >(Prisma.sql`
      SELECT "id", "title", "username", "photoUrl", "purchaseTransactionId"
      FROM "TelegramChannel"
      WHERE "workspaceId" = ${workspaceId}
        AND "id" = ${channelId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async findWorkspaceTelegramChannelById(
    workspaceId: string,
    channelId: string,
  ) {
    return this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: {
        id: true,
        title: true,
        username: true,
        photoUrl: true,
      },
    });
  }

  private async resolvePurchaseChannelLink(params: {
    workspaceId: string;
    category: { key?: string | null; name?: string | null; type: 'income' | 'expense' };
    telegramChannelId?: string | null;
    transactionId?: string;
  }) {
    const isBuyChannelsCategory = this.isBuyChannelsCategory(params.category);
    const requestedChannelId = params.telegramChannelId ?? null;

    if (!isBuyChannelsCategory) {
      if (requestedChannelId) {
        throw new BadRequestException(
          'telegramChannelId is only allowed for Buy Channels expenses',
        );
      }
      return null;
    }

    if (!requestedChannelId) {
      return null;
    }

    const channel = await this.findPurchaseChannelById(
      params.workspaceId,
      requestedChannelId,
    );
    if (!channel) throw new NotFoundException('Telegram channel not found');
    if (
      channel.purchaseTransactionId &&
      channel.purchaseTransactionId !== params.transactionId
    ) {
      throw new BadRequestException(
        'This Telegram channel is already linked to another purchase transaction.',
      );
    }
    return channel;
  }

  private async resolveRevenueChannelLink(params: {
    workspaceId: string;
    category: { key?: string | null; name?: string | null; type: 'income' | 'expense' };
    telegramChannelId?: string | null;
  }) {
    const isChannelAdvertisingRevenueCategory =
      this.isChannelAdvertisingRevenueCategory(params.category);
    const requestedChannelId = params.telegramChannelId ?? null;

    if (!isChannelAdvertisingRevenueCategory) {
      if (requestedChannelId) {
        throw new BadRequestException(
          'telegramChannelId is only allowed for Channel Advertising Revenue income',
        );
      }
      return null;
    }

    if (!requestedChannelId) {
      throw new BadRequestException(
        'telegramChannelId is required for Channel Advertising Revenue income',
      );
    }

    const channel = await this.findWorkspaceTelegramChannelById(
      params.workspaceId,
      requestedChannelId,
    );
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return channel;
  }

  private async syncPurchaseChannelLink(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    transactionId: string,
    nextChannelId?: string | null,
  ) {
    await this.ensureTelegramChannelPurchaseColumnsAvailable();
    if (nextChannelId) {
      await tx.$executeRaw(
        Prisma.sql`
          UPDATE "TelegramChannel"
          SET "purchaseTransactionId" = NULL
          WHERE "workspaceId" = ${workspaceId}
            AND "purchaseTransactionId" = ${transactionId}
            AND "id" <> ${nextChannelId}
        `,
      );
    } else {
      await tx.$executeRaw(
        Prisma.sql`
          UPDATE "TelegramChannel"
          SET "purchaseTransactionId" = NULL
          WHERE "workspaceId" = ${workspaceId}
            AND "purchaseTransactionId" = ${transactionId}
        `,
      );
    }

    if (!nextChannelId) return;

    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "TelegramChannel"
        SET
          "purchaseTransactionId" = ${transactionId},
          "acquisitionType" = 'PURCHASED'
        WHERE "workspaceId" = ${workspaceId}
          AND "id" = ${nextChannelId}
      `,
    );
  }

  private async attachPurchasedTelegramChannels<
    T extends { id: string },
  >(workspaceId: string, transactions: T[]) {
    if (!transactions.length) return transactions;
    const ids = transactions.map((transaction) => transaction.id);
    const rows = await this.prisma.$queryRaw<
      Array<{
        purchaseTransactionId: string;
        id: string;
        title: string;
        username: string | null;
        photoUrl: string | null;
      }>
    >(Prisma.sql`
      SELECT
        "purchaseTransactionId",
        "id",
        "title",
        "username",
        "photoUrl"
      FROM "TelegramChannel"
      WHERE "workspaceId" = ${workspaceId}
        AND "purchaseTransactionId" IN (${Prisma.join(ids)})
    `);
    const byTransactionId = new Map(
      rows.map((row) => [
        row.purchaseTransactionId,
        {
          id: row.id,
          title: row.title,
          username: row.username,
          photoUrl: row.photoUrl,
        },
      ]),
    );
    return transactions.map((transaction) => ({
      ...transaction,
      purchasedTelegramChannel: byTransactionId.get(transaction.id) ?? null,
    }));
  }

  async findAll(userId: string, query: TransactionQueryDto = {}) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.financeCategoriesService.ensureSystemCategories(workspaceId);
    const where: Prisma.TransactionWhereInput = { workspaceId };
    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const end = new Date(query.dateTo);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    }
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.type && query.type !== 'all') where.type = query.type;
    if (query.accountId) where.accountId = query.accountId;
    if (query.assignedMemberId)
      where.assignedMemberId = query.assignedMemberId;
    if (query.search?.trim()) {
      where.OR = [
        { description: { contains: query.search.trim(), mode: 'insensitive' } },
        { category: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    const pagination = normalizePagination(query);
    const orderDirection = query.sort === 'date_asc' ? 'asc' : 'desc';
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        orderBy: [{ date: orderDirection }, { id: orderDirection }],
        skip: pagination.skip,
        take: pagination.take,
        include: {
          account: {
            include: {
              assignedMember: WorkspaceService.assignedMemberInclude,
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
          },
          categoryRef: {
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
          },
          telegramChannel: {
            select: {
              id: true,
              title: true,
              username: true,
              photoUrl: true,
            },
          },
          member: { include: { user: true } },
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
          adCampaign: true,
          investment: true,
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
      }),
      this.prisma.transaction.count({ where }),
    ]);
    const enrichedItems = await this.attachPurchasedTelegramChannels(
      workspaceId,
      items,
    );
    return createPaginatedResponse(enrichedItems, totalItems, pagination);
  }

  async findOne(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const row = await this.prisma.transaction.findFirst({
      where: { id, workspaceId },
      include: {
        account: {
          include: {
            assignedMember: WorkspaceService.assignedMemberInclude,
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
        },
        categoryRef: {
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
        },
        telegramChannel: {
          select: {
            id: true,
            title: true,
            username: true,
            photoUrl: true,
          },
        },
        member: { include: { user: true } },
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
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
    if (!row) throw new NotFoundException('Transaction not found');
    const [enriched] = await this.attachPurchasedTelegramChannels(workspaceId, [
      row,
    ]);
    return enriched;
  }

  async create(userId: string, dto: CreateTransactionDto) {
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(userId, dto.assignedMemberId);
    await this.financeCategoriesService.ensureSystemCategories(workspaceId);

    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, workspaceId },
    });
    if (!account) throw new NotFoundException('Account not found');

    const category = await this.validateCategoryAndMember(
      workspaceId,
      dto.type,
      dto.categoryId,
      dto.memberId,
    );
    if (dto.iconId !== undefined && dto.iconId !== null) {
      const icon = await this.prisma.icon.findFirst({
        where: { id: dto.iconId, workspaceId },
      });
      if (!icon) throw new NotFoundException('Icon not found');
    }
    const purchaseChannel = await this.resolvePurchaseChannelLink({
      workspaceId,
      category,
      telegramChannelId: this.isBuyChannelsCategory(category)
        ? dto.telegramChannelId
        : undefined,
    });
    const revenueChannel = await this.resolveRevenueChannelLink({
      workspaceId,
      category,
      telegramChannelId: this.isChannelAdvertisingRevenueCategory(category)
        ? dto.telegramChannelId
        : undefined,
    });

    const exchangeRateToPrimary =
      dto.exchangeRateToPrimary ??
      (await this.resolveRateToPrimary(workspaceId, account.currency));
    const created = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          workspaceId,
          accountId: dto.accountId,
          telegramChannelId: revenueChannel?.id ?? null,
          type: dto.type,
          amount: dto.amount,
          exchangeRateToPrimary,
          amountInPrimaryCurrency: dto.amount * exchangeRateToPrimary,
          date: new Date(dto.date),
          description: dto.description,
          categoryId: category.id,
          category: category.name,
          memberId: dto.memberId,
          currency: account.currency,
          iconId: dto.iconId ?? undefined,
          assignedMemberId,
          createdByUserId: userId,
        },
        include: {
          account: {
            include: {
              assignedMember: WorkspaceService.assignedMemberInclude,
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
          },
          categoryRef: {
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
          },
          telegramChannel: {
            select: {
              id: true,
              title: true,
              username: true,
              photoUrl: true,
            },
          },
          member: { include: { user: true } },
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
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
      await this.syncPurchaseChannelLink(
        tx,
        workspaceId,
        transaction.id,
        purchaseChannel?.id ?? null,
      );
      return transaction;
    });
    const [enriched] = await this.attachPurchasedTelegramChannels(workspaceId, [
      created,
    ]);
    return enriched;
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.financeCategoriesService.ensureSystemCategories(workspaceId);

    const existing = await this.prisma.transaction.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Transaction not found');
    const assignedMemberId = dto.assignedMemberId === undefined ? undefined : (
      await this.workspaceService.resolveAssignedMemberId(userId, dto.assignedMemberId)
    ).assignedMemberId;

    const type = dto.type ?? existing.type;
    const categoryId = dto.categoryId ?? existing.categoryId;
    const memberId =
      dto.memberId === undefined
        ? (existing.memberId ?? undefined)
        : (dto.memberId ?? undefined);

    if (!categoryId) {
      throw new BadRequestException('categoryId is required');
    }

    const category = await this.validateCategoryAndMember(
      workspaceId,
      type,
      categoryId,
      memberId,
    );

    const amount = dto.amount ?? Number(existing.amount);
    const targetAccountId = dto.accountId ?? existing.accountId;
    const account = await this.prisma.account.findFirst({
      where: { id: targetAccountId, workspaceId },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (dto.iconId !== undefined && dto.iconId !== null) {
      const icon = await this.prisma.icon.findFirst({
        where: { id: dto.iconId, workspaceId },
      });
      if (!icon) throw new NotFoundException('Icon not found');
    }
    const purchaseChannel = await this.resolvePurchaseChannelLink({
      workspaceId,
      category,
      telegramChannelId:
        this.isBuyChannelsCategory(category) && dto.telegramChannelId === undefined
          ? (
              await this.findLinkedPurchaseChannelByTransaction(
                workspaceId,
                existing.id,
              )
            )?.id ?? null
          : this.isBuyChannelsCategory(category)
            ? dto.telegramChannelId
            : undefined,
      transactionId: existing.id,
    });
    const revenueChannel = await this.resolveRevenueChannelLink({
      workspaceId,
      category,
      telegramChannelId:
        this.isChannelAdvertisingRevenueCategory(category) &&
        dto.telegramChannelId === undefined
          ? existing.telegramChannelId
          : this.isChannelAdvertisingRevenueCategory(category)
            ? dto.telegramChannelId
            : undefined,
    });

    const rate =
      dto.exchangeRateToPrimary ??
      (await this.resolveRateToPrimary(workspaceId, account.currency));
    const { telegramChannelId: _telegramChannelId, ...transactionDto } = dto;
    const updated = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.update({
        where: { id },
        data: {
          ...transactionDto,
          categoryId: category.id,
          category: category.name,
          telegramChannelId: revenueChannel?.id ?? null,
          memberId,
          date: dto.date ? new Date(dto.date) : undefined,
          amountInPrimaryCurrency: amount * rate,
          iconId: dto.iconId === undefined ? undefined : dto.iconId,
          assignedMemberId,
        },
        include: {
          account: {
            include: {
              assignedMember: WorkspaceService.assignedMemberInclude,
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
          },
          categoryRef: {
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
          },
          telegramChannel: {
            select: {
              id: true,
              title: true,
              username: true,
              photoUrl: true,
            },
          },
          member: { include: { user: true } },
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
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
      await this.syncPurchaseChannelLink(
        tx,
        workspaceId,
        transaction.id,
        purchaseChannel?.id ?? null,
      );
      return transaction;
    });
    const [enriched] = await this.attachPurchasedTelegramChannels(workspaceId, [
      updated,
    ]);
    return enriched;
  }

  async remove(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const existing = await this.prisma.transaction.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Transaction not found');
    return this.prisma.$transaction(async (tx) => {
      await this.syncPurchaseChannelLink(tx, workspaceId, id, null);
      return tx.transaction.delete({ where: { id } });
    });
  }
}
