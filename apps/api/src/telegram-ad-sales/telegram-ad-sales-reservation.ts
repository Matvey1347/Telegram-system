import { ConflictException } from '@nestjs/common';
import { Prisma, TelegramAdPlacementStatus } from '@prisma/client';
import type { ApplicationLoggerService } from '../application-logs/application-logger.service';

export const ACTIVE_TELEGRAM_AD_PLACEMENT_STATUSES: TelegramAdPlacementStatus[] = [
  TelegramAdPlacementStatus.RESERVED,
  TelegramAdPlacementStatus.SCHEDULED,
  TelegramAdPlacementStatus.PUBLISHED,
  TelegramAdPlacementStatus.COMPLETED,
];

export function telegramAdSalesAdvisoryLockKey(channelId: string, dateKey: string) {
  const source = `${channelId}:${dateKey}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0;
  }
  return hash;
}

export async function assertTelegramAdPlacementConflictFree(
  tx: Prisma.TransactionClient,
  params: {
    workspaceId: string;
    placementId: string;
    channelId: string;
    scheduledAt: Date;
    logger: ApplicationLoggerService;
  },
) {
  const start = new Date(params.scheduledAt.getTime() - 5 * 60 * 60 * 1000);
  const end = new Date(params.scheduledAt.getTime() + 5 * 60 * 60 * 1000);
  const conflict = await tx.telegramAdSalePlacement.findFirst({
    where: {
      workspaceId: params.workspaceId,
      telegramChannelId: params.channelId,
      id: { not: params.placementId },
      status: { in: ACTIVE_TELEGRAM_AD_PLACEMENT_STATUSES },
      scheduledAt: { gte: start, lte: end },
    },
    select: {
      id: true,
      telegramAdSaleId: true,
      scheduledAt: true,
      status: true,
    },
  });
  if (!conflict) return;

  params.logger.info({
    level: 'warn',
    event: 'telegram_ad_sales.reservation_conflict',
    message: `Reservation conflict for channel ${params.channelId}`,
    metadata: {
      channelId: params.channelId,
      requestedAt: params.scheduledAt.toISOString(),
      conflictPlacementId: conflict.id,
    },
  });
  throw new ConflictException({
    code: 'AD_SLOT_CONFLICT',
    message: 'Requested ad slot is already reserved',
    details: {
      channelId: params.channelId,
      requestedAt: params.scheduledAt.toISOString(),
      conflictPlacement: {
        id: conflict.id,
        saleId: conflict.telegramAdSaleId,
        scheduledAt: conflict.scheduledAt.toISOString(),
        status: conflict.status,
      },
    },
  });
}
