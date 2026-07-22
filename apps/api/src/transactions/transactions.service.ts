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
    return createPaginatedResponse(items, totalItems, pagination);
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
    return row;
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
    const exchangeRateToPrimary =
      dto.exchangeRateToPrimary ??
      (await this.resolveRateToPrimary(workspaceId, account.currency));

    return this.prisma.transaction.create({
      data: {
        workspaceId,
        accountId: dto.accountId,
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
    const rate =
      dto.exchangeRateToPrimary ??
      (await this.resolveRateToPrimary(workspaceId, account.currency));

    return this.prisma.transaction.update({
      where: { id },
      data: {
        ...dto,
        categoryId: category.id,
        category: category.name,
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
  }

  async remove(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const existing = await this.prisma.transaction.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Transaction not found');
    return this.prisma.transaction.delete({ where: { id } });
  }
}
