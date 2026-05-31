import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateInvestmentDto, UpdateInvestmentDto } from './dto';

@Injectable()
export class InvestmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  async findAll(userId: string) {
    const workspaceId = await this.workspace(userId);
    return this.prisma.investment.findMany({
      where: { workspaceId },
      include: {
        workspaceMember: { include: { user: { select: { id: true, name: true, email: true } } } },
        account: true,
        transaction: true,
      },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const row = await this.prisma.investment.findFirst({
      where: { id, workspaceId },
      include: {
        workspaceMember: { include: { user: { select: { id: true, name: true, email: true } } } },
        account: true,
        transaction: true,
      },
    });
    if (!row) throw new NotFoundException('Investment not found');
    return row;
  }

  private resolveRate(rate: number | undefined, accountCurrency: string, primaryCurrency: string) {
    if (accountCurrency === primaryCurrency) return 1;
    if (!rate) throw new BadRequestException('exchangeRateToPrimary is required for non-primary account currency');
    return rate;
  }

  async create(userId: string, dto: CreateInvestmentDto) {
    const workspaceId = await this.workspace(userId);
    const [workspace, workspaceMember, account] = await Promise.all([
      this.prisma.workspace.findFirst({ where: { id: workspaceId } }),
      this.prisma.workspaceMember.findFirst({ where: { id: dto.workspaceMemberId, workspaceId }, include: { user: true } }),
      this.prisma.account.findFirst({ where: { id: dto.accountId, workspaceId } }),
    ]);
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (!workspaceMember) throw new NotFoundException('Workspace member not found');
    if (!account) throw new NotFoundException('Account not found');

    const exchangeRateToPrimary = this.resolveRate(dto.exchangeRateToPrimary, account.currency, workspace.primaryCurrency);
    const amountInPrimaryCurrency = dto.amount * exchangeRateToPrimary;

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          workspaceId,
          accountId: account.id,
          type: 'income',
          category: 'investment',
          amount: dto.amount,
          currency: account.currency,
          amountInPrimaryCurrency,
          exchangeRateToPrimary,
          description: dto.notes || `Investment from ${workspaceMember.user.name}`,
          date: new Date(dto.date),
          createdByUserId: userId,
        },
      });

      return tx.investment.create({
        data: {
          workspaceId,
          workspaceMemberId: workspaceMember.id,
          accountId: account.id,
          transactionId: transaction.id,
          amount: dto.amount,
          currency: account.currency,
          amountInPrimaryCurrency,
          exchangeRateToPrimary,
          date: new Date(dto.date),
          notes: dto.notes,
          createdByUserId: userId,
        },
        include: {
          workspaceMember: { include: { user: { select: { id: true, name: true, email: true } } } },
          account: true,
          transaction: true,
        },
      });
    });
  }

  async update(userId: string, id: string, dto: UpdateInvestmentDto) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.investment.findFirst({
      where: { id, workspaceId },
      include: { workspaceMember: { include: { user: true } } },
    });
    if (!existing) throw new NotFoundException('Investment not found');

    const workspaceMemberId = dto.workspaceMemberId ?? existing.workspaceMemberId;
    const accountId = dto.accountId ?? existing.accountId;

    const [workspace, workspaceMember, account] = await Promise.all([
      this.prisma.workspace.findFirst({ where: { id: workspaceId } }),
      this.prisma.workspaceMember.findFirst({ where: { id: workspaceMemberId, workspaceId }, include: { user: true } }),
      this.prisma.account.findFirst({ where: { id: accountId, workspaceId } }),
    ]);
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (!workspaceMember) throw new NotFoundException('Workspace member not found');
    if (!account) throw new NotFoundException('Account not found');

    const amount = dto.amount ?? Number(existing.amount);
    const exchangeRateToPrimary = this.resolveRate(dto.exchangeRateToPrimary ?? Number(existing.exchangeRateToPrimary), account.currency, workspace.primaryCurrency);
    const amountInPrimaryCurrency = amount * exchangeRateToPrimary;
    const date = dto.date ? new Date(dto.date) : existing.date;
    const notes = dto.notes ?? existing.notes ?? undefined;

    return this.prisma.$transaction(async (tx) => {
      if (existing.transactionId) {
        await tx.transaction.update({
          where: { id: existing.transactionId },
          data: {
            accountId,
            amount,
            currency: account.currency,
            amountInPrimaryCurrency,
            exchangeRateToPrimary,
            description: notes || `Investment from ${workspaceMember.user.name}`,
            date,
          },
        });
      }

      return tx.investment.update({
        where: { id },
        data: {
          workspaceMemberId,
          accountId,
          amount,
          currency: account.currency,
          amountInPrimaryCurrency,
          exchangeRateToPrimary,
          date,
          notes,
        },
        include: {
          workspaceMember: { include: { user: { select: { id: true, name: true, email: true } } } },
          account: true,
          transaction: true,
        },
      });
    });
  }

  async remove(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.investment.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('Investment not found');

    return this.prisma.$transaction(async (tx) => {
      if (existing.transactionId) {
        await tx.transaction.delete({ where: { id: existing.transactionId } });
      }
      return tx.investment.delete({ where: { id } });
    });
  }
}
