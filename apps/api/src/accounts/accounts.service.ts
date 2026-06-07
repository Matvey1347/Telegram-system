import { Injectable, NotFoundException } from '@nestjs/common';
import { CurrencyConversionService } from '../common/currency-conversion.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateAccountDto, UpdateAccountDto } from './dto';

const dec = (value: unknown) => Number(value ?? 0);

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly conversionService: CurrencyConversionService,
  ) {}

  private async withBalances(
    workspaceId: string,
    accounts: {
      id: string;
      name: string;
      currency: string;
      initialBalance: unknown;
      isActive: boolean;
      iconId?: string | null;
      icon?: {
        id: string;
        type: 'emoji' | 'image';
        name: string;
        emoji?: string | null;
        imageUrl?: string | null;
      } | null;
      createdAt: Date;
      updatedAt: Date;
    }[],
  ) {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { primaryCurrency: true, secondaryCurrency: true },
    });
    const [transactions, outgoingTransfers, incomingTransfers] =
      await Promise.all([
        this.prisma.transaction.groupBy({
          by: ['accountId', 'type'],
          where: { workspaceId, accountId: { in: accounts.map((a) => a.id) } },
          _sum: { amount: true },
        }),
        this.prisma.transfer.groupBy({
          by: ['fromAccountId'],
          where: {
            workspaceId,
            fromAccountId: { in: accounts.map((a) => a.id) },
          },
          _sum: { fromAmount: true },
        }),
        this.prisma.transfer.groupBy({
          by: ['toAccountId'],
          where: {
            workspaceId,
            toAccountId: { in: accounts.map((a) => a.id) },
          },
          _sum: { toAmount: true },
        }),
      ]);

    return Promise.all(
      accounts.map(async (account) => {
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

        const balance =
          dec(account.initialBalance) +
          incomes -
          expenses -
          outgoing +
          incoming;
        const convertedCurrency =
          account.currency !== workspace.primaryCurrency
            ? workspace.primaryCurrency
            : workspace.secondaryCurrency;
        const convertedBalance = await this.conversionService.convertCurrency(
          balance,
          account.currency,
          convertedCurrency,
          workspaceId,
        );

        return {
          ...account,
          initialBalance: dec(account.initialBalance),
          balance,
          calculatedBalance: balance,
          convertedBalance,
          convertedCurrency,
        };
      }),
    );
  }

  async findAll(userId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const accounts = await this.prisma.account.findMany({
      where: { workspaceId },
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
      orderBy: { createdAt: 'desc' },
    });
    return this.withBalances(workspaceId, accounts);
  }

  async findOne(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const account = await this.prisma.account.findFirst({
      where: { id, workspaceId },
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
    if (!account) throw new NotFoundException('Account not found');
    return (await this.withBalances(workspaceId, [account]))[0];
  }

  async create(userId: string, dto: CreateAccountDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    if (dto.iconId !== undefined && dto.iconId !== null) {
      const icon = await this.prisma.icon.findFirst({
        where: { id: dto.iconId, workspaceId },
      });
      if (!icon) throw new NotFoundException('Icon not found');
    }
    const account = await this.prisma.account.create({
      data: {
        workspaceId,
        name: dto.name,
        currency: dto.currency,
        initialBalance: dto.initialBalance,
        isActive: dto.isActive ?? true,
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
    return account;
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const account = await this.prisma.account.findFirst({
      where: { id, workspaceId },
    });
    if (!account) throw new NotFoundException('Account not found');

    if (dto.iconId !== undefined && dto.iconId !== null) {
      const icon = await this.prisma.icon.findFirst({
        where: { id: dto.iconId, workspaceId },
      });
      if (!icon) throw new NotFoundException('Icon not found');
    }

    return this.prisma.account.update({
      where: { id },
      data: {
        ...dto,
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
  }

  async remove(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const account = await this.prisma.account.findFirst({
      where: { id, workspaceId },
    });
    if (!account) throw new NotFoundException('Account not found');

    return this.prisma.account.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
