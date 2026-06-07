import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateTransferDto, TransferQueryDto, UpdateTransferDto } from './dto';

@Injectable()
export class TransfersService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
  ) {}
  private calc(fromAmount: number, toAmount: number) {
    const exchangeRate = fromAmount > 0 ? toAmount / fromAmount : null;
    const expectedToAmount = exchangeRate ? fromAmount * exchangeRate : null;
    const transferLossAmount =
      expectedToAmount !== null ? expectedToAmount - toAmount : null;
    return { exchangeRate, expectedToAmount, transferLossAmount };
  }
  async findAll(userId: string, query: TransferQueryDto = {}) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const where: Prisma.TransferWhereInput = { workspaceId };
    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const end = new Date(query.dateTo);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    }
    if (query.accountId) {
      where.OR = [
        { fromAccountId: query.accountId },
        { toAccountId: query.accountId },
      ];
    }
    return this.prisma.transfer.findMany({
      where,
      orderBy: { date: query.sort === 'date_asc' ? 'asc' : 'desc' },
      include: { fromAccount: true, toAccount: true },
    });
  }
  async findOne(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const row = await this.prisma.transfer.findFirst({
      where: { id, workspaceId },
      include: { fromAccount: true, toAccount: true },
    });
    if (!row) throw new NotFoundException('Transfer not found');
    return row;
  }
  async create(userId: string, dto: CreateTransferDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const [from, to] = await Promise.all([
      this.prisma.account.findFirst({
        where: { id: dto.fromAccountId, workspaceId },
      }),
      this.prisma.account.findFirst({
        where: { id: dto.toAccountId, workspaceId },
      }),
    ]);
    if (!from || !to) throw new NotFoundException('Account not found');
    const calc = this.calc(dto.fromAmount, dto.toAmount);
    return this.prisma.transfer.create({
      data: {
        ...dto,
        workspaceId,
        date: new Date(dto.date),
        fromCurrency: from.currency,
        toCurrency: to.currency,
        transferLossCurrency: to.currency,
        ...calc,
      },
    });
  }
  async update(userId: string, id: string, dto: UpdateTransferDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const existing = await this.prisma.transfer.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Transfer not found');
    const fromAmount = dto.fromAmount ?? Number(existing.fromAmount);
    const toAmount = dto.toAmount ?? Number(existing.toAmount);
    const calc = this.calc(fromAmount, toAmount);
    return this.prisma.transfer.update({
      where: { id },
      data: {
        ...dto,
        date: dto.date ? new Date(dto.date) : undefined,
        ...calc,
      },
    });
  }
  async remove(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const existing = await this.prisma.transfer.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Transfer not found');
    return this.prisma.transfer.delete({ where: { id } });
  }
}
