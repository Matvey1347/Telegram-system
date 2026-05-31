import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateTransactionDto, UpdateTransactionDto } from './dto';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
  ) {}

  async findAll(userId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    return this.prisma.transaction.findMany({
      where: { workspaceId },
      orderBy: { date: 'desc' },
      include: { account: true },
    });
  }
  async findOne(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const row = await this.prisma.transaction.findFirst({
      where: { id, workspaceId },
      include: { account: true },
    });
    if (!row) throw new NotFoundException('Transaction not found');
    return row;
  }
  async create(userId: string, dto: CreateTransactionDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, workspaceId },
    });
    if (!account) throw new NotFoundException('Account not found');
    return this.prisma.transaction.create({
      data: {
        ...dto,
        workspaceId,
        date: new Date(dto.date),
        currency: account.currency,
        amountInPrimaryCurrency: dto.amount * dto.exchangeRateToPrimary,
      },
    });
  }
  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const existing = await this.prisma.transaction.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Transaction not found');
    const amount = dto.amount ?? Number(existing.amount);
    const rate =
      dto.exchangeRateToPrimary ?? Number(existing.exchangeRateToPrimary);
    return this.prisma.transaction.update({
      where: { id },
      data: {
        ...dto,
        date: dto.date ? new Date(dto.date) : undefined,
        amountInPrimaryCurrency: amount * rate,
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
