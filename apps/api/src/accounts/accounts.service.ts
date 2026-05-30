import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateAccountDto, UpdateAccountDto } from './dto';

const dec = (value: unknown) => Number(value ?? 0);

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private async withBalances(workspaceId: string, accounts: { id: string; name: string; currency: string; initialBalance: unknown; isActive: boolean; createdAt: Date; updatedAt: Date }[]) {
    const [transactions, outgoingTransfers, incomingTransfers] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['accountId', 'type'],
        where: { workspaceId, accountId: { in: accounts.map((a) => a.id) } },
        _sum: { amount: true },
      }),
      this.prisma.transfer.groupBy({
        by: ['fromAccountId'],
        where: { workspaceId, fromAccountId: { in: accounts.map((a) => a.id) } },
        _sum: { fromAmount: true },
      }),
      this.prisma.transfer.groupBy({
        by: ['toAccountId'],
        where: { workspaceId, toAccountId: { in: accounts.map((a) => a.id) } },
        _sum: { toAmount: true },
      }),
    ]);

    return accounts.map((account) => {
      const incomes = transactions
        .filter((t) => t.accountId === account.id && t.type === 'income')
        .reduce((acc, row) => acc + dec(row._sum.amount), 0);
      const expenses = transactions
        .filter((t) => t.accountId === account.id && t.type === 'expense')
        .reduce((acc, row) => acc + dec(row._sum.amount), 0);
      const outgoing = outgoingTransfers
        .filter((t) => t.fromAccountId === account.id)
        .reduce((acc, row) => acc + dec(row._sum.fromAmount), 0);
      const incoming = incomingTransfers
        .filter((t) => t.toAccountId === account.id)
        .reduce((acc, row) => acc + dec(row._sum.toAmount), 0);

      const balance = dec(account.initialBalance) + incomes - expenses - outgoing + incoming;

      return {
        ...account,
        initialBalance: dec(account.initialBalance),
        calculatedBalance: balance,
      };
    });
  }

  async findAll(userId: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const accounts = await this.prisma.account.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return this.withBalances(workspaceId, accounts);
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const account = await this.prisma.account.findFirst({ where: { id, workspaceId } });
    if (!account) throw new NotFoundException('Account not found');
    return (await this.withBalances(workspaceId, [account]))[0];
  }

  async create(userId: string, dto: CreateAccountDto) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const account = await this.prisma.account.create({
      data: {
        workspaceId,
        name: dto.name,
        currency: dto.currency,
        initialBalance: dto.initialBalance,
      },
    });
    return account;
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const account = await this.prisma.account.findFirst({ where: { id, workspaceId } });
    if (!account) throw new NotFoundException('Account not found');

    return this.prisma.account.update({
      where: { id },
      data: dto,
    });
  }

  async remove(userId: string, id: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const account = await this.prisma.account.findFirst({ where: { id, workspaceId } });
    if (!account) throw new NotFoundException('Account not found');

    return this.prisma.account.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
