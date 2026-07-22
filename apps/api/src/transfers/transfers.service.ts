import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createPaginatedResponse, normalizePagination } from '../common/pagination/pagination.utils';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { CreateTransferDto, TransferQueryDto, UpdateTransferDto } from './dto';

const dec = (value: unknown) => Number(value ?? 0);

@Injectable()
export class TransfersService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
  ) {}

  private rateKey(fromCurrency: string, toCurrency: string) {
    return `${fromCurrency.toUpperCase()}->${toCurrency.toUpperCase()}`;
  }

  private async bestTransferRates(workspaceId: string) {
    const rows = await this.prisma.transfer.groupBy({
      by: ['fromCurrency', 'toCurrency'],
      where: { workspaceId, exchangeRate: { not: null } },
      _max: { exchangeRate: true },
    });

    return new Map(
      rows.map((row) => [
        this.rateKey(row.fromCurrency, row.toCurrency),
        dec(row._max.exchangeRate),
      ]),
    );
  }

  private calc(
    fromAmount: number,
    toAmount: number,
    fromCurrency: string,
    toCurrency: string,
    bestRates: Map<string, number>,
  ) {
    const exchangeRate = fromAmount > 0 ? toAmount / fromAmount : null;
    const knownBestRate = bestRates.get(this.rateKey(fromCurrency, toCurrency));
    const expectedRate = Math.max(knownBestRate ?? 0, exchangeRate ?? 0);
    const expectedToAmount = expectedRate > 0 ? fromAmount * expectedRate : null;
    const transferLossAmount = expectedToAmount !== null
      ? Math.max(expectedToAmount - toAmount, 0)
      : null;
    return { exchangeRate, expectedToAmount, transferLossAmount };
  }

  private async withLosses<T extends {
    fromAmount: unknown;
    toAmount: unknown;
    fromCurrency: string;
    toCurrency: string;
  }>(workspaceId: string, transfers: T[]) {
    const bestRates = await this.bestTransferRates(workspaceId);
    return transfers.map((transfer) => ({
      ...transfer,
      ...this.calc(
        dec(transfer.fromAmount),
        dec(transfer.toAmount),
        transfer.fromCurrency,
        transfer.toCurrency,
        bestRates,
      ),
    }));
  }

  async findAll(userId: string, query: TransferQueryDto = {}) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const where: Prisma.TransferWhereInput = { workspaceId };
    if (query.assignedMemberId)
      where.assignedMemberId = query.assignedMemberId;
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
    const pagination = normalizePagination(query);
    const orderDirection = query.sort === 'date_asc' ? 'asc' : 'desc';
    const [transfers, totalItems] = await this.prisma.$transaction([
      this.prisma.transfer.findMany({
        where,
        orderBy: [{ date: orderDirection }, { id: orderDirection }],
        skip: pagination.skip,
        take: pagination.take,
        include: {
          fromAccount: {
            include: { assignedMember: WorkspaceService.assignedMemberInclude },
          },
          toAccount: {
            include: { assignedMember: WorkspaceService.assignedMemberInclude },
          },
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
        },
      }),
      this.prisma.transfer.count({ where }),
    ]);
    const items = await this.withLosses(workspaceId, transfers);
    return createPaginatedResponse(items, totalItems, pagination);
  }
  async findOne(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const row = await this.prisma.transfer.findFirst({
      where: { id, workspaceId },
      include: { fromAccount: { include: { assignedMember: WorkspaceService.assignedMemberInclude } }, toAccount: { include: { assignedMember: WorkspaceService.assignedMemberInclude } }, assignedMember: WorkspaceService.assignedMemberInclude, createdByUser: WorkspaceService.createdByUserInclude },
    });
    if (!row) throw new NotFoundException('Transfer not found');
    const [transfer] = await this.withLosses(workspaceId, [row]);
    return transfer;
  }
  async create(userId: string, dto: CreateTransferDto) {
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(userId, dto.assignedMemberId);
    const [from, to] = await Promise.all([
      this.prisma.account.findFirst({
        where: { id: dto.fromAccountId, workspaceId },
      }),
      this.prisma.account.findFirst({
        where: { id: dto.toAccountId, workspaceId },
      }),
    ]);
    if (!from || !to) throw new NotFoundException('Account not found');
    const transferDate = new Date(dto.date);
    const bestRates = await this.bestTransferRates(workspaceId);
    const calc = this.calc(
      dto.fromAmount,
      dto.toAmount,
      from.currency,
      to.currency,
      bestRates,
    );
    return this.prisma.transfer.create({
      data: {
        ...dto,
        workspaceId,
        date: transferDate,
        fromCurrency: from.currency,
        toCurrency: to.currency,
        transferLossCurrency: to.currency,
        ...calc,
        assignedMemberId,
        createdByUserId: userId,
      },
      include: { fromAccount: { include: { assignedMember: WorkspaceService.assignedMemberInclude } }, toAccount: { include: { assignedMember: WorkspaceService.assignedMemberInclude } }, assignedMember: WorkspaceService.assignedMemberInclude, createdByUser: WorkspaceService.createdByUserInclude },
    });
  }
  async update(userId: string, id: string, dto: UpdateTransferDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const existing = await this.prisma.transfer.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Transfer not found');
    const assignedMemberId = dto.assignedMemberId === undefined ? undefined : (
      await this.workspaceService.resolveAssignedMemberId(userId, dto.assignedMemberId)
    ).assignedMemberId;
    const fromAccountId = dto.fromAccountId ?? existing.fromAccountId;
    const toAccountId = dto.toAccountId ?? existing.toAccountId;
    const [from, to] = await Promise.all([
      this.prisma.account.findFirst({
        where: { id: fromAccountId, workspaceId },
      }),
      this.prisma.account.findFirst({
        where: { id: toAccountId, workspaceId },
      }),
    ]);
    if (!from || !to) throw new NotFoundException('Account not found');
    const fromAmount = dto.fromAmount ?? Number(existing.fromAmount);
    const toAmount = dto.toAmount ?? Number(existing.toAmount);
    const transferDate = dto.date ? new Date(dto.date) : existing.date;
    const bestRates = await this.bestTransferRates(workspaceId);
    const calc = this.calc(
      fromAmount,
      toAmount,
      from.currency,
      to.currency,
      bestRates,
    );
    return this.prisma.transfer.update({
      where: { id },
      data: {
        ...dto,
        date: dto.date ? transferDate : undefined,
        fromCurrency: from.currency,
        toCurrency: to.currency,
        transferLossCurrency: to.currency,
        ...calc,
        assignedMemberId,
      },
      include: { fromAccount: { include: { assignedMember: WorkspaceService.assignedMemberInclude } }, toAccount: { include: { assignedMember: WorkspaceService.assignedMemberInclude } }, assignedMember: WorkspaceService.assignedMemberInclude, createdByUser: WorkspaceService.createdByUserInclude },
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
