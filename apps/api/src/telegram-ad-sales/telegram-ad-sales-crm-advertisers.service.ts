import type {
  TelegramAdCrmAdvertiserListItem,
  TelegramAdCrmAdvertisersListResult,
  TelegramAdCrmFrequencyBucket,
  TelegramAdCrmRecencyBucket,
  TelegramAdCrmRfmSegment,
  TelegramAdCrmUrgency,
} from '@telegram-system/shared';
import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramAdvertiserLifecycleStage,
  TelegramAdvertiserStatus,
  TelegramAdvertiserTaskPriority,
  TelegramAdvertiserTaskStatus,
  TelegramAdSalePaymentStatus,
  TelegramAdSaleStatus,
} from '@prisma/client';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../common/pagination/pagination.utils';
import { iconToResolvedEmoji } from '../common/icons/resolved-emoji';
import { WorkspaceService } from '../common/workspace.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAdvertisersQueryDto } from './dto';
import { decimal, decimalToString } from './domain/decimal';

@Injectable()
export class TelegramAdSalesCrmAdvertisersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private normalizeTelegramUsername(value: string | null | undefined) {
    const cleaned = value?.trim().replace(/^@/, '').toLowerCase();
    return cleaned || null;
  }

  private normalizePhone(value: string | null | undefined) {
    const cleaned = value?.replace(/[^\d+]/g, '').trim();
    return cleaned || null;
  }

  private normalizeEmail(value: string | null | undefined) {
    const cleaned = value?.trim().toLowerCase();
    return cleaned || null;
  }

  private daysSince(value: Date | null | undefined, now: Date) {
    if (!value) return null;
    return Math.max(
      0,
      Math.floor((now.getTime() - value.getTime()) / (24 * 60 * 60 * 1000)),
    );
  }

  private recencyBucket(
    lastPurchaseAt: Date | null | undefined,
    now: Date,
  ): TelegramAdCrmRecencyBucket {
    const days = this.daysSince(lastPurchaseAt, now);
    if (days === null) return 'NONE';
    if (days <= 30) return 'RECENT';
    if (days <= 90) return 'WARM';
    if (days <= 180) return 'COLD';
    return 'DORMANT';
  }

  private frequencyBucket(
    completedSalesCount: number,
    totalSalesCount: number,
  ): TelegramAdCrmFrequencyBucket {
    const count = Math.max(completedSalesCount, totalSalesCount);
    if (count <= 0) return 'NONE';
    if (count === 1) return 'ONE_TIME';
    if (count >= 10) return 'POWER';
    if (count >= 5) return 'LOYAL';
    if (count >= 2) return 'REPEAT';
    return 'POWER';
  }

  private monetaryBucket(monetaryValue: number, highValueThreshold: number) {
    if (highValueThreshold <= 0) return monetaryValue > 0 ? 'HIGH' : 'LOW';
    if (monetaryValue >= highValueThreshold) return 'HIGH';
    if (monetaryValue >= highValueThreshold / 2) return 'MID';
    return 'LOW';
  }

  private rfmSegment(params: {
    status: TelegramAdvertiserStatus;
    completedSalesCount: number;
    recencyBucket: TelegramAdCrmRecencyBucket;
    frequencyBucket: TelegramAdCrmFrequencyBucket;
    monetaryBucket: 'LOW' | 'MID' | 'HIGH';
    lifecycleStage: TelegramAdvertiserLifecycleStage;
  }): TelegramAdCrmRfmSegment {
    if (params.status === TelegramAdvertiserStatus.LOST) return 'LOST';
    if (params.completedSalesCount <= 0) return 'LEAD';
    if (params.recencyBucket === 'DORMANT') return 'DORMANT';
    if (params.recencyBucket === 'COLD') return 'AT_RISK';
    if (
      params.monetaryBucket === 'HIGH' &&
      (params.frequencyBucket === 'POWER' ||
        params.frequencyBucket === 'LOYAL') &&
      (params.recencyBucket === 'RECENT' || params.recencyBucket === 'WARM')
    ) {
      return 'CHAMPION';
    }
    if (
      params.frequencyBucket === 'POWER' ||
      params.frequencyBucket === 'LOYAL' ||
      params.frequencyBucket === 'REPEAT'
    ) {
      return 'LOYAL';
    }
    if (
      params.frequencyBucket === 'ONE_TIME' &&
      params.recencyBucket === 'RECENT'
    ) {
      return 'NEW';
    }
    if (
      params.lifecycleStage === TelegramAdvertiserLifecycleStage.QUALIFIED ||
      params.recencyBucket === 'WARM'
    ) {
      return 'PROMISING';
    }
    return 'LEAD';
  }

  private taskPriorityOffset(priority: TelegramAdvertiserTaskPriority) {
    if (priority === TelegramAdvertiserTaskPriority.URGENT) return 0;
    if (priority === TelegramAdvertiserTaskPriority.HIGH) return 2;
    if (priority === TelegramAdvertiserTaskPriority.NORMAL) return 5;
    return 8;
  }

  private crmPriority(params: {
    segment: TelegramAdCrmRfmSegment;
    nextOpenTask: {
      dueAt: Date;
      priority: TelegramAdvertiserTaskPriority;
    } | null;
    nextContactAt: Date | null;
    now: Date;
  }): { priorityRank: number; urgency: TelegramAdCrmUrgency } {
    const taskDays = this.daysSince(params.nextOpenTask?.dueAt, params.now);
    if (params.nextOpenTask && taskDays !== null) {
      if (params.nextOpenTask.dueAt.getTime() <= params.now.getTime()) {
        return {
          priorityRank:
            1 + this.taskPriorityOffset(params.nextOpenTask.priority),
          urgency: 'HIGH',
        };
      }
      const daysUntilTask = Math.ceil(
        (params.nextOpenTask.dueAt.getTime() - params.now.getTime()) /
          (24 * 60 * 60 * 1000),
      );
      if (daysUntilTask <= 3) {
        return {
          priorityRank:
            10 + this.taskPriorityOffset(params.nextOpenTask.priority),
          urgency: 'HIGH',
        };
      }
      if (daysUntilTask <= 7) {
        return {
          priorityRank:
            25 + this.taskPriorityOffset(params.nextOpenTask.priority),
          urgency: 'MEDIUM',
        };
      }
    }

    if (params.nextContactAt) {
      if (params.nextContactAt.getTime() <= params.now.getTime()) {
        return { priorityRank: 15, urgency: 'HIGH' };
      }
      const daysUntilContact = Math.ceil(
        (params.nextContactAt.getTime() - params.now.getTime()) /
          (24 * 60 * 60 * 1000),
      );
      if (daysUntilContact <= 7) return { priorityRank: 35, urgency: 'MEDIUM' };
    }

    if (params.segment === 'DORMANT')
      return { priorityRank: 45, urgency: 'HIGH' };
    if (params.segment === 'AT_RISK')
      return { priorityRank: 55, urgency: 'MEDIUM' };
    if (params.segment === 'LEAD')
      return { priorityRank: 65, urgency: 'MEDIUM' };
    if (params.segment === 'PROMISING' || params.segment === 'NEW') {
      return { priorityRank: 75, urgency: 'LOW' };
    }
    if (params.segment === 'LOST') return { priorityRank: 95, urgency: 'NONE' };
    return { priorityRank: 85, urgency: 'LOW' };
  }

  private crmAdvertiserSelect(): Prisma.TelegramAdvertiserSelect {
    return {
      id: true,
      displayName: true,
      companyName: true,
      telegramUsername: true,
      status: true,
      lifecycleStage: true,
      completedSalesCount: true,
      totalSalesCount: true,
      totalRevenueInPrimaryCurrency: true,
      averageOrderValueInPrimaryCurrency: true,
      firstPurchaseAt: true,
      lastPurchaseAt: true,
      lastContactAt: true,
      nextContactAt: true,
      contacts: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        take: 1,
        select: {
          id: true,
          type: true,
          value: true,
          label: true,
          isPrimary: true,
        },
      },
      ownerMember: {
        select: {
          id: true,
          avatarIcon: {
            select: {
              id: true,
              type: true,
              name: true,
              emoji: true,
              imageUrl: true,
            },
          },
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      tasks: {
        where: {
          status: {
            in: [
              TelegramAdvertiserTaskStatus.OPEN,
              TelegramAdvertiserTaskStatus.IN_PROGRESS,
            ],
          },
        },
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        take: 1,
        select: {
          id: true,
          title: true,
          dueAt: true,
          priority: true,
          type: true,
          status: true,
        },
      },
    };
  }

  private mapCrmAdvertiser(
    advertiser: any,
    highValueThreshold: number,
    now: Date,
  ): TelegramAdCrmAdvertiserListItem {
    const primaryContact = advertiser.contacts?.[0] ?? null;
    const nextOpenTask = advertiser.tasks?.[0] ?? null;
    const totalRevenue =
      decimalToString(advertiser.totalRevenueInPrimaryCurrency) ?? '0';
    const averageOrderValue =
      decimalToString(advertiser.averageOrderValueInPrimaryCurrency) ?? '0';
    const monetaryValue = Number(totalRevenue);
    const safeMonetaryValue = Number.isFinite(monetaryValue)
      ? monetaryValue
      : 0;
    const recencyBucket = this.recencyBucket(advertiser.lastPurchaseAt, now);
    const frequencyBucket = this.frequencyBucket(
      advertiser.completedSalesCount,
      advertiser.totalSalesCount,
    );
    const monetaryBucket = this.monetaryBucket(
      safeMonetaryValue,
      highValueThreshold,
    );
    const rfmSegment = this.rfmSegment({
      status: advertiser.status,
      lifecycleStage: advertiser.lifecycleStage,
      completedSalesCount: advertiser.completedSalesCount,
      recencyBucket,
      frequencyBucket,
      monetaryBucket,
    });
    const priority = this.crmPriority({
      segment: rfmSegment,
      nextOpenTask,
      nextContactAt: advertiser.nextContactAt ?? null,
      now,
    });

    return {
      id: advertiser.id,
      displayName: advertiser.displayName,
      companyName: advertiser.companyName,
      telegramUsername: advertiser.telegramUsername,
      primaryContact: primaryContact
        ? {
            id: primaryContact.id,
            type: primaryContact.type,
            value: primaryContact.value,
            label: primaryContact.label,
            isPrimary: primaryContact.isPrimary,
          }
        : null,
      ownerMember: advertiser.ownerMember
        ? {
            id: advertiser.ownerMember.id,
            name: advertiser.ownerMember.user.name,
            email: advertiser.ownerMember.user.email,
            avatarPresentation: iconToResolvedEmoji(
              advertiser.ownerMember.avatarIcon,
            ),
          }
        : null,
      status: advertiser.status,
      lifecycleStage: advertiser.lifecycleStage,
      completedSalesCount: advertiser.completedSalesCount,
      totalSalesCount: advertiser.totalSalesCount,
      totalRevenueInPrimaryCurrency: totalRevenue,
      averageOrderValueInPrimaryCurrency: averageOrderValue,
      firstPurchaseAt: advertiser.firstPurchaseAt?.toISOString() ?? null,
      lastPurchaseAt: advertiser.lastPurchaseAt?.toISOString() ?? null,
      lastContactAt: advertiser.lastContactAt?.toISOString() ?? null,
      nextContactAt: advertiser.nextContactAt?.toISOString() ?? null,
      daysSinceLastPurchase: this.daysSince(advertiser.lastPurchaseAt, now),
      recencyBucket,
      frequencyBucket,
      monetaryValue: safeMonetaryValue,
      isHighValue: monetaryBucket === 'HIGH',
      rfmSegment,
      priorityRank: priority.priorityRank,
      urgency: priority.urgency,
      nextOpenTask: nextOpenTask
        ? {
            id: nextOpenTask.id,
            title: nextOpenTask.title,
            dueAt: nextOpenTask.dueAt.toISOString(),
            priority: nextOpenTask.priority,
            type: nextOpenTask.type,
            status: nextOpenTask.status,
          }
        : null,
      lostReason: null,
      lostAt: null,
    };
  }

  private async currentStatsByAdvertiser(
    workspaceId: string,
    advertiserIds: string[],
  ) {
    if (!advertiserIds.length) return new Map<string, Partial<any>>();
    const sales = await this.prisma.telegramAdSale.findMany({
      where: {
        workspaceId,
        advertiserId: { in: advertiserIds },
        status: { not: TelegramAdSaleStatus.CANCELLED },
      },
      select: {
        advertiserId: true,
        status: true,
        createdAt: true,
        placements: { select: { id: true } },
        payments: {
          where: { status: { not: TelegramAdSalePaymentStatus.VOIDED } },
          select: { amountInPrimaryCurrency: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const stats = new Map<
      string,
      {
        totalSalesCount: number;
        completedSalesCount: number;
        totalPlacementsCount: number;
        totalRevenueInPrimaryCurrency: Prisma.Decimal;
        averageOrderValueInPrimaryCurrency: Prisma.Decimal;
        firstPurchaseAt: Date | null;
        lastPurchaseAt: Date | null;
      }
    >();
    for (const sale of sales) {
      if (!sale.advertiserId) continue;
      const current =
        stats.get(sale.advertiserId) ?? {
          totalSalesCount: 0,
          completedSalesCount: 0,
          totalPlacementsCount: 0,
          totalRevenueInPrimaryCurrency: decimal(0),
          averageOrderValueInPrimaryCurrency: decimal(0),
          firstPurchaseAt: null,
          lastPurchaseAt: null,
        };
      current.totalSalesCount += 1;
      current.totalPlacementsCount += sale.placements.length;
      const completed =
        sale.status === TelegramAdSaleStatus.CONFIRMED ||
        sale.status === TelegramAdSaleStatus.IN_PROGRESS ||
        sale.status === TelegramAdSaleStatus.COMPLETED;
      if (completed) {
        current.completedSalesCount += 1;
        current.firstPurchaseAt ??= sale.createdAt;
        current.lastPurchaseAt = sale.createdAt;
      }
      current.totalRevenueInPrimaryCurrency =
        current.totalRevenueInPrimaryCurrency.add(
          sale.payments.reduce(
            (sum, payment) => sum.add(decimal(payment.amountInPrimaryCurrency)),
            decimal(0),
          ),
        );
      stats.set(sale.advertiserId, current);
    }
    for (const value of stats.values()) {
      value.averageOrderValueInPrimaryCurrency = value.totalSalesCount
        ? value.totalRevenueInPrimaryCurrency.div(value.totalSalesCount)
        : decimal(0);
    }
    return stats;
  }

  async listCrmAdvertisers(
    userId: string,
    query: TelegramAdvertisersQueryDto,
  ): Promise<TelegramAdCrmAdvertisersListResult> {
    const workspaceId = await this.workspace(userId);
    const pagination = normalizePagination(query);
    const search = query.search?.trim();
    const where: Prisma.TelegramAdvertiserWhereInput = {
      workspaceId,
      ...(query.archived === true
        ? { archivedAt: { not: null } }
        : query.archived === false
          ? { archivedAt: null }
          : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.lifecycleStage ? { lifecycleStage: query.lifecycleStage } : {}),
      ...(query.ownerMemberId ? { ownerMemberId: query.ownerMemberId } : {}),
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: 'insensitive' } },
              { companyName: { contains: search, mode: 'insensitive' } },
              {
                telegramUsername: {
                  contains: this.normalizeTelegramUsername(search) ?? search,
                  mode: 'insensitive',
                },
              },
              {
                phone: {
                  contains: this.normalizePhone(search) ?? search,
                  mode: 'insensitive',
                },
              },
              {
                email: {
                  contains: this.normalizeEmail(search) ?? search,
                  mode: 'insensitive',
                },
              },
              {
                contacts: {
                  some: {
                    normalizedValue: {
                      contains: search.toLowerCase(),
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const crmSettings =
      await this.prisma.telegramAdCrmWorkspaceSettings.findUnique({
        where: { workspaceId },
        select: { highValueCustomerThreshold: true },
      });
    const highValueThreshold = Number(
      decimalToString(crmSettings?.highValueCustomerThreshold ?? decimal(0)) ??
        '0',
    );
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramAdvertiser.findMany({
        where,
        select: this.crmAdvertiserSelect(),
        orderBy: [
          { nextContactAt: 'asc' },
          { totalRevenueInPrimaryCurrency: 'desc' },
          { updatedAt: 'desc' },
          { id: 'desc' },
        ],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramAdvertiser.count({ where }),
    ]);
    const now = new Date();
    const currentStats = await this.currentStatsByAdvertiser(
      workspaceId,
      items.map((item) => item.id),
    );
    return createPaginatedResponse(
      items.map((item) =>
        this.mapCrmAdvertiser(
          {
            ...item,
            ...(currentStats.get(item.id) ?? {}),
          },
          highValueThreshold,
          now,
        ),
      ),
      totalItems,
      pagination,
    );
  }
}
