import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateTransactionDto, UpdateTransactionDto } from './dto';
import { FinanceCategoriesService } from '../finance-categories/finance-categories.service';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
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
    if (workspace.primaryCurrency === fromCurrency) return 1;

    const direct = await this.prisma.exchangeRate.findFirst({
      where: {
        workspaceId,
        baseCurrency: fromCurrency as any,
        targetCurrency: workspace.primaryCurrency,
      },
      orderBy: { date: 'desc' },
    });
    if (direct?.rate) return Number(direct.rate);

    const inverse = await this.prisma.exchangeRate.findFirst({
      where: {
        workspaceId,
        baseCurrency: workspace.primaryCurrency,
        targetCurrency: fromCurrency as any,
      },
      orderBy: { date: 'desc' },
    });
    if (inverse?.rate) return 1 / Number(inverse.rate);

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
    const category = await (this.prisma as any).transactionCategory.findFirst({
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

  async findAll(userId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.financeCategoriesService.ensureSystemCategories(workspaceId);
    return (this.prisma as any).transaction.findMany({
      where: { workspaceId },
      orderBy: { date: 'desc' },
      include: { account: true, categoryRef: true, member: { include: { user: true } } },
    });
  }

  async findOne(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const row = await (this.prisma as any).transaction.findFirst({
      where: { id, workspaceId },
      include: { account: true, categoryRef: true, member: { include: { user: true } } },
    });
    if (!row) throw new NotFoundException('Transaction not found');
    return row;
  }

  async create(userId: string, dto: CreateTransactionDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
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
    const exchangeRateToPrimary =
      dto.exchangeRateToPrimary ??
      (await this.resolveRateToPrimary(workspaceId, account.currency));

    return (this.prisma as any).transaction.create({
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
      },
      include: { account: true, categoryRef: true, member: { include: { user: true } } },
    });
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.financeCategoriesService.ensureSystemCategories(workspaceId);

    const existing = await (this.prisma as any).transaction.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Transaction not found');

    const type = (dto.type ?? existing.type) as 'income' | 'expense';
    const categoryId = dto.categoryId ?? existing.categoryId;
    const memberId = dto.memberId === undefined ? existing.memberId ?? undefined : dto.memberId;

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
    const rate =
      dto.exchangeRateToPrimary ??
      (await this.resolveRateToPrimary(workspaceId, account.currency));

    return (this.prisma as any).transaction.update({
      where: { id },
      data: {
        ...dto,
        categoryId: category.id,
        category: category.name,
        memberId,
        date: dto.date ? new Date(dto.date) : undefined,
        amountInPrimaryCurrency: amount * rate,
      },
      include: { account: true, categoryRef: true, member: { include: { user: true } } },
    });
  }

  async remove(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const existing = await (this.prisma as any).transaction.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Transaction not found');
    return (this.prisma as any).transaction.delete({ where: { id } });
  }
}
